"""Redis-backed benchmark, validation, and scoring worker."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import signal
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

    async def _publish(self, payload: dict[str, Any]) -> None:
        assert self._redis is not None
        await self._redis.publish("uora:leaderboard:updates", json.dumps(payload))

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

    async def _record_latency_events(self, submission_id: str, records: list[dict[str, Any]]) -> None:
        assert self._db_pool is not None
        async with self._db_pool.acquire() as conn:
            await conn.executemany(
                """
                INSERT INTO latency_events (
                    time, submission_id, bot_id, order_id, endpoint,
                    latency_ns, status_code, success
                )
                VALUES (NOW(), $1, $2, $3, $4, $5, $6, $7)
                """,
                [
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
                ],
            )

    async def _record_validation(self, submission_id: str, report: dict[str, Any]) -> None:
        assert self._db_pool is not None
        async with self._db_pool.acquire() as conn:
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
            if report["violations"]:
                await conn.executemany(
                    """
                    INSERT INTO correctness_violations (
                        time, submission_id, level, order_id, expected, actual, description
                    )
                    VALUES (NOW(), $1, $2, $3, $4::jsonb, $5::jsonb, $6)
                    """,
                    [
                        (
                            submission_id,
                            int(violation["level"]),
                            str(violation["order_id"]),
                            json.dumps(violation["expected"], default=str),
                            json.dumps(violation["actual"], default=str),
                            str(violation["description"]),
                        )
                        for violation in report["violations"]
                    ],
                )

    async def _run_job(self, job: dict[str, Any]) -> None:
        submission_id = job["submission_id"]
        target_url = job["target_url"]
        language = job.get("language", "cpp")
        protocol = job.get("protocol", "REST")

        try:
            await self._update_status(submission_id, "benchmarking", target_url=target_url)
            actions = load_actions()
            coordinator = BotCoordinator()
            try:
                await coordinator.start(
                    target_url,
                    WORKER_COUNT,
                    submission_id=submission_id,
                    protocol=protocol,
                )
                await coordinator.load_scenario(actions)
                await coordinator.run_benchmark(DURATION_SEC)
                results = await coordinator.get_results()
            finally:
                await coordinator.stop()

            assert_benchmark_succeeded(results, minimum_success_rate=MIN_SUCCESS_RATE)
            await self._record_latency_events(submission_id, results["results"])

            await self._update_status(submission_id, "validating")
            attempted_actions = [r["action"] for r in results["results"]] + [
                r["action"] for r in results.get("failed_results", [])
            ]
            contestant_responses = [r["result"] for r in results["results"]]
            report = CorrectnessValidator().validate_submission(attempted_actions, contestant_responses)
            await self._record_validation(submission_id, report)

            engine = ScoringEngine(
                db_host=DB_HOST,
                db_port=DB_PORT,
                db_user=DB_USER,
                db_password=DB_PASSWORD,
                db_name=DB_NAME,
            )
            score = await engine.compute_score(submission_id)

            await self._update_status(submission_id, "scored", language=language)
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
            except Exception:
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
