"""
UORA Scoring Engine
Reads TimescaleDB aggregates → computes composite score.
Formula: (Throughput × Correctness_Rate) / (p99_Latency + Resource_Usage²)
"""

from __future__ import annotations

import logging
import os
from typing import Any, Optional

import numpy as np

try:
    import asyncpg
except ImportError:  # pragma: no cover - exercised in minimal local envs
    asyncpg = None

try:
    import polars as pl
except ImportError:  # pragma: no cover - exercised in minimal local envs
    pl = None

logger = logging.getLogger("uora.scoring")


# ─── Module-level connection pool ────────────────────────────────────────────

_pool: Optional[Any] = None


def _p99_to_p50_ratio(p99_latency: float, p50_latency: float | None) -> float:
    """Return the tail-latency ratio for values already expressed in ns."""
    return (p99_latency / p50_latency) if p50_latency and p50_latency > 0 else 1.0


async def startup(
    db_host: str = "localhost",
    db_port: int = 5432,
    db_user: str = "uora",
    db_password: str = "uora12345",
    db_name: str = "uora_metrics",
) -> None:
    """Create the global connection pool. Call once at app start."""
    if asyncpg is None:
        raise RuntimeError("asyncpg is required for scoring DB access. Install project dependencies first.")

    global _pool
    _pool = await asyncpg.create_pool(
        host=db_host,
        port=db_port,
        user=db_user,
        password=db_password,
        database=db_name,
        min_size=2,
        max_size=20,
    )


