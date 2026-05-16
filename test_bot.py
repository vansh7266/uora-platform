"""
UORA Bot Fleet — Integration Test
Runs a 10-worker benchmark against the reference server.

Usage:
    # Terminal 1 — start server
    python contestant-sdk/python/reference_server.py

    # Terminal 2 — run test
    python test_bot.py
"""

from __future__ import annotations

import asyncio
import json
import logging
from pathlib import Path

from uora.bot_fleet.coordinator import BotCoordinator
from uora.bot_fleet.lobster_parser import parse_lobster_csv

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s  %(message)s",
    datefmt="%H:%M:%S",
)

BASE_URL     = "http://127.0.0.1:8080"
WORKER_COUNT = 10
DURATION_SEC = 5


async def main() -> None:
    # Load sample scenario (limit orders only — cancels need live order IDs)
    sample = Path("data/lobster/sample_actions.json")
    with sample.open() as fh:
        all_actions = json.load(fh)
    actions = [a for a in all_actions if a["type"] == "limit"]
    print(f"Loaded {len(actions)} limit actions\n")

    coordinator = BotCoordinator()
    try:
        await coordinator.start(BASE_URL, WORKER_COUNT)
        await coordinator.load_scenario(actions)
        await coordinator.run_benchmark(DURATION_SEC)
        results = await coordinator.get_results()
    finally:
        await coordinator.stop()

    print(f"\n{'─'*55}")
    print(f"  Total orders   : {results['total_orders']}")
    print(f"  Success rate   : {results['success_rate']:.1%}")
    print(f"  Avg latency    : {results['avg_latency_ns']/1e6:.2f} ms")
    print(f"  p99 latency    : {results['p99_latency_ns']/1e6:.2f} ms")
    print(f"{'─'*55}")

    assert results["total_orders"] > 0, "No orders completed — is the server running?"
    print("✓ Coordinator benchmark test passed")


if __name__ == "__main__":
    asyncio.run(main())