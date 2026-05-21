"""
UORA Bot Fleet Coordinator
~~~~~~~~~~~~~~~~~~~~~~~~~~~
Orchestrates N async TradingBot workers for benchmark runs against
a contestant sandbox API.
"""

from __future__ import annotations

import asyncio
import logging
import math
import random
import statistics
import time
from typing import Any

from uora.bot_fleet.bot import TradingBot

logger = logging.getLogger(__name__)

_MIN_DELAY: float = 0.001   # 1 ms
_MAX_DELAY: float = 0.010   # 10 ms
_LOG_EVERY: int   = 100


def _action_qty(action: dict[str, Any]) -> int:
    """Support both LOBSTER-style qty and OpenAPI-style quantity."""
    return int(action.get("qty", action.get("quantity", 0)))


def _nearest_rank_percentile(sorted_values: list[int], percentile: float) -> int:
    """Return a deterministic nearest-rank percentile from an already sorted list."""
    if not sorted_values:
        return 0
    rank = math.ceil(len(sorted_values) * percentile)
    return sorted_values[min(max(rank, 1) - 1, len(sorted_values) - 1)]


class BotCoordinator:
    """Orchestrates a fleet of async TradingBot workers."""

    def __init__(self) -> None:
        self._bots:    list[TradingBot]     = []
        self._actions: list[dict[str, Any]] = []
        self._records: list[dict[str, Any]] = []   # all completed order records
        self._failures: list[dict[str, Any]] = []
        self._errors:  int                  = 0
        self._worker_count: int             = 0

    # ── Lifecycle ──────────────────────────────────────────────────────────────

    async def start(
        self,
        base_url: str,
        worker_count: int,
        submission_id: str = "dev",
        protocol: str = "REST",
    ) -> None:
        """Spawn *worker_count* TradingBots and connect them all in parallel."""
        self._worker_count = worker_count
        self._bots = [
            TradingBot(submission_id=submission_id, bot_id=str(i), protocol=protocol)
            for i in range(worker_count)
        ]
        await asyncio.gather(*(bot.connect(base_url) for bot in self._bots))
        logger.info("✓ %d workers connected to %s", worker_count, base_url)

    async def stop(self) -> None:
        """Close every bot connection."""
        await asyncio.gather(*(bot.close() for bot in self._bots))
        logger.info("✓ All sessions closed")

    # ── Scenario ───────────────────────────────────────────────────────────────

    async def load_scenario(self, actions: list[dict[str, Any]]) -> None:
        """Store scenario actions for replay during run_benchmark()."""
        self._actions = actions
        logger.info("✓ Loaded %d actions", len(actions))

    # ── Benchmark ──────────────────────────────────────────────────────────────

    async def run_benchmark(self, duration_sec: int) -> None:
        """
        Run all workers concurrently for *duration_sec* seconds.
        Each worker randomly picks an action, executes it, then sleeps 1–10 ms.
        """
        if not self._actions:
            raise RuntimeError("No scenario loaded — call load_scenario() first.")
        if not self._bots:
            raise RuntimeError("No workers — call start() first.")

        self._records = []
        self._failures = []
        self._errors  = 0

        deadline  = time.monotonic() + duration_sec
        completed = 0
        lock      = asyncio.Lock()

        async def _worker(bot: TradingBot, worker_id: int) -> None:
            nonlocal completed
            rng = random.Random(42 + worker_id)
            while time.monotonic() < deadline:
                action = rng.choice(self._actions)
                try:
                    result, latency_ns = await bot.measure_latency(
                        self._dispatch(bot, action)
                    )
                    async with lock:
                        self._records.append({
                            "worker_id":  worker_id,
                            "action":     action,
                            "result":     result,
                            "latency_ns": latency_ns,
                            "success":    True,
                        })
                        completed += 1
                        if completed % _LOG_EVERY == 0:
                            print(f"Progress: {completed} orders")
                except Exception as exc:
                    async with lock:
                        self._failures.append({
                            "worker_id": worker_id,
                            "action": action,
                            "error": str(exc),
                            "success": False,
                        })
                        self._errors += 1
                        completed += 1
                        logger.debug("Worker %d error: %s", worker_id, exc)

                await asyncio.sleep(rng.uniform(_MIN_DELAY, _MAX_DELAY))

        await asyncio.gather(*(
            _worker(bot, i) for i, bot in enumerate(self._bots)
        ))
        logger.info("✓ Benchmark done — %d orders, %d errors", completed, self._errors)

    # ── Results ────────────────────────────────────────────────────────────────

    async def get_results(self) -> dict[str, Any]:
        """
        Aggregate all worker results.

        Returns
        -------
        dict with keys:
            total_orders, avg_latency_ns, p99_latency_ns, success_rate, results
        """
        successful = len(self._records)
        failed = self._errors
        total  = successful + failed
        lats   = [int(r["latency_ns"]) for r in self._records]
        sorted_lats = sorted(lats) if lats else [0]

        return {
            "total_orders":   total,
            "successful_orders": successful,
            "failed_orders": failed,
            "avg_latency_ns": statistics.mean(sorted_lats) if lats else 0.0,
            "p50_latency_ns": _nearest_rank_percentile(sorted_lats, 0.50),
            "p90_latency_ns": _nearest_rank_percentile(sorted_lats, 0.90),
            "p99_latency_ns": _nearest_rank_percentile(sorted_lats, 0.99),
            "success_rate":   successful / max(total, 1),
            "error_rate":     failed / max(total, 1),
            "results":        self._records,
            "failed_results":  self._failures,
        }

    # ── Internal dispatch ──────────────────────────────────────────────────────

    async def _dispatch(self, bot: TradingBot, action: dict[str, Any]) -> dict[str, Any]:
        t = action.get("type", "").lower()
        if t == "limit":
            return await bot.send_limit_order(action["side"], float(action["price"]), _action_qty(action))
        if t == "market":
            return await bot.send_market_order(action["side"], _action_qty(action))
        if t == "ioc":
            return await bot.send_ioc_order(action["side"], float(action["price"]), _action_qty(action))
        if t == "fok":
            return await bot.send_fok_order(action["side"], float(action["price"]), _action_qty(action))
        if t == "cancel":
            return await bot.cancel_order(action["order_id"])
        raise ValueError(f"Unknown action type: {t!r}")
