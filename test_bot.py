"""
UORA Bot Fleet — Integration Test
Runs a 10-worker benchmark against the reference server at http://127.0.0.1:8080.

Start the reference server first:
    cd ~/Desktop/uora
    source venv/bin/activate
    python contestant-sdk/python/reference_server.py
"""

from __future__ import annotations

import asyncio
import importlib.util
import json
import logging
import sys
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s  %(message)s",
    datefmt="%H:%M:%S",
)

# ── Dynamic imports (bot-fleet dir has hyphen, not importable as package) ──────
_FLEET_DIR = Path(__file__).resolve().parent / "uora" / "bot-fleet"

def _load(name: str, filename: str):
    spec = importlib.util.spec_from_file_location(name, _FLEET_DIR / filename)
    mod  = importlib.util.module_from_spec(spec)          # type: ignore[arg-type]
    spec.loader.exec_module(mod)                           # type: ignore[union-attr]
    return mod

_coord_mod  = _load("coordinator",    "coordinator.py")
_parser_mod = _load("lobster_parser", "lobster_parser.py")

BotCoordinator      = _coord_mod.BotCoordinator
parse_lobster_rows  = _parser_mod.parse_lobster_rows

# ── Sample LOBSTER rows (inline — no CSV file needed) ─────────────────────────
_SAMPLE_ROWS = [
    ["36000.000000001", "1", "2001", "100", "10050",  "1"],  # buy  limit $100.50
    ["36000.000000002", "1", "2002", "50",  "10075", "-1"],  # sell limit $100.75
    ["36000.000000003", "1", "2003", "200", "10025",  "1"],  # buy  limit $100.25
    ["36000.000000004", "1", "2004", "75",  "10100", "-1"],  # sell limit $101.00
    ["36000.000000005", "1", "2005", "150", "10000",  "1"],  # buy  limit $100.00
    ["36000.000000006", "1", "2006", "80",  "10125", "-1"],  # sell limit $101.25
    ["36000.000000007", "2", "2001", "30",  "10050",  "1"],  # partial cancel
    ["36000.000000008", "3", "2002", "50",  "10075", "-1"],  # delete
    ["36000.000000009", "1", "2007", "60",  "10050",  "1"],  # buy  limit $100.50
    ["36000.000000010", "1", "2008", "90",  "10075", "-1"],  # sell limit $100.75
]


async def main() -> None:
    base_url     = "http://127.0.0.1:8080"
    worker_count = 10
    duration_sec = 5   # short run for CI; increase for real load testing

    # ── Parse scenario ─────────────────────────────────────────────────────────
    actions = parse_lobster_rows(_SAMPLE_ROWS)
    # Filter cancels out of the replay — cancel IDs must exist on server first.
    # In a full benchmark the coordinator would track live order IDs.
    limit_actions = [a for a in actions if a["type"] == "limit"]
    print(f"Loaded {len(limit_actions)} limit actions for replay\n")

    # ── Also load sample_actions.json if available ─────────────────────────────
    sample_json = Path(__file__).resolve().parent / "data" / "lobster" / "sample_actions.json"
    if sample_json.exists():
        with sample_json.open() as fh:
            extra = [a for a in json.load(fh) if a["type"] == "limit"]
        limit_actions.extend(extra)
        print(f"+ Appended {len(extra)} actions from sample_actions.json "
              f"({len(limit_actions)} total)\n")

    # ── Run coordinator ────────────────────────────────────────────────────────
    coordinator = BotCoordinator()

    try:
        await coordinator.start(base_url, worker_count)
        await coordinator.load_scenario(limit_actions)
        await coordinator.run_benchmark(duration_sec)

        results = await coordinator.get_results()

    finally:
        await coordinator.stop()

    # ── Print per-worker summary ───────────────────────────────────────────────
    print("\n─── Per-Worker Results ───────────────────────────────────────────")
    total_orders = 0
    total_errors = 0
    for r in results:
        hist = r["histogram"]
        total_orders += r["orders"]
        total_errors += r["errors"]
        if hist:
            print(
                f"  Worker {r['worker_id']:>3} │ "
                f"orders={r['orders']:>4} │ "
                f"p50={hist['p50_ns']/1e6:>7.2f}ms │ "
                f"p99={hist['p99_ns']/1e6:>7.2f}ms │ "
                f"errors={r['errors']}"
            )
        else:
            print(f"  Worker {r['worker_id']:>3} │ no orders completed")

    print("─────────────────────────────────────────────────────────────────")
    print(f"  Fleet total: {total_orders} orders | {total_errors} errors")

    assert total_orders > 0, "No orders completed — is the server running?"
    print("\n✓ Coordinator benchmark test passed")


if __name__ == "__main__":
    asyncio.run(main())