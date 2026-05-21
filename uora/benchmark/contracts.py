"""Shared benchmark runtime assertions."""

from __future__ import annotations


def assert_benchmark_succeeded(results: dict, minimum_success_rate: float = 0.01) -> None:
    """Fail fast when the benchmark harness never reached the contestant engine."""
    total_orders = int(results.get("total_orders", 0) or 0)
    successful_orders = int(results.get("successful_orders", 0) or len(results.get("results", [])) or 0)
    success_rate = float(results.get("success_rate", 0.0) or 0.0)

    assert total_orders > 0, "benchmark produced zero orders"
    assert successful_orders > 0, "benchmark success rate is 0.00%; no orders reached the contestant engine"
    assert success_rate >= minimum_success_rate, (
        f"benchmark success rate {success_rate:.2%} is below required "
        f"{minimum_success_rate:.2%}"
    )
