import pytest

from uora.benchmark.contracts import assert_benchmark_succeeded
from uora.bot_fleet.coordinator import BotCoordinator
from uora.sandbox.builder import SandboxBuilder
from uora.scoring.engine import compute_latency_summary


def test_integration_guard_rejects_zero_success_benchmark():
    with pytest.raises(AssertionError, match="success rate"):
        assert_benchmark_succeeded(
            {
                "total_orders": 25,
                "successful_orders": 0,
                "failed_orders": 25,
                "success_rate": 0.0,
            }
        )


@pytest.mark.asyncio
async def test_coordinator_reports_real_percentiles_and_error_rate():
    coordinator = BotCoordinator()
    coordinator._records = [
        {"latency_ns": 1_000_000, "success": True},
        {"latency_ns": 2_000_000, "success": True},
        {"latency_ns": 3_000_000, "success": True},
    ]
    coordinator._errors = 1

    results = await coordinator.get_results()

    assert results["total_orders"] == 4
    assert results["successful_orders"] == 3
    assert results["failed_orders"] == 1
    assert results["success_rate"] == pytest.approx(0.75)
    assert results["error_rate"] == pytest.approx(0.25)
    assert results["p50_latency_ns"] == 2_000_000
    assert results["p90_latency_ns"] == 3_000_000
    assert results["p99_latency_ns"] == 3_000_000


class _FakeRedis:
    def __init__(self):
        self.streams = []
        self.hashes = []
        self.published = []

    async def xadd(self, stream, payload):
        self.streams.append((stream, payload))
        return "1-0"

    async def hset(self, key, mapping):
        self.hashes.append((key, mapping))

    async def publish(self, channel, payload):
        self.published.append((channel, payload))


@pytest.mark.asyncio
async def test_builder_enqueues_benchmark_after_deploy():
    builder = SandboxBuilder()
    fake_redis = _FakeRedis()
    builder._redis = fake_redis

    await builder._enqueue_benchmark(
        submission_id="sub-123",
        target_url="http://sub-123.uora.svc.cluster.local:8080",
        language="cpp",
    )

    assert fake_redis.streams == [
        (
            "benchmark_queue",
            {
                "submission_id": "sub-123",
                "target_url": "http://sub-123.uora.svc.cluster.local:8080",
                "language": "cpp",
                "protocol": "REST",
            },
        )
    ]
    assert fake_redis.hashes[-1][0] == "submission:sub-123"
    assert fake_redis.hashes[-1][1]["status"] == "benchmarking"
    assert fake_redis.published[-1][0] == "uora:leaderboard:updates"


def test_scoring_latency_summary_uses_raw_rows_not_p99_derivation():
    summary = compute_latency_summary(
        [
            {"latency_ns": 1_000_000, "success": True},
            {"latency_ns": 2_000_000, "success": True},
            {"latency_ns": 10_000_000, "success": False},
        ],
        duration_seconds=2.0,
    )

    assert summary["p50_latency_ns"] == 2_000_000
    assert summary["p90_latency_ns"] == 10_000_000
    assert summary["p99_latency_ns"] == 10_000_000
    assert summary["throughput"] == pytest.approx(1.5)
    assert summary["success_rate"] == pytest.approx(2 / 3)
    assert summary["error_rate"] == pytest.approx(1 / 3)
