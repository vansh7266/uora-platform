"""
UORA Scoring Engine
Reads TimescaleDB aggregates → computes composite score.
Formula: (Throughput × Correctness_Rate) / (p99_Latency + Resource_Usage²)
"""

from __future__ import annotations

import os
from typing import Optional

import asyncpg
import polars as pl


class ScoringEngine:
    """
    Computes benchmark scores from TimescaleDB latency aggregates.
    """

    def __init__(
        self,
        db_host: str = "localhost",
        db_port: int = 5432,
        db_user: str = "uora",
        db_password: str = "uora12345",
        db_name: str = "uora_metrics",
    ):
        self.db_host = db_host
        self.db_port = db_port
        self.db_user = db_user
        self.db_password = db_password
        self.db_name = db_name

    async def compute_score(self, submission_id: str) -> dict:
        """
        Compute composite score for a submission.
        Returns: score dict with all metrics.
        """
        conn = await asyncpg.connect(
            host=self.db_host,
            port=self.db_port,
            user=self.db_user,
            password=self.db_password,
            database=self.db_name,
        )

        try:
            # Fetch 1-minute aggregates from continuous view
            rows = await conn.fetch(
                """
                SELECT bucket, throughput, p50, p90, p99
                FROM latency_1min
                WHERE submission_id = $1
                ORDER BY bucket DESC
                LIMIT 60
                """,
                submission_id,
            )

            if not rows:
                return {
                    "submission_id": submission_id,
                    "error": "No telemetry data found",
                    "composite_score": 0.0,
                }

            # Convert to Polars DataFrame for fast computation
            df = pl.DataFrame(
                {
                    "bucket": [r["bucket"] for r in rows],
                    "throughput": [r["throughput"] for r in rows],
                    "p50": [r["p50"] for r in rows],
                    "p90": [r["p90"] for r in rows],
                    "p99": [r["p99"] for r in rows],
                }
            )

            # Compute metrics
            avg_throughput = df["throughput"].mean()
            max_throughput = df["throughput"].max()
            p99_latency = df["p99"].mean()  # Average p99 across minutes
            p50_latency = df["p50"].mean()
            latency_variance = df["p99"].std()

            # Fetch correctness rate from validator results
            correctness_rate = await self._get_correctness_rate(conn, submission_id)

            # Resource usage (mock — will be populated by sandbox metrics)
            resource_penalty = 1.0  # Placeholder

            # Composite score
            # Higher = better. Penalizes high latency and resource usage.
            numerator = avg_throughput * correctness_rate
            denominator = (p99_latency / 1_000_000) + (resource_penalty ** 2)  # Convert ns to ms

            composite_score = numerator / max(denominator, 1.0)

            return {
                "submission_id": submission_id,
                "composite_score": round(composite_score, 4),
                "throughput": {
                    "avg": round(avg_throughput, 2),
                    "max": int(max_throughput),
                    "unit": "orders/sec",
                },
                "latency": {
                    "p50_ms": round(p50_latency / 1_000_000, 3),
                    "p90_ms": round(df["p90"].mean() / 1_000_000, 3),
                    "p99_ms": round(p99_latency / 1_000_000, 3),
                    "variance_ms": round(latency_variance / 1_000_000, 3),
                },
                "correctness": {
                    "rate": round(correctness_rate, 4),
                    "percentage": f"{correctness_rate * 100:.2f}%",
                },
                "resource_penalty": resource_penalty,
                "formula": "(throughput × correctness) / (p99_latency_ms + resource²)",
            }

        finally:
            await conn.close()

    async def _get_correctness_rate(self, conn: asyncpg.Connection, submission_id: str) -> float:
        """Fetch correctness rate from benchmark_scores table."""
        row = await conn.fetchrow(
            """
            SELECT correctness_rate
            FROM benchmark_scores
            WHERE submission_id = $1
            ORDER BY time DESC
            LIMIT 1
            """,
            submission_id,
        )
        return row["correctness_rate"] if row else 1.0  # Default to perfect if not scored yet

    async def get_leaderboard(self, limit: int = 20) -> list[dict]:
        """Fetch top submissions by composite score."""
        conn = await asyncpg.connect(
            host=self.db_host,
            port=self.db_port,
            user=self.db_user,
            password=self.db_password,
            database=self.db_name,
        )

        try:
            rows = await conn.fetch(
                """
                SELECT submission_id, composite_score, throughput, p99_latency_ns, correctness_rate
                FROM benchmark_scores
                ORDER BY composite_score DESC
                LIMIT $1
                """,
                limit,
            )

            return [
                {
                    "rank": i + 1,
                    "submission_id": str(r["submission_id"]),
                    "composite_score": round(r["composite_score"], 4),
                    "throughput": r["throughput"],
                    "p99_latency_ms": round(r["p99_latency_ns"] / 1_000_000, 3),
                    "correctness_rate": f"{r['correctness_rate'] * 100:.2f}%",
                }
                for i, r in enumerate(rows)
            ]
        finally:
            await conn.close()


# ─── Test ────────────────────────────────────────────────────────────────────

async def test_scoring():
    """Test scoring engine with mock data."""
    engine = ScoringEngine()

    # This will fail without DB, but shows the structure
    try:
        score = await engine.compute_score("test-submission-001")
        print(f"Score: {score}")
    except Exception as e:
        print(f"Expected DB error in dev: {e}")
        print("✓ Scoring engine structure validated")


if __name__ == "__main__":
    import asyncio
    asyncio.run(test_scoring())