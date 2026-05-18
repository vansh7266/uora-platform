"""
UORA Bot Fleet Coordinator
~~~~~~~~~~~~~~~~~~~~~~~~~~~
Orchestrates N async TradingBot workers for benchmark runs against
a contestant sandbox API.
"""

from __future__ import annotations

import asyncio
import logging
import random
import statistics
import time
from typing import Any

from uora.bot_fleet.bot import TradingBot

logger = logging.getLogger(__name__)

_MIN_DELAY: float = 0.001   # 1 ms
_MAX_DELAY: float = 0.010   # 10 ms
_LOG_EVERY: int   = 100


class BotCoordinator:
    """Orchestrates a fleet of async TradingBot workers."""

    def __init__(self) -> None:
        self._bots:    list[TradingBot]     = []
        self._actions: list[dict[str, Any]] = []
        self._records: list[dict[str, Any]] = []   # all completed order records
        self._errors:  int                  = 0
        self._worker_count: int             = 0

    # ── Lifecycle ──────────────────────────────────────────────────────────────

    async def start(self, base_url: str, worker_count: int) -> None:
        """Spawn *worker_count* TradingBots and connect them all in parallel."""
        self._worker_count = worker_count
        self._bots = [TradingBot() for _ in range(worker_count)]
        await asyncio.gather(*(bot.connect(base_url) for bot in self._bots))
        logger.info("✓ %d workers connected to %s", worker_count, base_url)

    async def stop(self) -> None:
        """Close every bot's aiohttp session."""
        await asyncio.gather(*(
            bot.session.close()
            for bot in self._bots
            if bot.session and not bot.session.closed
        ))
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
        self._errors  = 0

        deadline  = time.monotonic() + duration_sec
        completed = 0
        lock      = asyncio.Lock()

        async def _worker(bot: TradingBot, worker_id: int) -> None:
            nonlocal completed
            while time.monotonic() < deadline:
                action = random.choice(self._actions)
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
                        self._errors += 1
                        completed += 1
                        logger.debug("Worker %d error: %s", worker_id, exc)

                await asyncio.sleep(random.uniform(_MIN_DELAY, _MAX_DELAY))

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
        total  = len(self._records) + self._errors
        lats   = [r["latency_ns"] for r in self._records]
        sorted_lats = sorted(lats) if lats else [0]
        n = len(sorted_lats)

        return {
            "total_orders":   total,
            "avg_latency_ns": statistics.mean(sorted_lats) if lats else 0.0,
            "p99_latency_ns": sorted_lats[min(int(n * 0.99), n - 1)],
            "success_rate":   len(self._records) / max(total, 1),
            "results":        self._records,
        }

    # ── Internal dispatch ──────────────────────────────────────────────────────

    async def _dispatch(self, bot: TradingBot, action: dict[str, Any]) -> dict[str, Any]:
        t = action.get("type", "").lower()
        if t == "limit":
            return await bot.send_limit_order(action["side"], float(action["price"]), int(action["qty"]))
        if t == "market":
            return await bot.send_market_order(action["side"], int(action["qty"]))
        if t == "ioc":
            return await bot.send_ioc_order(action["side"], float(action["price"]), int(action["qty"]))
        if t == "fok":
            return await bot.send_fok_order(action["side"], float(action["price"]), int(action["qty"]))
        if t == "cancel":
            return await bot.cancel_order(action["order_id"])
        raise ValueError(f"Unknown action type: {t!r}")
