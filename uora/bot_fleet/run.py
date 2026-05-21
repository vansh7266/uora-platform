"""
Kubernetes entrypoint for running a UORA bot-fleet benchmark.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from pathlib import Path

from uora.bot_fleet.coordinator import BotCoordinator
from uora.bot_fleet.lobster_parser import parse_lobster_csv


logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)-7s %(name)s %(message)s",
)
logger = logging.getLogger("uora.bot_fleet.run")


def _load_actions(path: Path) -> list[dict]:
    if not path.exists():
        raise FileNotFoundError(f"Scenario file not found: {path}")
    if path.suffix.lower() == ".json":
        with path.open() as fh:
            actions = json.load(fh)
        if not isinstance(actions, list):
            raise ValueError("Scenario JSON must contain a list of actions")
        return actions
    return parse_lobster_csv(str(path))


async def main() -> None:
    target_url = os.getenv("TARGET_URL")
    if not target_url:
        raise RuntimeError("TARGET_URL is required")

    worker_count = int(os.getenv("WORKER_COUNT", "100"))
    duration_sec = int(os.getenv("DURATION_SEC", "30"))
    scenario_file = Path(os.getenv("SCENARIO_FILE", "data/lobster/sample_actions.json"))
    submission_id = os.getenv("SUBMISSION_ID", "dev")
    protocol = os.getenv("PROTOCOL", "REST")

    actions = _load_actions(scenario_file)
    coordinator = BotCoordinator()

    try:
        await coordinator.start(target_url, worker_count, submission_id=submission_id, protocol=protocol)
        await coordinator.load_scenario(actions)
        await coordinator.run_benchmark(duration_sec)
        results = await coordinator.get_results()
    finally:
        await coordinator.stop()

    print(json.dumps({
        "submission_id": submission_id,
        "target_url": target_url,
        "worker_count": worker_count,
        "duration_sec": duration_sec,
        "results": results,
    }, default=str))

    if results["total_orders"] <= 0:
        raise RuntimeError("Benchmark completed with zero orders")


if __name__ == "__main__":
    asyncio.run(main())
