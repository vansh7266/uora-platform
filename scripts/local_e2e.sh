#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# UORA — Local end-to-end verification (REAL pipeline, real data).
#
# Brings up the two real data dependencies (TimescaleDB/PostgreSQL + Redis),
# then runs the genuine pipeline as local processes:
#
#   reference engine (the deployed-contestant stand-in)
#        │  real HTTP order flow
#        ▼
#   benchmark worker  ──►  real async bot fleet  ──►  L1–L4 CorrectnessValidator
#        │                                              │
#        │  real latencies + responses                  │ real composite score
#        ▼                                              ▼
#   PostgreSQL (benchmark_scores)  ◄────────────  ScoringEngine.compute_score
#        │
#        ▼
#   FastAPI backend  ──►  /api/v1/leaderboard (SSE)  ──►  verified here
#
# Infra: uses Docker (timescaledb + redis containers) when the daemon is up;
# otherwise falls back to a local PostgreSQL + Redis (Homebrew). The schema
# degrades gracefully on plain PostgreSQL (hypertable/continuous-aggregate
# skipped) — see uora/telemetry/migrations.py.
#
# The only parts NOT exercised are BuildKit compile + gVisor/K8s deploy, which
# need Linux/cloud infra; the reference engine substitutes for the deployed
# container so everything downstream of it runs for real.
#
# Usage:   bash scripts/local_e2e.sh
# Env:     KEEP_INFRA=0            stop infra on exit (default: leave running)
#          BENCHMARK_DURATION_SEC  benchmark window (default 6)
#          REFERENCE_ENGINE_PORT   reference engine port (default 8081)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
# Pin the interpreter that has the project deps installed (don't let a
# Homebrew python on PATH shadow it). pg/redis CLIs are already on PATH.
PYTHON="${UORA_PYTHON:-$(command -v python3)}"

# ── config / env ─────────────────────────────────────────────────────────────
set -a
[ -f .env ] && . ./.env
set +a
export REDIS_HOST=127.0.0.1 REDIS_PORT=6379
export TIMESCALE_HOST=127.0.0.1 TIMESCALE_PORT=5432
export TIMESCALE_USER="${TIMESCALE_USER:-uora}"
export TIMESCALE_DB="${TIMESCALE_DB:-uora_metrics}"
export BENCHMARK_DURATION_SEC="${BENCHMARK_DURATION_SEC:-6}"
export BENCHMARK_WORKER_COUNT="${BENCHMARK_WORKER_COUNT:-25}"
export REFERENCE_ENGINE_PORT="${REFERENCE_ENGINE_PORT:-8081}"
RP="${REDIS_PASSWORD:-}"
PGDATA_DIR="${UORA_PGDATA:-/tmp/uora_pgdata}"

PIDS=()
cleanup() {
  echo "[e2e] cleaning up local processes…"
  for pid in "${PIDS[@]:-}"; do kill "$pid" 2>/dev/null || true; done
  if [ "${KEEP_INFRA:-1}" = "0" ]; then
    echo "[e2e] stopping infra…"
    if [ "${USE_DOCKER:-0}" = "1" ]; then
      docker compose stop timescaledb redis >/dev/null 2>&1 || true
    else
      pg_ctl -D "$PGDATA_DIR" stop >/dev/null 2>&1 || true
      redis-cli -h 127.0.0.1 -p 6379 -a "$RP" shutdown nosave >/dev/null 2>&1 || true
    fi
  fi
}
trap cleanup EXIT
say() { echo "[e2e] $*"; }

# ── 1. infra ─────────────────────────────────────────────────────────────────
USE_DOCKER=0
if docker info >/dev/null 2>&1; then USE_DOCKER=1; fi

if [ "$USE_DOCKER" = "1" ]; then
  say "Docker detected — starting TimescaleDB + Redis containers…"
  docker compose up -d timescaledb redis
  say "waiting for Redis…"
  until docker compose exec -T redis redis-cli -a "$RP" ping 2>/dev/null | grep -q PONG; do sleep 1; done
  say "waiting for TimescaleDB…"
  until docker compose exec -T timescaledb pg_isready -U "$TIMESCALE_USER" -d "$TIMESCALE_DB" >/dev/null 2>&1; do sleep 1; done
else
  say "Docker unavailable — using local PostgreSQL + Redis (Homebrew)."
  # PostgreSQL
  if [ ! -d "$PGDATA_DIR" ]; then
    say "initializing PostgreSQL cluster at $PGDATA_DIR…"
    initdb -D "$PGDATA_DIR" -U "$TIMESCALE_USER" -A trust >/tmp/uora_initdb.log 2>&1
  fi
  if ! pg_isready -h 127.0.0.1 -p 5432 -U "$TIMESCALE_USER" >/dev/null 2>&1; then
    say "starting PostgreSQL…"
    pg_ctl -D "$PGDATA_DIR" -o "-p 5432 -k /tmp -c listen_addresses=127.0.0.1" -l /tmp/uora_pg.log start
  fi
  until pg_isready -h 127.0.0.1 -p 5432 -U "$TIMESCALE_USER" >/dev/null 2>&1; do sleep 1; done
  createdb -h 127.0.0.1 -p 5432 -U "$TIMESCALE_USER" "$TIMESCALE_DB" 2>/dev/null || true
  # Redis
  if ! redis-cli -h 127.0.0.1 -p 6379 -a "$RP" ping 2>/dev/null | grep -q PONG; then
    say "starting Redis…"
    redis-server --port 6379 --bind 127.0.0.1 --requirepass "$RP" \
      --daemonize yes --logfile /tmp/uora_redis.log --dir /tmp
  fi
  until redis-cli -h 127.0.0.1 -p 6379 -a "$RP" ping 2>/dev/null | grep -q PONG; do sleep 1; done
