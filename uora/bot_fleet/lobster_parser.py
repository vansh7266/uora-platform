"""
UORA LOBSTER Parser
~~~~~~~~~~~~~~~~~~~~
Converts LOBSTER (Limit Order Book System – The Efficient Reconstructor)
NASDAQ CSV files into UORA bot action dicts.

LOBSTER message file columns:
    Time, EventType, OrderID, Size, Price, Direction

Event types
-----------
1  Add Order       → "limit"  action
2  Partial Cancel  → "cancel" with cancelled qty
3  Delete Order    → "cancel" with full remaining size
4  Execute         → skipped
5  Hidden Exec     → skipped
7  Trading Halt    → skipped

Price: integer 1/100ths of a dollar  (10050 → $100.50)
Direction: 1 = buy, -1 = sell
"""

from __future__ import annotations

import csv
from pathlib import Path
from typing import Optional


_SKIP: frozenset[int] = frozenset({4, 5, 7})
_SIDE: dict[int, str] = {1: "buy", -1: "sell"}


def parse_lobster_csv(filepath: str) -> list[dict]:
    """
    Parse a LOBSTER message CSV and return a list of UORA action dicts.

    Parameters
    ----------
    filepath : str
        Path to the LOBSTER message file with columns:
        ``Time, EventType, OrderID, Size, Price, Direction``

    Returns
    -------
    list[dict]
        Actions ready for ``TradingBot.run_scenario()`` or ``BotCoordinator``.
        Event types 4, 5, 7 are silently skipped.
    """
    path = Path(filepath)
    if not path.exists():
        raise FileNotFoundError(f"LOBSTER file not found: {filepath}")

    actions: list[dict] = []
    with path.open(newline="") as fh:
        for lineno, row in enumerate(csv.reader(fh), 1):
            if not row or row[0].strip().lower() in ("time", ""):
                continue
            try:
                action = _parse_row(row)
            except (ValueError, IndexError) as exc:
                print(f"[lobster_parser] line {lineno}: skipped — {exc}")
                continue
            if action is not None:
                actions.append(action)
    return actions


# ── Internals ──────────────────────────────────────────────────────────────────

def _parse_row(row: list[str]) -> Optional[dict]:
    """Return an action dict for one LOBSTER row, or None if skipped."""
    event_type  = int(row[1].strip())
    if event_type in _SKIP:
        return None

    order_id    = row[2].strip()
    size        = int(row[3].strip())
    price_cents = int(row[4].strip())
    direction   = int(row[5].strip())

    price   = price_cents / 100.0
    side    = _SIDE.get(direction)
    if side is None:
        raise ValueError(f"Unknown direction: {direction}")

    ts = int(float(row[0]) * 1_000_000_000)
    pid = f"lobster-{order_id}"

    if event_type == 1:       # Add Order
        return {
            "type":           "limit",
            "side":           side,
            "price":          price,
            "qty":            size,
            "order_id":       order_id,
            "timestamp":      ts,
            "participant_id": pid,
        }
    if event_type == 2:       # Partial Cancel
        return {
            "type":           "cancel",
            "order_id":       order_id,
            "qty":            size,
            "timestamp":      ts,
            "participant_id": pid,
        }
    if event_type == 3:       # Delete
        return {
            "type":           "cancel",
            "order_id":       order_id,
            "timestamp":      ts,
            "participant_id": pid,
        }
    return None


# ── CLI smoke test ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import json

    # Inline test — no CSV file needed
    _ROWS = [
        ["36000.0", "1", "1001", "100", "10050",  "1"],
        ["36000.0", "1", "1002", "50",  "10025", "-1"],
        ["36000.0", "2", "1001", "30",  "10050",  "1"],
        ["36000.0", "3", "1002", "50",  "10025", "-1"],
        ["36000.0", "4", "1001", "70",  "10025", "-1"],  # skipped
    ]

    actions = []
    for row in _ROWS:
        a = _parse_row(row)
        if a:
            actions.append(a)

    print(f"✓ Parsed {len(actions)} actions (1 skipped: type 4)")
    for a in actions:
        print(" ", a)
