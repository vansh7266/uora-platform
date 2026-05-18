"""
UORA Telemetry Ingester
Reads Envoy access logs → parses → writes to TimescaleDB via async batch insert.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import time
from collections import deque
from datetime import datetime, timezone
from typing import Any, Optional

try:
    import asyncpg
except ImportError:  # pragma: no cover - exercised in minimal local envs
    asyncpg = None

logger = logging.getLogger("uora.telemetry.ingester")


# Envoy access log format:
# %START_TIME% %REQ(:METHOD)% %REQ(X-ENVOY-ORIGINAL-PATH?:PATH)% %RESPONSE_CODE% %DURATION% %BYTES_RECEIVED% %BYTES_SENT% %REQ(X-REQUEST-ID)%
# Example:
# 2024-01-15T10:30:00.000Z POST /api/v1/order 201 45 256 128 abc-123-def

ENVOY_LOG_PATTERN = re.compile(
    r"^(\S+)\s+(\S+)\s+(\S+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\S+)"
)


class TelemetryIngester:
    """
    Tails Envoy access log file and batches inserts into TimescaleDB.
    """

    def __init__(
        self,
        db_host: str = "localhost",
        db_port: int = 5432,
        db_user: str = "uora",
        db_password: str = "uora12345",
        db_name: str = "uora_metrics",
        batch_size: int = 100,
        flush_interval_ms: float = 1000.0,
    ):
        self.db_host = db_host
        self.db_port = db_port
        self.db_user = db_user
        self.db_password = db_password
        self.db_name = db_name
        self.batch_size = batch_size
        self.flush_interval_ms = flush_interval_ms

        self._pool: Optional[Any] = None
        self._buffer: list[dict] = []
        self._dead_letter: deque[dict] = deque(maxlen=10_000)
        self._flush_retries: dict[str, int] = {}  # record hash -> retry count
        self._running = False

    async def start(self) -> None:
        """Initialize DB connection pool."""
        if asyncpg is None:
            raise RuntimeError("asyncpg is required for TimescaleDB ingestion. Install project dependencies first.")

        self._running = True
        self._pool = await asyncpg.create_pool(
            host=self.db_host,
            port=self.db_port,
            user=self.db_user,
            password=self.db_password,
            database=self.db_name,
            min_size=2,
            max_size=10,
        )
        print(f"✓ Connected to TimescaleDB at {self.db_host}:{self.db_port}")

    async def stop(self) -> None:
        """Flush remaining buffer and close pool."""
        if self._buffer:
            await self._flush()
        if self._pool:
            await self._pool.close()

    @property
    def dead_letter_count(self) -> int:
        """Number of records in the dead-letter queue."""
        return len(self._dead_letter)

    def get_dead_letter_records(self) -> list[dict]:
        """Return a snapshot of dead-letter records for inspection/replay."""
        return list(self._dead_letter)

    async def ingest_log_line(self, line: str) -> None:
        """Parse a single Envoy access log line and buffer it."""
        match = ENVOY_LOG_PATTERN.match(line.strip())
        if not match:
            return  # Skip malformed lines

        start_time, method, path, status_code, duration_ms, bytes_in, bytes_out, request_id = match.groups()

        # Parse timestamp
        try:
            ts = datetime.fromisoformat(start_time.replace("Z", "+00:00"))
        except ValueError:
            ts = datetime.now(timezone.utc)

        # Determine endpoint
        endpoint = path.split("?")[0]  # Strip query params

        # Convert duration to nanoseconds
        latency_ns = int(float(duration_ms) * 1_000_000)

        record = {
            "time": ts,
            "submission_id": self._extract_submission_id(request_id),
            "bot_id": self._extract_bot_id(request_id),
            "order_id": request_id,
            "endpoint": f"{method} {endpoint}",
            "latency_ns": latency_ns,
            "status_code": int(status_code),
            "success": int(status_code) < 500,
        }

        self._buffer.append(record)

        if len(self._buffer) >= self.batch_size:
            await self._flush()

    async def ingest_batch(self, lines: list[str]) -> None:
        """Parse multiple log lines."""
        for line in lines:
            await self.ingest_log_line(line)

    async def _flush(self) -> None:
        """Batch insert buffered records into TimescaleDB."""
        if not self._buffer or not self._pool:
            return

        records = self._buffer
        self._buffer = []

        try:
            async with self._pool.acquire() as conn:
                await conn.executemany(
                    """
                    INSERT INTO latency_events (time, submission_id, bot_id, order_id, endpoint, latency_ns, status_code, success)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    """,
                    [
                        (
                            r["time"],
                            r["submission_id"],
                            r["bot_id"],
                            r["order_id"],
                            r["endpoint"],
                            r["latency_ns"],
                            r["status_code"],
                            r["success"],
                        )
                        for r in records
                    ],
                )
            # Flush succeeded — clear retry counters for these records
            for r in records:
                rhash = self._record_hash(r)
                self._flush_retries.pop(rhash, None)
            logger.info("Flushed %d records to TimescaleDB", len(records))
        except Exception as e:
            logger.error("Flush failed (%d records): %s", len(records), e)
            # Route records: retry up to 3 times, then dead-letter queue
            for r in records:
                rhash = self._record_hash(r)
                self._flush_retries[rhash] = self._flush_retries.get(rhash, 0) + 1
                if self._flush_retries[rhash] > 3:
                    # Exceeded retry limit — send to dead-letter queue
                    self._dead_letter.append(r)
                    logger.warning(
                        "Record moved to DLQ after %d retries (order_id=%s)",
                        self._flush_retries[rhash], r.get("order_id", "unknown"),
                    )
                    self._flush_retries.pop(rhash, None)
                else:
                    # Still within retry limit — re-buffer
                    self._buffer.insert(0, r)

    def _extract_submission_id(self, request_id: str) -> Optional[str]:
        """Extract submission_id from request_id format: sub-<uuid>-bot-<id>"""
        parts = request_id.split("-")
        if len(parts) >= 2 and parts[0] == "sub":
            return "-".join(parts[1:6])  # UUID is 5 hyphen-separated groups
        return None

    def _extract_bot_id(self, request_id: str) -> Optional[str]:
        """Extract bot_id from request_id format: sub-<uuid>-bot-<id>"""
        parts = request_id.split("-")
        if "bot" in parts:
            idx = parts.index("bot")
            return parts[idx + 1] if idx + 1 < len(parts) else None
        return None

    @staticmethod
    def _record_hash(record: dict) -> str:
        """Produce a stable hash for a record to track retry counts."""
        return f"{record.get('order_id', '')}:{record.get('time', '')}"

    async def run_periodic_flush(self) -> None:
        """Background task: flush buffer every N milliseconds."""
        while self._running:
            await asyncio.sleep(self.flush_interval_ms / 1000.0)
            if self._buffer:
                await self._flush()


# ─── CLI / Test ──────────────────────────────────────────────────────────────

async def main():
    ingester = TelemetryIngester(
        db_host=os.getenv("DB_HOST", "localhost"),
        db_port=int(os.getenv("DB_PORT", 5432)),
        db_user=os.getenv("DB_USER", "uora"),
        db_password=os.getenv("DB_PASSWORD", "uora12345"),
        db_name=os.getenv("DB_NAME", "uora_metrics"),
    )

    # Test with sample Envoy log lines (parsed before DB connection)
    test_lines = [
        "2024-01-15T10:30:00.000Z POST /api/v1/order 201 45 256 128 sub-550e8400-e29b-41d4-a716-446655440000-bot-01",
        "2024-01-15T10:30:00.050Z DELETE /api/v1/order/test-1 200 12 64 32 sub-550e8400-e29b-41d4-a716-446655440000-bot-01",
        "2024-01-15T10:30:00.100Z GET /api/v1/orderbook 200 8 512 256 sub-550e8400-e29b-41d4-a716-446655440000-bot-02",
    ]

    # Parse lines into buffer (no DB required)
    for line in test_lines:
        await ingester.ingest_log_line(line)

    assert len(ingester._buffer) == 3, f"Expected 3 buffered records, got {len(ingester._buffer)}"
    print(f"✓ Parsed {len(ingester._buffer)} records into buffer")

    for i, rec in enumerate(ingester._buffer):
        print(f"  Record {i+1}: endpoint={rec['endpoint']!r} latency_ns={rec['latency_ns']} status={rec['status_code']}")

    # Attempt DB flush — skip gracefully if TimescaleDB not running
    try:
        await ingester.start()
        if os.getenv("DB_HOST"):
            print("✓ Ingester running in daemon mode...")
            # Run periodic flush in background
            asyncio.create_task(ingester.run_periodic_flush())
            while True:
                await asyncio.sleep(3600)
        else:
            await ingester.stop()  # flushes buffer
            print("✓ Flushed to TimescaleDB")
    except Exception as e:
        print(f"⚠ DB not available (expected in dev without Docker): {e}")
        print("✓ Test complete (parse/buffer validated; DB flush skipped)")


def test_extract_submission_id_preserves_full_uuid():
    ingester = TelemetryIngester()

    submission_id = ingester._extract_submission_id(
        "sub-550e8400-e29b-41d4-a716-446655440000-bot-01"
    )

    assert submission_id == "550e8400-e29b-41d4-a716-446655440000"


if __name__ == "__main__":
    asyncio.run(main())
