"""Redis-backed benchmark, validation, and scoring worker."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import signal
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

try:
    import asyncpg
except ImportError:  # pragma: no cover - minimal local test environments
    asyncpg = None

try:
    import redis.asyncio as aioredis
except ImportError:  # pragma: no cover - minimal local test environments
    class _RedisFallback:
        class ResponseError(Exception):
            pass

        class ConnectionError(Exception):
            pass

        Redis = None

    aioredis = _RedisFallback()

from uora.benchmark.contracts import assert_benchmark_succeeded
from uora.bot_fleet.coordinator import BotCoordinator
from uora.bot_fleet.lobster_parser import parse_lobster_csv
from uora.scoring.engine import ScoringEngine
from uora.telemetry.migrations import ensure_timescale_schema
from uora.validator.diff_engine import CorrectnessValidator


logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("uora.benchmark.worker")


REDIS_HOST = os.getenv("REDIS_HOST", "redis")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD") or None

DB_HOST = os.getenv("TIMESCALE_HOST", os.getenv("DB_HOST", "timescaledb"))
DB_PORT = int(os.getenv("TIMESCALE_PORT", os.getenv("DB_PORT", "5432")))
DB_USER = os.getenv("TIMESCALE_USER", os.getenv("DB_USER", "uora"))
DB_PASSWORD = os.getenv("TIMESCALE_PASSWORD", os.getenv("DB_PASSWORD")) or None
DB_NAME = os.getenv("TIMESCALE_DB", os.getenv("DB_NAME", "uora_metrics"))

STREAM_NAME = "benchmark_queue"
CONSUMER_GROUP = "benchmarkers"
CONSUMER_ID = f"bench-{uuid.uuid4().hex[:8]}"
BLOCK_MS = 5000

SCENARIO_FILE = Path(os.getenv("SCENARIO_FILE", "data/lobster/sample_actions.json"))
WORKER_COUNT = int(os.getenv("BENCHMARK_WORKER_COUNT", os.getenv("WORKER_COUNT", "50")))
DURATION_SEC = int(os.getenv("BENCHMARK_DURATION_SEC", os.getenv("DURATION_SEC", "10")))
MIN_SUCCESS_RATE = float(os.getenv("BENCHMARK_MIN_SUCCESS_RATE", "0.01"))


def require_setting(name: str, value: str | None) -> str:
    if not value:
        raise RuntimeError(f"{name} must be set in the environment")
    return value


def load_actions(path: Path = SCENARIO_FILE) -> list[dict[str, Any]]:
    if not path.exists():
        raise FileNotFoundError(f"Scenario file not found: {path}")
    if path.suffix.lower() == ".json":
        data = json.loads(path.read_text())
        if not isinstance(data, list):
            raise ValueError("Scenario JSON must contain a list of actions")
        return data
    return parse_lobster_csv(str(path))


class BenchmarkWorker:
    def __init__(self) -> None:
        self._redis: Optional[Any] = None
        self._db_pool: Optional[Any] = None
        self._running = False

    async def start(self) -> None:
        if aioredis.Redis is None:
            raise RuntimeError("redis is required for benchmark queue access")
        if asyncpg is None:
            raise RuntimeError("asyncpg is required for benchmark scoring")

        self._redis = aioredis.Redis(
            host=REDIS_HOST,
            port=REDIS_PORT,
            password=require_setting("REDIS_PASSWORD", REDIS_PASSWORD),
            decode_responses=True,
            max_connections=10,
        )
        await self._redis.ping()

        try:
            await self._redis.xgroup_create(
                name=STREAM_NAME,
                groupname=CONSUMER_GROUP,
                id="0",
                mkstream=True,
            )
        except aioredis.ResponseError as exc:
            if "BUSYGROUP" not in str(exc).upper():
                raise

        self._db_pool = await asyncpg.create_pool(
            host=DB_HOST,
            port=DB_PORT,
            user=DB_USER,
            password=require_setting("TIMESCALE_PASSWORD", DB_PASSWORD),
            database=DB_NAME,
            min_size=1,
            max_size=5,
        )
        async with self._db_pool.acquire() as conn:
            await ensure_timescale_schema(conn)

        self._running = True
        logger.info("BenchmarkWorker ready as %s", CONSUMER_ID)

    async def shutdown(self) -> None:
        self._running = False
        if self._redis:
            await self._redis.aclose()
        if self._db_pool:
            await self._db_pool.close()

    @staticmethod
    def _json_default(obj: Any) -> Any:
        """Coerce non-native values (numpy scalars, sets) so a publish can never
        crash the pipeline on a stray type. numpy scalars expose ``.item()``."""
        if hasattr(obj, "item"):
            return obj.item()
        if isinstance(obj, (set, frozenset)):
            return list(obj)
        return str(obj)

    async def _publish(self, payload: dict[str, Any]) -> None:
        assert self._redis is not None
        await self._redis.publish(
            "uora:leaderboard:updates",
            json.dumps(payload, default=self._json_default),
        )

    async def _update_status(self, submission_id: str, status: str, **extra: Any) -> None:
        assert self._redis is not None
        timestamp = datetime.now(timezone.utc).isoformat()
        fields = {
            "status": status,
            "updated_at": timestamp,
            f"{status}_at": timestamp,
            **{k: str(v) for k, v in extra.items() if v is not None},
        }
        await self._redis.hset(f"submission:{submission_id}", mapping=fields)
        await self._publish({
            "type": "submission_status",
            "submission_id": submission_id,
            "status": status,
            "updated_at": timestamp,
            **extra,
        })

    async def _new_db_pool(self) -> Any:
        return await asyncpg.create_pool(
            host=DB_HOST, port=DB_PORT, user=DB_USER,
            password=require_setting("TIMESCALE_PASSWORD", DB_PASSWORD),
            database=DB_NAME, min_size=1, max_size=5,
        )

    async def _ensure_db_pool(self) -> None:
        """Recreate the worker's pool if it's missing or closed. A long-running worker
        reuses one pool across jobs; if anything closes it, later jobs would fail with
        'pool is closed' until restart. Self-heal instead."""
        closed = (
            self._db_pool is None
            or getattr(self._db_pool, "_closed", False)
            or self._db_pool.is_closing()
        )
        if closed:
            self._db_pool = await self._new_db_pool()

    async def _db_execute(self, fn) -> None:
        """Acquire a connection and run ``fn(conn)``, recreating the pool once if it
        turns out to be closed at acquire time (the state checks above don't always
        catch every closed-pool variant on macOS / asyncpg)."""
        await self._ensure_db_pool()
        try:
            async with self._db_pool.acquire() as conn:
                await fn(conn)
        except Exception as exc:
            if "pool is closed" in str(exc).lower() or "interface" in type(exc).__name__.lower():
                logger.warning("DB pool was closed mid-job — recreating and retrying once")
                self._db_pool = await self._new_db_pool()
                async with self._db_pool.acquire() as conn:
                    await fn(conn)
            else:
                raise

    async def _record_latency_events(self, submission_id: str, records: list[dict[str, Any]]) -> None:
        rows = [
            (
                submission_id,
                str(record.get("worker_id", "")),
                str(record.get("result", {}).get("order_id") or record.get("action", {}).get("order_id") or ""),
                str(record.get("action", {}).get("type", "order")),
                int(record.get("latency_ns", 0) or 0),
                int(record.get("result", {}).get("status_code", 200) or 200),
                bool(record.get("success", True)),
            )
            for record in records
        ]

        async def _do(conn):
            await conn.executemany(
                """
                INSERT INTO latency_events (
                    time, submission_id, bot_id, order_id, endpoint,
                    latency_ns, status_code, success
                )
                VALUES (NOW(), $1, $2, $3, $4, $5, $6, $7)
                """,
                rows,
            )

        await self._db_execute(_do)

    async def _record_validation(self, submission_id: str, report: dict[str, Any]) -> None:
        violation_rows = [
            (
                submission_id,
                int(violation["level"]),
                str(violation["order_id"]),
                json.dumps(violation["expected"], default=str),
                json.dumps(violation["actual"], default=str),
                str(violation["description"]),
            )
            for violation in report["violations"]
        ]

        async def _do(conn):
            await conn.execute(
                """
                INSERT INTO validation_results (
                    time, submission_id, correctness_rate, total_actions, violations_count
                )
                VALUES (NOW(), $1, $2, $3, $4)
                """,
                submission_id,
                float(report["correctness_rate"]),
                int(report["total_actions"]),
                int(report["violations_count"]),
            )
            if violation_rows:
                await conn.executemany(
                    """
                    INSERT INTO correctness_violations (
                        time, submission_id, level, order_id, expected, actual, description
                    )
                    VALUES (NOW(), $1, $2, $3, $4::jsonb, $5::jsonb, $6)
                    """,
                    violation_rows,
                )

        await self._db_execute(_do)

    @staticmethod
    def _build_features(
        submission_id: str,
        results: dict[str, Any],
        attempted_actions: list[dict[str, Any]],
        contestant_responses: list[dict[str, Any]],
        clean_latencies: Optional[list[int]] = None,
    ) -> Optional[Any]:
        """Extract the 8-feature anomaly vector from a completed benchmark run.

        Done in the worker because pattern_correlation and state_transition_ged need the
        full action/response stream, which the scoring engine (DB-only) does not have.
        Best-effort: returns None on failure so scoring falls back to latency-only features.

        Feature sourcing (each from the pass that gives the cleanest signal):
          • latency_entropy / p99_to_p50_ratio / latency_trend_slope → CLEAN
            single-threaded correctness-pass latencies. The concurrent run's tail on a
            co-located host is confounded by client-side scheduling.
          • throughput_variance / error_rate → CONCURRENT run. The clean pass is too
            short to produce a meaningful time-bucketed throughput series (it collapses
            to ~0, which sits outside the model's healthy manifold and spuriously flags
            a good engine), so throughput stats must come from the real load run.
          • pattern_correlation / volume_conservation / state_transition_ged → action and
            response streams.
        """
        try:
            from uora.ml_detector.detector import MLAnomalyDetector

            concurrent_latencies = [
                int(r.get("latency_ns", 0) or 0) for r in results.get("results", [])
            ]
            # Prefer clean correctness-pass latencies for latency SHAPE; fall back to
            # concurrent if the clean pass is unavailable.
            latency_signal = (
                [int(x) for x in clean_latencies if int(x) > 0]
                if clean_latencies
                else concurrent_latencies
            )
            total = int(results.get("total_orders", len(concurrent_latencies))
                        or len(concurrent_latencies) or 1)
            errors = int(results.get("failed_orders", 0) or 0)
            features = MLAnomalyDetector.extract_features(
                submission_id=submission_id,
                latencies=latency_signal or [1_000_000],
                expected_actions=attempted_actions,
                actual_actions=contestant_responses,
                errors=errors,
                total=total,
            )

            # Override throughput_variance with the REAL load-run value. extract_features
            # derived it from the (clean, tiny) latency_signal, which is not a valid
            # throughput series. Recompute it from the concurrent latencies.
            if len(concurrent_latencies) >= 2 and features is not None:
                try:
                    conc = MLAnomalyDetector.extract_features(
                        submission_id=submission_id,
                        latencies=concurrent_latencies,
                        expected_actions=attempted_actions,
                        actual_actions=contestant_responses,
                        errors=errors,
                        total=total,
                    )
                    features.throughput_variance = conc.throughput_variance
                except Exception:
                    pass

            return features
        except Exception as exc:
            logger.warning("Feature extraction failed for %s: %s", submission_id, exc, exc_info=True)
            return None

    # ── Resource metering helpers ─────────────────────────────────────────

    @staticmethod
    def _container_name_from_url(target_url: str) -> Optional[str]:
        """Extract the container/pod name from the target URL.

        Docker  → ``http://sub-{name}:8080``                 → ``sub-{name}``
        K8s     → ``http://sub-{name}.ns.svc.cluster.local`` → ``sub-{name}``
        """
        try:
            from urllib.parse import urlparse
            host = urlparse(target_url).hostname or ""
            label = host.split(".")[0]
            return label or None
        except Exception:
            return None

    @staticmethod
    def _compute_resource_penalty(cpu_pct: float, mem_mib: float) -> float:
        """Map average container CPU+memory usage to a penalty multiplier ≥ 1.0.

        CPU (% of one core):
            0 – 50%   → no penalty
            50 – 100% → linear 0 → +0.5
            > 100%    → +0.5 per additional core (throttled engines penalised harder)

        Memory (MiB):
            0 – 256   → no penalty
            256 – 512 → linear 0 → +0.5

        The denominator in compute_composite_score is ``p99_ms + penalty²``, so
        a penalty of 2.0 adds 4× as much drag as the 1.0 baseline — a convex
        disincentive for bloated engines.
        """
        # CPU
        if cpu_pct <= 50.0:
            cpu_extra = 0.0
        elif cpu_pct <= 100.0:
            cpu_extra = (cpu_pct - 50.0) / 50.0 * 0.5
        else:
            cpu_extra = 0.5 + min(0.5, (cpu_pct - 100.0) / 100.0 * 0.5)

        # Memory
        MEM_THRESHOLD = 256.0
        MEM_LIMIT = 512.0
        if mem_mib <= MEM_THRESHOLD:
            mem_extra = 0.0
        else:
            mem_extra = min(0.5, (mem_mib - MEM_THRESHOLD) / (MEM_LIMIT - MEM_THRESHOLD) * 0.5)

        return round(1.0 + cpu_extra + mem_extra, 4)

    @staticmethod
    def _parse_mem_mib(mem_str: str) -> Optional[float]:
        """Parse a Docker memory string (e.g. ``256MiB``, ``1.5GiB``, ``512MB``) → MiB."""
        mem_str = mem_str.strip()
        try:
            for unit, factor in [
                ("GiB", 1024.0), ("MiB", 1.0), ("KiB", 1.0 / 1024.0),
                ("GB",  953.674), ("MB",  0.953674), ("KB", 0.000953674),
            ]:
                if mem_str.endswith(unit):
                    return float(mem_str[: -len(unit)]) * factor
            return float(mem_str)  # bare number → assume MiB
        except (ValueError, TypeError):
            return None

    async def _sample_container_resources(
        self,
        submission_id: str,
        target_url: str,
        duration: float,
        n_samples: int = 5,
    ) -> float:
        """Sample Docker CPU + memory during the benchmark window and return a
        ``resource_penalty`` ≥ 1.0.

        Runs ``docker stats --no-stream`` at evenly-spaced intervals while the
        benchmark is executing.  Falls back to 1.0 on any error (Docker not
        available, Kubernetes deployment, permission issues, etc.).
        """
        # No Docker on the host (local/dev runs) → skip sampling entirely. Spawning
        # `docker` via asyncio.create_subprocess_exec when the binary is missing is both
        # pointless and, on macOS, a source of event-loop child-watcher instability that
        # can disturb other connections on the loop. Fall back to the 1.0 baseline.
        import shutil
        if shutil.which("docker") is None:
            logger.debug("docker not on PATH — skipping resource sampling (penalty 1.0)")
            return 1.0

        container = self._container_name_from_url(target_url)
        if not container:
            logger.debug("Cannot derive container name from %s — skipping resource sampling", target_url)
            return 1.0

        interval = max(1.0, duration / max(n_samples, 1))
        cpu_readings: list[float] = []
        mem_readings: list[float] = []

        for _ in range(n_samples):
            await asyncio.sleep(interval)
            try:
                proc = await asyncio.create_subprocess_exec(
                    "docker", "stats", "--no-stream",
                    "--format", "{{.CPUPerc}}\t{{.MemUsage}}",
                    container,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.DEVNULL,
                )
                try:
                    stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=5.0)
                except asyncio.TimeoutError:
                    try:
                        proc.kill()
                    except ProcessLookupError:
                        pass
                    await proc.wait()
                    continue

                line = stdout.decode(errors="replace").strip()
                if not line:
                    continue
                parts = line.split("\t")
                if len(parts) < 2:
                    continue

                cpu_pct = float(parts[0].strip().rstrip("%"))
                mem_mib = self._parse_mem_mib(parts[1].split("/")[0].strip())
                cpu_readings.append(cpu_pct)
                if mem_mib is not None:
                    mem_readings.append(mem_mib)

            except Exception as exc:
                logger.debug("Resource sample failed for %s: %s", container, exc)

        if not cpu_readings:
            logger.debug("No CPU samples collected for %s — using 1.0 baseline", submission_id)
            return 1.0

        avg_cpu = sum(cpu_readings) / len(cpu_readings)
        avg_mem = sum(mem_readings) / len(mem_readings) if mem_readings else 0.0
        penalty = self._compute_resource_penalty(avg_cpu, avg_mem)
        logger.info(
            "Resource metering for %s: cpu=%.1f%% mem=%.1f MiB → penalty=%.4f",
            submission_id, avg_cpu, avg_mem, penalty,
        )
        return penalty

    async def _read_resource_penalty(self, submission_id: str) -> Optional[float]:
        """Read the resource penalty the pipeline recorded in Redis (resources:{id})."""
        try:
            if self._redis is None:
                return None
            raw = await self._redis.get(f"resources:{submission_id}")
            return float(raw) if raw is not None else None
        except Exception as exc:
            logger.warning("Resource penalty lookup failed for %s: %s", submission_id, exc)
            return None

    async def _run_job(self, job: dict[str, Any]) -> None:
        submission_id = job["submission_id"]
        target_url = job["target_url"]
        language = job.get("language", "cpp")
        protocol = job.get("protocol", "REST")

        try:
            await self._update_status(submission_id, "benchmarking", target_url=target_url)
            actions = load_actions()
            coordinator = BotCoordinator()

            # Start container resource sampling concurrently with the benchmark.
            # The task runs for exactly DURATION_SEC seconds and is awaited after
            # the benchmark completes, so we get real CPU/memory readings.
            resource_task: asyncio.Task[float] = asyncio.create_task(
                self._sample_container_resources(
                    submission_id, target_url, float(DURATION_SEC)
                )
            )

            benchmark_done = asyncio.Event()

            async def publish_metrics_periodically():
                last_index = 0
                last_time = time.time()
                while not benchmark_done.is_set():
                    try:
                        await asyncio.sleep(1.0)
                        records = coordinator._records[last_index:]
                        if not records:
                            continue
                        last_index += len(records)
                        
                        now = time.time()
                        elapsed = now - last_time
                        last_time = now
                        if elapsed <= 0:
                            elapsed = 0.001
                            
                        latencies = sorted([r["latency_ns"] / 1_000_000 for r in records])
                        n = len(latencies)
                        p50 = latencies[min(int(n * 0.50), n - 1)] if n > 0 else 0.0
                        p90 = latencies[min(int(n * 0.90), n - 1)] if n > 0 else 0.0
                        p99 = latencies[min(int(n * 0.99), n - 1)] if n > 0 else 0.0
                        tps = len(records) / elapsed
                        
                        await self._publish({
                            "type": "metrics",
                            "timestamp": int(now * 1000),
                            "p50": round(p50, 4),
                            "p90": round(p90, 4),
                            "p99": round(p99, 4),
                            "throughput": round(tps, 2),
                        })
                    except Exception as e:
                        logger.warning("Error publishing periodic metrics: %s", e)

            metrics_task = asyncio.create_task(publish_metrics_periodically())

            try:
                await coordinator.start(
                    target_url,
                    WORKER_COUNT,
                    submission_id=submission_id,
                    protocol=protocol,
                )
                await coordinator.load_scenario(actions)
                # Deterministic correctness pass FIRST, on the pristine book: one bot
                # replays the unique scenario in order using the scenario's own
                # order_ids. This is what L1–L4 is scored on. The concurrent
                # run_benchmark below measures latency/throughput only — its
                # out-of-order, minted-id traffic cannot be diffed against a
                # sequential reference replay.
                correctness_responses, correctness_latencies = (
                    await coordinator.run_correctness_pass(actions)
                )
                await coordinator.run_benchmark(DURATION_SEC)
                results = await coordinator.get_results()
            finally:
                benchmark_done.set()
                metrics_task.cancel()
                try:
                    await metrics_task
                except asyncio.CancelledError:
                    pass
                await coordinator.stop()

            # Collect the resource penalty that was sampled during the run.
            try:
                resource_penalty_live = await asyncio.wait_for(resource_task, timeout=30.0)
            except (asyncio.TimeoutError, asyncio.CancelledError, Exception) as exc:
                logger.warning("Resource sampling timed out for %s: %s", submission_id, exc)
                resource_task.cancel()
                resource_penalty_live = None

            # Write the live penalty to Redis, overwriting the 1.0 baseline the
            # builder wrote at deploy time.  _read_resource_penalty() reads this.
            if self._redis is not None and resource_penalty_live is not None:
                await self._redis.set(
                    f"resources:{submission_id}",
                    str(resource_penalty_live),
                    ex=86400,
                )
                logger.info(
                    "Wrote resource_penalty=%.4f for %s",
                    resource_penalty_live, submission_id,
                )

            assert_benchmark_succeeded(results, minimum_success_rate=MIN_SUCCESS_RATE)
            await self._record_latency_events(submission_id, results["results"])

            await self._update_status(submission_id, "validating")
            # Score correctness on the deterministic pass (1:1 with the reference
            # replay), not the concurrent load stream.
            report = CorrectnessValidator().validate_submission(actions, correctness_responses)
            await self._record_validation(submission_id, report)

            engine = ScoringEngine(
                db_host=DB_HOST,
                db_port=DB_PORT,
                db_user=DB_USER,
                db_password=DB_PASSWORD,
                db_name=DB_NAME,
            )

            # Build the full 8-feature anomaly vector HERE, where the action/response
            # stream lives, so pattern_correlation and state_transition_ged are computed
            # for real instead of being passed to the scorer as 0.0. The action-stream
            # features use the deterministic correctness pass (clean, in-order). The
            # latency-shape features (entropy, trend-slope, p99/p50 ratio) also use the
            # CLEAN single-threaded correctness-pass latencies — on a co-located host
            # the concurrent run's tail is dominated by client-side scheduling, which
            # would otherwise spuriously flag every legitimate engine. error_rate still
            # comes from the concurrent `results`.
            features = self._build_features(
                submission_id, results, actions, correctness_responses,
                clean_latencies=correctness_latencies,
            )
            # Use the validator's L4 result for the determinism feature. extract_features
            # can only diff the action stream (which lacks reference statuses); the
            # validator diffs the contestant graph against the real reference replay, so
            # its similarity is the correct signal. (1 - determinism) = divergence.
            if features is not None and "determinism" in report:
                features.state_transition_ged = round(1.0 - float(report["determinism"]), 4)
            if features is not None:
                logger.debug(
                    "anomaly features %s entropy=%.0f patcorr=%.3f vol=%.1f ged=%.3f "
                    "slope=%.4f thrvar=%.1f err=%.4f p99p50=%.2f",
                    submission_id,
                    features.latency_entropy, features.pattern_correlation,
                    features.volume_conservation_delta, features.state_transition_ged,
                    features.latency_trend_slope, features.throughput_variance,
                    features.error_rate, features.p99_to_p50_ratio,
                )
            # Resource penalty reported by the pipeline (the builder writes resources:{id}).
            resource_penalty = await self._read_resource_penalty(submission_id)

            # Team is set by /api/v1/submit on the submission Redis hash. Pull it so
            # benchmark_scores.team is populated (avoids "Team 16d15bcd"-style
            # fallback labels on the leaderboard).
            team_for_score: Optional[str] = None
            try:
                sub_meta = await self._redis.hgetall(f"submission:{submission_id}") if self._redis else {}
                team_for_score = sub_meta.get("team")
            except Exception:
                team_for_score = None

            score = await engine.compute_score(
                submission_id,
                features=features,
                resource_penalty=resource_penalty,
                team=team_for_score,
                language=language,
            )

            await self._update_status(submission_id, "scored", language=language)
            
            # If an anomaly is flagged, publish it to Redis
            if score.get("anomaly", {}).get("is_anomaly"):
                await self._publish({
                    "type": "anomaly",
                    "timestamp": int(datetime.now(timezone.utc).timestamp() * 1000),
                    "score": float(score["anomaly"]["score"]),
                    "anomaly_type": str(score["anomaly"]["reason"]),
                    "team": team_for_score or f"Team {submission_id[:8]}",
                })

            leaderboard = await engine.get_leaderboard(limit=20)
            await self._publish({"type": "benchmark_complete", "submission_id": submission_id, "score": score})
            await self._publish({"type": "leaderboard", "entries": leaderboard})
        except Exception as exc:
            logger.exception("Benchmark pipeline failed for %s", submission_id)
            await self._update_status(submission_id, "failed", error=str(exc))

    async def _consume(self) -> None:
        assert self._redis is not None
        while self._running:
            try:
                results = await self._redis.xreadgroup(
                    groupname=CONSUMER_GROUP,
                    consumername=CONSUMER_ID,
                    streams={STREAM_NAME: ">"},
                    count=1,
                    block=BLOCK_MS,
                )
                if not results:
                    continue
                for _stream, messages in results:
                    for message_id, data in messages:
                        await self._run_job(data)
                        await self._redis.xack(STREAM_NAME, CONSUMER_GROUP, message_id)
            except aioredis.ConnectionError:
                logger.error("Redis connection lost; retrying")
                await asyncio.sleep(5)
            except asyncio.CancelledError:
                return
            except Exception as exc:
                # Redis TimeoutError is a normal result of the BLOCK window
                # expiring with no messages — just loop silently.
                err_str = str(exc)
                if "Timeout reading" in err_str or "TimeoutError" in type(exc).__name__:
                    continue
                logger.exception("Unexpected benchmark worker error")
                await asyncio.sleep(1)

    async def run(self) -> None:
        await self.start()
        loop = asyncio.get_running_loop()
        for sig in (signal.SIGINT, signal.SIGTERM):
            loop.add_signal_handler(sig, lambda: asyncio.create_task(self.shutdown()))
        try:
            await self._consume()
        finally:
            await self.shutdown()


async def main() -> None:
    worker = BenchmarkWorker()
    await worker.run()


if __name__ == "__main__":
    asyncio.run(main())
