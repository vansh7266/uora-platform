# UORA Manual Test Guide

Use this guide to verify UORA locally after a clean pull or after frontend/backend
changes. The commands assume the repository is checked out at
`/Users/vanshgupta/Desktop/uora`.

## 1. Start The Platform

```bash
cd /Users/vanshgupta/Desktop/uora
cp .env.example .env
$EDITOR .env
docker compose up -d
cd uora/leaderboard
npm run build
npm run start
```

Open:

- Dashboard: `http://localhost:3000/dashboard`
- Entry screen: `http://localhost:3000`
- API health: `http://localhost:8000/health`

Expected:

- `docker compose ps` shows Redis, TimescaleDB, MinIO, BuildKit, builder, ingester, Envoy, registry, and submission running.
- `curl http://localhost:8000/health` returns `{"status":"ok","service":"submission","version":"2.0.0"}`.
- The dashboard loads without a Next.js error overlay.

## 2. Check Auth

1. Open `http://localhost:3000/auth`.
2. Choose **Sign Up**.
3. Use a real email format and a password with at least 10 characters.
4. Submit the form.
5. Confirm you are redirected to the dashboard.

Expected:

- The user badge shows local initials, not a broken remote avatar.
- A real signup does not create fake leaderboard rows.
- Leaderboard rows appear only when a real benchmark produces scores.

## 3. Check Live Leaderboard Stream

After a benchmark has completed, stream leaderboard events:

```bash
curl -N --max-time 8 http://localhost:3000/api/leaderboard
```

Expected:

- The stream contains typed `leaderboard` events.
- Each leaderboard entry has `p50_latency_ms`, `p90_latency_ms`, `p99_latency_ms`, `throughput_rps`, `success_rate`, `correctness_rate`, `anomaly_score`, and `status`.

## 4. Submit A Dummy Engine

Use the included C++ engine:

```text
/Users/vanshgupta/Desktop/uora/examples/dummy_matching_engine.cpp
```

Dashboard path:

1. Open `http://localhost:3000/dashboard`.
2. Sign in if needed.
3. Open the **Submit** tab.
4. Upload `examples/dummy_matching_engine.cpp`.
5. Submit for benchmarking.
6. Watch the recent submission pipeline.

API path:

```bash
curl -i -X POST http://localhost:8000/api/v1/submit \
  -b "uora_session=<paste-session-cookie>" \
  -F "language=cpp" \
  -F "file=@/Users/vanshgupta/Desktop/uora/examples/dummy_matching_engine.cpp"
```

Expected:

- The API returns HTTP `202` with a `submission_id`.
- Redis receives a build job.
- The builder compiles the C++ source into a container image and pushes it to the local registry.
- With Kubernetes enabled and UORA manifests applied, the builder deploys the contestant runtime service.

Local note:

- The build stage runs in Docker Compose.
- The deploy stage requires a working Kubernetes context because the production runtime target is Kubernetes + gVisor.
- If Kubernetes is not enabled locally, the submission can build but deployment status may become `failed` with a `kubectl` error.

## 5. Run Backend Validation Tests

```bash
cd /Users/vanshgupta/Desktop/uora
python3 -m pytest \
  uora/validator/reference_lob.py \
  uora/validator/diff_engine.py \
  uora/telemetry/ingester.py \
  uora/scoring/engine.py -q

python3 uora/ml_detector/detector.py
python3 uora/validator/diff_engine.py
```

Expected:

- Pytest passes.
- ML detector reports normal/anomalous cases.
- Validator self-test reports no unexpected violations.

## 6. Run Integration Test

Start the reference engine:

```bash
cd /Users/vanshgupta/Desktop/uora
PYTHONPATH=/Users/vanshgupta/Desktop/uora \
python3 contestant_sdk/python/reference_server.py
```

In another terminal:

```bash
cd /Users/vanshgupta/Desktop/uora
PYTHONPATH=/Users/vanshgupta/Desktop/uora python3 test_integration.py
```

Expected:

- The bot load test completes.
- Success rate remains high.
- Validator reports zero correctness violations.

## 7. Stop Everything

```bash
cd /Users/vanshgupta/Desktop/uora
docker compose stop
pkill -f "next start"
pkill -f "reference_server.py"
```