fi
say "infra ready."

# ── 2. reference engine (deployed-contestant stand-in) ───────────────────────
REF_PORT="$REFERENCE_ENGINE_PORT"
say "starting reference engine on :$REF_PORT…"
PORT="$REF_PORT" "$PYTHON" contestant_sdk/python/reference_server.py >/tmp/uora_refengine.log 2>&1 &
PIDS+=($!)
until curl -sf "http://localhost:$REF_PORT/health" >/dev/null 2>&1; do sleep 0.5; done
say "reference engine healthy."

# ── 3. FastAPI backend (:8000) ───────────────────────────────────────────────
say "starting FastAPI backend on :8000…"
"$PYTHON" -m uvicorn uora.submission.main:app --host 0.0.0.0 --port 8000 \
  >/tmp/uora_backend.log 2>&1 &
PIDS+=($!)
until curl -sf http://localhost:8000/health >/dev/null 2>&1; do sleep 0.5; done
say "backend healthy."

# ── 4. benchmark worker ──────────────────────────────────────────────────────
say "starting benchmark worker…"
"$PYTHON" -m uora.benchmark.worker >/tmp/uora_worker.log 2>&1 &
PIDS+=($!)
sleep 3   # let it create the consumer group

# ── 5. enqueue a real benchmark job → reference engine ───────────────────────
SUB_ID="e2e-$(date +%s)"
say "enqueueing benchmark job: $SUB_ID"
REDIS_PASSWORD="$RP" SUB_ID="$SUB_ID" REF_PORT="$REF_PORT" "$PYTHON" - <<'PY'
import os, asyncio, redis.asyncio as redis
async def main():
    r = redis.Redis(host="127.0.0.1", port=6379,
                    password=os.getenv("REDIS_PASSWORD") or None, decode_responses=True)
    sid = os.environ["SUB_ID"]
    await r.hset(f"submission:{sid}", mapping={
        "team": "Reference Engine", "language": "python", "status": "queued"})
    await r.xadd("benchmark_queue", {
        "submission_id": sid,
        "target_url": f"http://localhost:{os.environ['REF_PORT']}",
        "language": "python", "protocol": "REST"})
    print(f"[enqueue] benchmark_queue += {sid}")
asyncio.run(main())
PY

# ── 6. wait for the worker to score it ───────────────────────────────────────
say "waiting for benchmark → validate → score…"
STATUS=""
for _ in $(seq 1 90); do
  STATUS=$(REDIS_PASSWORD="$RP" SUB_ID="$SUB_ID" "$PYTHON" - <<'PY'
import os, asyncio, redis.asyncio as redis
async def main():
    r = redis.Redis(host="127.0.0.1", port=6379,
                    password=os.getenv("REDIS_PASSWORD") or None, decode_responses=True)
    d = await r.hgetall(f"submission:{os.environ['SUB_ID']}")
    print(d.get("status", ""))
asyncio.run(main())
PY
)
  echo "      status=${STATUS:-<none>}"
  [ "$STATUS" = "scored" ] && break
  if [ "$STATUS" = "failed" ]; then
    echo "[e2e] ❌ benchmark FAILED — worker log tail:"; grep -v "Progress:" /tmp/uora_worker.log | tail -30; exit 1
  fi
  sleep 2
done
[ "$STATUS" = "scored" ] || { echo "[e2e] ❌ timed out; worker log:"; grep -v "Progress:" /tmp/uora_worker.log | tail -30; exit 1; }
say "scored ✅"

# ── 7. verify the live SSE leaderboard carries the real measured entry ───────
say "reading live leaderboard SSE (/api/v1/leaderboard)…"
curl -sN --max-time 6 http://localhost:8000/api/v1/leaderboard > /tmp/uora_sse.txt || true
head -c 1400 /tmp/uora_sse.txt; echo
if grep -q "$SUB_ID" /tmp/uora_sse.txt; then
  say "✅ REAL measured entry present in live leaderboard."
else
  echo "[e2e] ❌ entry $SUB_ID not found in SSE output"; exit 1
fi

say "DONE — real end-to-end verified."
say "Logs: /tmp/uora_refengine.log /tmp/uora_backend.log /tmp/uora_worker.log"
[ "${KEEP_INFRA:-1}" = "1" ] && say "Infra left running (KEEP_INFRA=0 to stop)."
