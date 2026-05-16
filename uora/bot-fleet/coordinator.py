"""
UORA Bot Fleet Coordinator
~~~~~~~~~~~~~~~~~~~~~~~~~~~
Spawns N async TradingBot workers and distributes a LOBSTER action scenario
across them in parallel, collecting per-worker latency histograms.

Usage::

    coordinator = BotCoordinator()
    await coordinator.start("http://localhost:8080", worker_count=10)
    await coordinator.load_scenario(actions)          # from lobster_parser
    await coordinator.run_benchmark(duration_sec=30)
    results = await coordinator.get_results()
    await coordinator.stop()
"""

from __future__ import annotations

import asyncio
import logging
import random
import statistics
import time
from pathlib import Path
from sys import path as _sys_path
from typing import Any

# Bootstrap project root so this module is runnable directly.
_sys_path.insert(0, str(Path(__file__).resolve().parents[2]))

import importlib.util
import sys

# bot-fleet uses a hyphen which is invalid in Python package names.
# Load bot.py directly by file path.
_BOT_PATH = Path(__file__).resolve().parent / "bot.py"
_spec = importlib.util.spec_from_file_location("uora_bot", _BOT_PATH)
_mod  = importlib.util.module_from_spec(_spec)          # type: ignore[arg-type]
sys.modules["uora_bot"] = _mod                          # register before exec so @dataclass works
_spec.loader.exec_module(_mod)                           # type: ignore[union-attr]
TradingBot = _mod.TradingBot

logger = logging.getLogger(__name__)

_MIN_DELAY_SEC: float = 0.001   # 1 ms
_MAX_DELAY_SEC: float = 0.010   # 10 ms
_LOG_INTERVAL: int    = 100     # print progress every N completed orders


# ── Worker result container ────────────────────────────────────────────────────

class _WorkerResult:
    """Accumulates per-order results for a single bot worker."""

    def __init__(self, worker_id: int) -> None:
        self.worker_id = worker_id
        self.records: list[dict[str, Any]] = []
        self.errors: int = 0

    # Convenience properties for histogram computation
    @property
    def latencies_ns(self) -> list[int]:
        return [r["latency_ns"] for r in self.records]

    def histogram(self) -> dict[str, float | int]:
        lats = self.latencies_ns
        if not lats:
            return {}
        sorted_lats = sorted(lats)
        n = len(sorted_lats)
        return {
            "count":    n,
            "min_ns":   sorted_lats[0],
            "max_ns":   sorted_lats[-1],
            "mean_ns":  statistics.mean(sorted_lats),
            "p50_ns":   sorted_lats[int(n * 0.50)],
            "p90_ns":   sorted_lats[int(n * 0.90)],
            "p99_ns":   sorted_lats[min(int(n * 0.99), n - 1)],
            "errors":   self.errors,
        }


# ── BotCoordinator ─────────────────────────────────────────────────────────────