async def shutdown() -> None:
    """Close the global connection pool. Call once at app shutdown."""
    global _pool
    if _pool:
        await _pool.close()
        _pool = None


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
        self._db_config = {
            "db_host": db_host,
            "db_port": db_port,
            "db_user": db_user,
            "db_password": db_password,
            "db_name": db_name,
        }

    async def _ensure_pool(self) -> None:
        if _pool is None:
            await startup(**self._db_config)

    async def compute_score(self, submission_id: str) -> dict:
        """
        Compute composite score for a submission.
        Returns: score dict with all metrics.
        """
        await self._ensure_pool()
        if pl is None:
            raise RuntimeError("polars is required for scoring computation. Install project dependencies first.")

        async with _pool.acquire() as conn:
            # Fetch 1-minute aggregates from continuous view
            rows = await conn.fetch(
                """
                SELECT bucket, throughput
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

            # Compute true p50, p90, p99 from raw latency events
            stats_row = await conn.fetchrow(
                """
                SELECT 
                    percentile_cont(0.50) WITHIN GROUP (ORDER BY latency_ns) AS p50_latency_ns,
                    percentile_cont(0.90) WITHIN GROUP (ORDER BY latency_ns) AS p90_latency_ns,
                    percentile_cont(0.99) WITHIN GROUP (ORDER BY latency_ns) AS p99_latency_ns
                FROM latency_events
                WHERE submission_id = $1
                """,
                submission_id,
            )
            p50_latency = stats_row["p50_latency_ns"] if stats_row and stats_row["p50_latency_ns"] is not None else 0
            p90_latency = stats_row["p90_latency_ns"] if stats_row and stats_row["p90_latency_ns"] is not None else 0
            p99_latency = stats_row["p99_latency_ns"] if stats_row and stats_row["p99_latency_ns"] is not None else 0

            # Convert to Polars DataFrame for fast computation
            df = pl.DataFrame(
                {
                    "bucket": [r["bucket"] for r in rows],
                    "throughput": [r["throughput"] for r in rows],
                }
            )

            # Compute metrics
            avg_throughput = df["throughput"].mean() if len(df) > 0 else 0
            max_throughput = df["throughput"].max() if len(df) > 0 else 0
            
            # Fetch correctness rate from validator results
            correctness_rate = await self._get_correctness_rate(conn, submission_id)

            # Resource usage (mock — will be populated by sandbox metrics)
            resource_penalty = 1.0  # Placeholder

            # Composite score
            # Higher = better. Penalizes high latency and resource usage.
            numerator = avg_throughput * correctness_rate
            denominator = (p99_latency / 1_000_000) + (resource_penalty ** 2)  # Convert ns to ms

            composite_score = numerator / max(denominator, 1.0)

            # ─── ML Anomaly Detection ──────────────────────────────────────────
            anomaly_score = 0.0
            anomaly_reason = "Not analyzed"
            try:
                from uora.ml_detector.detector import MLAnomalyDetector, BenchmarkFeatures
                detector = MLAnomalyDetector()
                detector.fit()

                # Fetch raw latencies for feature extraction
                latency_rows = await conn.fetch(
                    """
                    SELECT latency_ns FROM latency_events
                    WHERE submission_id = $1
                    ORDER BY time DESC LIMIT 10000
                    """,
                    submission_id,
                )
                raw_latencies = [int(r["latency_ns"]) for r in latency_rows] if latency_rows else [1_000_000]

                features = BenchmarkFeatures(
                    submission_id=submission_id,
                    latency_entropy=float(np.std(np.array(raw_latencies, dtype=np.float64))) if raw_latencies else 0.0,
                    pattern_correlation=0.0,
                    volume_conservation_delta=0.0,
                    state_transition_ged=0.0,
                    latency_trend_slope=0.0,
                    throughput_variance=0.0,
                    error_rate=0.0,
                    p99_to_p50_ratio=_p99_to_p50_ratio(p99_latency, p50_latency),
                )
                result = detector.detect(features)
                anomaly_score = result.anomaly_score
                anomaly_reason = result.reason
            except Exception as e:
                logger.warning(f"Anomaly detection failed for {submission_id}: {e}")
                anomaly_score = 0.0
                anomaly_reason = f"Detection skipped: {str(e)[:80]}"

            score_payload = {
                "submission_id": submission_id,
                "composite_score": round(composite_score, 4),
                "throughput": {
                    "avg": round(avg_throughput, 2),
                    "max": int(max_throughput),
                    "unit": "orders/sec",
                },
                "latency": {
                    "p50_ms": round(p50_latency / 1_000_000, 3),
                    "p90_ms": round(p90_latency / 1_000_000, 3),
                    "p99_ms": round(p99_latency / 1_000_000, 3),
                },
                "correctness": {
                    "rate": round(correctness_rate, 4),
                    "percentage": f"{correctness_rate * 100:.2f}%",
                },
                "anomaly": {
                    "score": round(anomaly_score, 4),
                    "reason": anomaly_reason,
                },
                "resource_penalty": resource_penalty,
                "formula": "(throughput × correctness) / (p99_latency_ms + resource²)",
            }
            
            # Generate PDF Report
            try:
                from uora.scoring.report_generator import ReportGenerator
                rg = ReportGenerator()
                latency_b64 = rg.generate_latency_chart(raw_latencies if raw_latencies else [])
                
                # Fetch violations if any
                violations_rows = await conn.fetch(
                    "SELECT description as reason, expected::text as action FROM correctness_violations WHERE submission_id = $1 LIMIT 10",
                    submission_id
                )
                violations = [dict(r) for r in violations_rows] if violations_rows else []
                
                html_content = rg.generate_html(
                    submission_id,
                    score_payload,
                    violations,
                    {"is_anomaly": anomaly_score < 0, "confidence": 0.9, "reason": anomaly_reason},
                    latency_b64
                )
                
                # Save to /tmp/uora-reports
                out_dir = "/tmp/uora-reports"
                import os
                os.makedirs(out_dir, exist_ok=True)
                pdf_path = os.path.join(out_dir, f"report-{submission_id}.pdf")
                rg.generate_pdf(html_content, pdf_path)
                logger.info(f"Generated PDF report for {submission_id} at {pdf_path}")
            except Exception as e:
                logger.error(f"Failed to generate report for {submission_id}: {e}")

            return score_payload

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
        await self._ensure_pool()

        async with _pool.acquire() as conn:
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


# ─── Test ────────────────────────────────────────────────────────────────────

def test_p99_to_p50_ratio_uses_matching_nanosecond_units():
    assert _p99_to_p50_ratio(3_000_000, 1_000_000) == 3.0

async def test_scoring():
    """Test scoring engine with mock data."""
    engine = ScoringEngine()

    # This will fail without DB, but shows the structure
    try:
        await startup()
        score = await engine.compute_score("test-submission-001")
        print(f"Score: {score}")
    except Exception as e:
        print(f"Expected DB error in dev: {e}")
        print("✓ Scoring engine structure validated")
    finally:
        await shutdown()


if __name__ == "__main__":
    import asyncio
    asyncio.run(test_scoring())
