"""TimescaleDB schema bootstrap and compatibility migrations."""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger("uora.telemetry.migrations")


async def _column_type(conn: Any, table_name: str, column_name: str) -> str | None:
    row = await conn.fetchrow(
        """
        SELECT data_type
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = $1
          AND column_name = $2
        """,
        table_name,
        column_name,
    )
    return row["data_type"] if row else None


async def _relation_exists(conn: Any, relation_name: str) -> bool:
    row = await conn.fetchrow("SELECT to_regclass($1) IS NOT NULL AS exists", f"public.{relation_name}")
    return bool(row["exists"]) if row else False


async def _ensure_submission_id_text(conn: Any, table_name: str) -> None:
    data_type = await _column_type(conn, table_name, "submission_id")
    if data_type and data_type != "text":
        await conn.execute(
            f"ALTER TABLE {table_name} "
            "ALTER COLUMN submission_id TYPE TEXT USING submission_id::text"
        )
        logger.info("Migrated %s.submission_id from %s to text", table_name, data_type)


async def ensure_timescale_schema(conn: Any) -> None:
    """Create or migrate the runtime Timescale schema without requiring a wiped volume."""
    await conn.execute("CREATE EXTENSION IF NOT EXISTS timescaledb")

    await conn.execute(
        """
        CREATE TABLE IF NOT EXISTS latency_events (
            time            TIMESTAMPTZ NOT NULL,
            submission_id   TEXT,
            bot_id          TEXT,
            order_id        TEXT,
            endpoint        TEXT,
            latency_ns      BIGINT,
            status_code     INT,
            success         BOOLEAN
        )
        """
    )
    await conn.execute("ALTER TABLE latency_events ADD COLUMN IF NOT EXISTS submission_id TEXT")
    await conn.execute("ALTER TABLE latency_events ADD COLUMN IF NOT EXISTS bot_id TEXT")
    await conn.execute("ALTER TABLE latency_events ADD COLUMN IF NOT EXISTS order_id TEXT")
    await conn.execute("ALTER TABLE latency_events ADD COLUMN IF NOT EXISTS endpoint TEXT")
    await conn.execute("ALTER TABLE latency_events ADD COLUMN IF NOT EXISTS latency_ns BIGINT")
    await conn.execute("ALTER TABLE latency_events ADD COLUMN IF NOT EXISTS status_code INT")
    await conn.execute("ALTER TABLE latency_events ADD COLUMN IF NOT EXISTS success BOOLEAN")

    await conn.execute(
        """
        CREATE TABLE IF NOT EXISTS correctness_violations (
            time            TIMESTAMPTZ NOT NULL,
            submission_id   TEXT NOT NULL,
            level           INT,
            order_id        TEXT,
            expected        JSONB,
            actual          JSONB,
            description     TEXT
        )
        """
    )
    await conn.execute("ALTER TABLE correctness_violations ADD COLUMN IF NOT EXISTS submission_id TEXT")
    await conn.execute("ALTER TABLE correctness_violations ADD COLUMN IF NOT EXISTS level INT")
    await conn.execute("ALTER TABLE correctness_violations ADD COLUMN IF NOT EXISTS order_id TEXT")
    await conn.execute("ALTER TABLE correctness_violations ADD COLUMN IF NOT EXISTS expected JSONB")
    await conn.execute("ALTER TABLE correctness_violations ADD COLUMN IF NOT EXISTS actual JSONB")
    await conn.execute("ALTER TABLE correctness_violations ADD COLUMN IF NOT EXISTS description TEXT")

    await conn.execute(
        """
        CREATE TABLE IF NOT EXISTS benchmark_scores (
            time             TIMESTAMPTZ NOT NULL,
            submission_id    TEXT NOT NULL,
            team             TEXT,
            language         TEXT,
            status           TEXT,
            throughput       FLOAT,
            max_tps          FLOAT,
            success_rate     FLOAT,
            error_rate       FLOAT,
            correctness_rate FLOAT,
            p50_latency_ns   BIGINT,
            p90_latency_ns   BIGINT,
            p99_latency_ns   BIGINT,
            resource_penalty FLOAT,
            composite_score  FLOAT,
            anomaly_score    FLOAT
        )
        """
    )
    await conn.execute("ALTER TABLE benchmark_scores ADD COLUMN IF NOT EXISTS submission_id TEXT")
    await conn.execute("ALTER TABLE benchmark_scores ADD COLUMN IF NOT EXISTS team TEXT")
    await conn.execute("ALTER TABLE benchmark_scores ADD COLUMN IF NOT EXISTS language TEXT")
    await conn.execute("ALTER TABLE benchmark_scores ADD COLUMN IF NOT EXISTS status TEXT")
    await conn.execute("ALTER TABLE benchmark_scores ADD COLUMN IF NOT EXISTS throughput FLOAT")
    await conn.execute("ALTER TABLE benchmark_scores ADD COLUMN IF NOT EXISTS max_tps FLOAT")
    await conn.execute("ALTER TABLE benchmark_scores ADD COLUMN IF NOT EXISTS success_rate FLOAT")
    await conn.execute("ALTER TABLE benchmark_scores ADD COLUMN IF NOT EXISTS error_rate FLOAT")
    await conn.execute("ALTER TABLE benchmark_scores ADD COLUMN IF NOT EXISTS correctness_rate FLOAT")
    await conn.execute("ALTER TABLE benchmark_scores ADD COLUMN IF NOT EXISTS p50_latency_ns BIGINT")
    await conn.execute("ALTER TABLE benchmark_scores ADD COLUMN IF NOT EXISTS p90_latency_ns BIGINT")
    await conn.execute("ALTER TABLE benchmark_scores ADD COLUMN IF NOT EXISTS p99_latency_ns BIGINT")
    await conn.execute("ALTER TABLE benchmark_scores ADD COLUMN IF NOT EXISTS resource_penalty FLOAT")
    await conn.execute("ALTER TABLE benchmark_scores ADD COLUMN IF NOT EXISTS composite_score FLOAT")
    await conn.execute("ALTER TABLE benchmark_scores ADD COLUMN IF NOT EXISTS anomaly_score FLOAT")

    await conn.execute(
        """
        CREATE TABLE IF NOT EXISTS validation_results (
            time             TIMESTAMPTZ NOT NULL,
            submission_id    TEXT NOT NULL,
            correctness_rate FLOAT NOT NULL,
            total_actions    INT,
            violations_count INT
        )
        """
    )
    await conn.execute("ALTER TABLE validation_results ADD COLUMN IF NOT EXISTS submission_id TEXT")
    await conn.execute("ALTER TABLE validation_results ADD COLUMN IF NOT EXISTS correctness_rate FLOAT")
    await conn.execute("ALTER TABLE validation_results ADD COLUMN IF NOT EXISTS total_actions INT")
    await conn.execute("ALTER TABLE validation_results ADD COLUMN IF NOT EXISTS violations_count INT")

    await conn.execute(
        """
        CREATE TABLE IF NOT EXISTS build_events (
            time             TIMESTAMPTZ NOT NULL,
            submission_id    TEXT NOT NULL,
            event            TEXT NOT NULL,
            detail           TEXT
        )
        """
    )
    await conn.execute("ALTER TABLE build_events ADD COLUMN IF NOT EXISTS submission_id TEXT")
    await conn.execute("ALTER TABLE build_events ADD COLUMN IF NOT EXISTS event TEXT")
    await conn.execute("ALTER TABLE build_events ADD COLUMN IF NOT EXISTS detail TEXT")

    latency_type = await _column_type(conn, "latency_events", "submission_id")
    if latency_type and latency_type != "text" and await _relation_exists(conn, "latency_1min"):
        await conn.execute("DROP MATERIALIZED VIEW IF EXISTS latency_1min CASCADE")
        logger.info("Dropped latency_1min to migrate latency_events.submission_id to text")

    for table_name in ("latency_events", "correctness_violations", "benchmark_scores", "validation_results", "build_events"):
        await _ensure_submission_id_text(conn, table_name)

    await conn.execute(
        """
        SELECT create_hypertable(
            'latency_events',
            'time',
            chunk_time_interval => INTERVAL '1 hour',
            if_not_exists => TRUE
        )
        """
    )

    await conn.execute(
        """
        CREATE MATERIALIZED VIEW IF NOT EXISTS latency_1min
        WITH (timescaledb.continuous) AS
        SELECT
            time_bucket('1 minute', time) AS bucket,
            submission_id,
            COUNT(*) AS throughput,
            AVG(latency_ns) AS avg_latency
        FROM latency_events
        GROUP BY bucket, submission_id
        """
    )

    await conn.execute("CREATE INDEX IF NOT EXISTS idx_latency_submission_id ON latency_events (submission_id, time DESC)")
    await conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_violations_submission_id ON correctness_violations (submission_id, time DESC)"
    )
    await conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_validation_submission_id ON validation_results (submission_id, time DESC)"
    )
    await conn.execute("CREATE INDEX IF NOT EXISTS idx_scores_submission_id ON benchmark_scores (submission_id, time DESC)")
    await conn.execute("CREATE INDEX IF NOT EXISTS idx_build_events_submission_id ON build_events (submission_id, time DESC)")

    try:
        await conn.execute(
            """
            SELECT add_continuous_aggregate_policy(
                'latency_1min',
                start_offset => INTERVAL '1 hour',
                end_offset => INTERVAL '1 minute',
                schedule_interval => INTERVAL '1 minute',
                if_not_exists => true
            )
            """
        )
    except Exception as exc:
        logger.warning("Continuous aggregate policy check skipped: %s", exc)