class BotCoordinator:
    """
    Manages a fleet of async ``TradingBot`` workers.

    Lifecycle::

        await coordinator.start(base_url, worker_count)
        await coordinator.load_scenario(actions)
        await coordinator.run_benchmark(duration_sec)
        results = await coordinator.get_results()
        await coordinator.stop()
    """

    def __init__(self) -> None:
        self._bots:       list[TradingBot]      = []
        self._results:    list[_WorkerResult]   = []
        self._actions:    list[dict[str, Any]]  = []
        self._base_url:   str                   = ""
        self._worker_count: int                 = 0

    # ── Lifecycle ──────────────────────────────────────────────────────────────

    async def start(self, base_url: str, worker_count: int) -> None:
        """
        Spawn *worker_count* ``TradingBot`` instances and connect them all.

        Each worker gets a unique ``participant_id`` header injected via the
        bot's ``x-request-id`` mechanism.
        """
        self._base_url     = base_url
        self._worker_count = worker_count
        self._bots         = [TradingBot() for _ in range(worker_count)]
        self._results      = [_WorkerResult(i) for i in range(worker_count)]

        logger.info("Connecting %d workers to %s …", worker_count, base_url)

        await asyncio.gather(
            *(bot.connect(base_url) for bot in self._bots)
        )

        logger.info("✓ All %d workers connected", worker_count)

    async def stop(self) -> None:
        """Close every bot's aiohttp session."""
        closers = []
        for bot in self._bots:
            if bot.session and not bot.session.closed:
                closers.append(bot.session.close())
        if closers:
            await asyncio.gather(*closers)
        logger.info("✓ All %d worker sessions closed", self._worker_count)

    # ── Scenario loading ───────────────────────────────────────────────────────

    async def load_scenario(self, actions: list[dict[str, Any]]) -> None:
        """
        Load a list of LOBSTER-parsed action dicts for replay.
        Call before ``run_benchmark()``.
        """
        self._actions = actions
        logger.info("✓ Loaded %d actions into coordinator", len(actions))

    # ── Benchmark execution ────────────────────────────────────────────────────

    async def run_benchmark(self, duration_sec: int) -> None:
        """
        Distribute actions across all workers randomly for *duration_sec* seconds.

        Workers run concurrently via ``asyncio.gather()``.
        Progress is logged every ``_LOG_INTERVAL`` completed orders.
        """
        if not self._actions:
            raise RuntimeError("No scenario loaded — call load_scenario() first.")
        if not self._bots:
            raise RuntimeError("No workers connected — call start() first.")

        deadline   = time.monotonic() + duration_sec
        completed  = 0
        total_lock = asyncio.Lock()

        async def _worker(bot: TradingBot, result: _WorkerResult) -> None:
            nonlocal completed
            while time.monotonic() < deadline:
                action = random.choice(self._actions)
                try:
                    record, latency_ns = await bot.measure_latency(
                        self._dispatch_action(bot, action)
                    )
                    result.records.append({
                        "action":     action,
                        "result":     record,
                        "latency_ns": latency_ns,
                    })
                except Exception as exc:
                    result.errors += 1
                    logger.debug("Worker %d error: %s", result.worker_id, exc)

                # Progress logging (coarse — no lock contention on every order)
                completed += 1
                if completed % _LOG_INTERVAL == 0:
                    elapsed = duration_sec - (deadline - time.monotonic())
                    logger.info(
                        "Progress: %d orders completed (%.1fs / %ds)",
                        completed, elapsed, duration_sec,
                    )

                # Jitter between orders to simulate realistic inter-arrival
                await asyncio.sleep(random.uniform(_MIN_DELAY_SEC, _MAX_DELAY_SEC))

        logger.info(
            "Starting benchmark: %d workers × %ds @ %s",
            self._worker_count, duration_sec, self._base_url,
        )

        await asyncio.gather(
            *(_worker(bot, result) for bot, result in zip(self._bots, self._results))
        )

        logger.info("✓ Benchmark complete — %d total orders", completed)

    # ── Results aggregation ────────────────────────────────────────────────────

    async def get_results(self) -> list[dict[str, Any]]:
        """
        Return per-worker result dicts including latency histograms.

        Also logs a fleet-wide aggregate summary.
        """
        output: list[dict[str, Any]] = []

        all_latencies: list[int] = []

        for result in self._results:
            hist = result.histogram()
            all_latencies.extend(result.latencies_ns)
            output.append({
                "worker_id": result.worker_id,
                "orders":    len(result.records),
                "errors":    result.errors,
                "histogram": hist,
            })

        # Fleet-wide summary
        if all_latencies:
            sorted_all = sorted(all_latencies)
            n = len(sorted_all)
            logger.info(
                "Fleet summary: %d orders | p50=%.2fms | p99=%.2fms | errors=%d",
                n,
                sorted_all[int(n * 0.50)] / 1e6,
                sorted_all[min(int(n * 0.99), n - 1)] / 1e6,
                sum(r.errors for r in self._results),
            )

        return output

    # ── Internal dispatch ──────────────────────────────────────────────────────

    async def _dispatch_action(
        self, bot: TradingBot, action: dict[str, Any]
    ) -> dict[str, Any]:
        """Route an action dict to the correct TradingBot method."""
        action_type = action.get("type", "").lower()

        if action_type == "limit":
            return await bot.send_limit_order(
                action["side"], float(action["price"]), int(action["qty"])
            )
        elif action_type == "market":
            return await bot.send_market_order(action["side"], int(action["qty"]))
        elif action_type == "ioc":
            return await bot.send_ioc_order(
                action["side"], float(action["price"]), int(action["qty"])
            )
        elif action_type == "fok":
            return await bot.send_fok_order(
                action["side"], float(action["price"]), int(action["qty"])
            )
        elif action_type == "cancel":
            return await bot.cancel_order(action["order_id"])
        else:
            raise ValueError(f"Unknown action type: {action_type!r}")
