"""
UORA Telemetry Ingester
Reads Envoy access logs → parses → writes to TimescaleDB via async batch insert.
"""

from __future__ import annotations

import asyncio
import json
import re
import time
from datetime import datetime
from typing import Optional

import asyncpg


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

        self._pool: Optional[asyncpg.Pool] = None
        self._buffer: list[dict] = []
        self._running = False

    async def start(self) -> None:
        """Initialize DB connection pool."""
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
            ts = datetime.utcnow()

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
            print(f"✓ Flushed {len(records)} records to TimescaleDB")
        except Exception as e:
            print(f"✗ Flush failed: {e}")
            # Put records back in buffer for retry
            self._buffer = records + self._buffer

    def _extract_submission_id(self, request_id: str) -> Optional[str]:
        """Extract submission_id from request_id format: sub-<uuid>-bot-<id>"""
        parts = request_id.split("-")
        if len(parts) >= 2 and parts[0] == "sub":
            return "-".join(parts[1:5])  # UUID is 4 parts
        return None

    def _extract_bot_id(self, request_id: str) -> Optional[str]:
        """Extract bot_id from request_id format: sub-<uuid>-bot-<id>"""
        parts = request_id.split("-")
        if "bot" in parts:
            idx = parts.index("bot")
            return parts[idx + 1] if idx + 1 < len(parts) else None
        return None

    async def run_periodic_flush(self) -> None:
        """Background task: flush buffer every N milliseconds."""
        while self._running:
            await asyncio.sleep(self.flush_interval_ms / 1000.0)
            if self._buffer:
                await self._flush()


# ─── CLI / Test ──────────────────────────────────────────────────────────────

async def main():
    ingester = TelemetryIngester()

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
        await ingester.stop()  # flushes buffer
        print("✓ Flushed to TimescaleDB")
    except Exception as e:
        print(f"⚠ DB not available (expected in dev without Docker): {e}")
        print("✓ Test complete (parse/buffer validated; DB flush skipped)")


if __name__ == "__main__":
    asyncio.run(main())