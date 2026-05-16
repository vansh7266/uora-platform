"""
UORA LOBSTER Parser
~~~~~~~~~~~~~~~~~~~~
Reads LOBSTER (Limit Order Book System – The Efficient Reconstructor) CSV files
and converts them into UORA bot action dicts for replay against contestant engines.

LOBSTER message file format (one row per event):
    Time,EventType,OrderID,Size,Price,Direction
    36000.123456789,1,12345,100,10050,-1

Event types
-----------
1  Add Order       → "limit" action
2  Partial Cancel  → "cancel" action (qty = cancelled portion)
3  Delete Order    → "cancel" action (full remaining size)
4  Execute         → skipped (fill event, not a submission)
5  Hidden Exec     → skipped
7  Trading Halt    → skipped

Price encoding: integer 1/10000ths of a dollar (e.g. 100500000 = $100.50 for ITCH)
For standard LOBSTER samples: integer 1/100ths → divide by 100.
Direction: 1 = buy, -1 = sell
"""

from __future__ import annotations

import csv
import time
from pathlib import Path
from typing import Optional


# ── Constants ──────────────────────────────────────────────────────────────────
_LOBSTER_PRICE_DIVISOR: float = 100.0   # LOBSTER encodes price as cents integer
_SKIPPED_EVENT_TYPES: frozenset[int] = frozenset({4, 5, 7})

_DIRECTION_MAP: dict[int, str] = {
    1:  "buy",
    -1: "sell",
}


# ── Core parser ────────────────────────────────────────────────────────────────

def parse_lobster_csv(filepath: str) -> list[dict]:
    """
    Parse a LOBSTER message CSV file into a list of UORA action dicts.

    Parameters
    ----------
    filepath : str
        Path to the LOBSTER message file.  Expects columns:
        ``Time,EventType,OrderID,Size,Price,Direction``
        (with or without a header row).

    Returns
    -------
    list[dict]
        Actions ready to pass to ``TradingBot.run_scenario()`` or the
        ``CorrectnessValidator``.  Skipped event types (4, 5, 7) are omitted.

    Raises
    ------
    FileNotFoundError
        If *filepath* does not exist.
    ValueError
        If a row cannot be parsed (logged, then skipped — does not abort).
    """
    path = Path(filepath)
    if not path.exists():
        raise FileNotFoundError(f"LOBSTER file not found: {filepath}")

    actions: list[dict] = []

    with path.open(newline="") as fh:
        reader = csv.reader(fh)
        for line_no, row in enumerate(reader, start=1):
            if not row or row[0].strip().lower() in ("time", ""):
                continue  # skip header / blank lines

            try:
                action = _parse_row(row, line_no)
            except (ValueError, IndexError) as exc:
                # Malformed rows are skipped — LOBSTER files can have partial rows
                # at the end of a trading session.
                print(f"[lobster_parser] line {line_no}: skipped — {exc}")
                continue

            if action is not None:
                actions.append(action)

    return actions


def parse_lobster_rows(rows: list[list[str]]) -> list[dict]:
    """
    Parse pre-split rows (useful for unit tests or in-memory data).

    Parameters
    ----------
    rows : list[list[str]]
        Each inner list must be ``[time, event_type, order_id, size, price, direction]``.
    """
    actions: list[dict] = []
    for line_no, row in enumerate(rows, start=1):
        try:
            action = _parse_row(row, line_no)
        except (ValueError, IndexError) as exc:
            print(f"[lobster_parser] row {line_no}: skipped — {exc}")
            continue
        if action is not None:
            actions.append(action)
    return actions


# ── Internal helpers ───────────────────────────────────────────────────────────

def _parse_row(row: list[str], line_no: int) -> Optional[dict]:
    """
    Convert a single LOBSTER row into an action dict.
    Returns None for event types that should be skipped.
    """
    # Unpack — LOBSTER columns: Time, EventType, OrderID, Size, Price, Direction
    raw_time, raw_event, raw_order_id, raw_size, raw_price, raw_direction = (
        row[0].strip(),
        row[1].strip(),
        row[2].strip(),
        row[3].strip(),
        row[4].strip(),
        row[5].strip(),
    )

    event_type  = int(raw_event)
    order_id    = raw_order_id
    size        = int(raw_size)
    price_cents = int(raw_price)
    direction   = int(raw_direction)

    # Skip fill / halt events
    if event_type in _SKIPPED_EVENT_TYPES:
        return None

    # Convert price: LOBSTER stores as integer cents → dollars with 2dp
    price_dollars: float = price_cents / _LOBSTER_PRICE_DIVISOR

    # Map direction
    side = _DIRECTION_MAP.get(direction)
    if side is None:
        raise ValueError(f"Unknown direction value: {direction}")

    # Timestamp — LOBSTER time column is seconds since midnight as a float.
    # We use time.time_ns() as a nanosecond-epoch placeholder; in production
    # the session date would be added to reconstruct the real epoch timestamp.
    timestamp_ns: int = time.time_ns()

    participant_id = f"lobster-{order_id}"

    # ── Event type routing ─────────────────────────────────────────────────────
    if event_type == 1:
        # Add Order → new limit order submission
        return {
            "type":           "limit",
            "side":           side,
            "price":          price_dollars,
            "qty":            size,
            "order_id":       order_id,
            "timestamp":      timestamp_ns,
            "participant_id": participant_id,
        }

    elif event_type == 2:
        # Partial Cancel → cancel a portion of the resting order.
        # The Size field contains the *cancelled* quantity (not remaining).
        return {
            "type":           "cancel",
            "order_id":       order_id,
            "qty":            size,            # cancelled portion
            "timestamp":      timestamp_ns,
            "participant_id": participant_id,
        }

    elif event_type == 3:
        # Delete Order → cancel the entire remaining quantity.
        return {
            "type":           "cancel",
            "order_id":       order_id,
            "qty":            size,            # full remaining size at deletion
            "timestamp":      timestamp_ns,
            "participant_id": participant_id,
        }

    # Any unhandled type (shouldn't reach here given the skip set above)
    return None


# ── CLI self-test ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import json
    from pathlib import Path

    # Use bundled sample if no argument provided
    sample_path = Path(__file__).resolve().parents[2] / "data" / "lobster" / "sample.csv"

    if sample_path.exists():
        actions = parse_lobster_csv(str(sample_path))
        print(f"✓ Parsed {len(actions)} actions from {sample_path.name}")
        print(json.dumps(actions[:3], indent=2))
    else:
        # Inline smoke test
        test_rows = [
            ["36000.000000001", "1", "1001", "100", "10050",  "1"],   # buy limit  $100.50
            ["36000.000000002", "1", "1002", "50",  "10025", "-1"],   # sell limit $100.25
            ["36000.000000003", "2", "1001", "30",  "10050",  "1"],   # partial cancel
            ["36000.000000004", "3", "1002", "50",  "10025", "-1"],   # delete
            ["36000.000000005", "4", "1001", "70",  "10025", "-1"],   # execute — skipped
        ]
        actions = parse_lobster_rows(test_rows)
        print(f"✓ Parsed {len(actions)} actions (2 skipped: types 4)")
        for a in actions:
            print(" ", a)
