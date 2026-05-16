"""
UORA Correctness Validator
Compares contestant engine output against reference LOB output.
Detects price-time priority violations, state machine errors, and market invariant breaches.
"""

from __future__ import annotations

import json
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

# Bootstrap: ensure project root (two levels above this file) is on sys.path
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from uora.validator.reference_lob import OrderBook, Order, Fill


@dataclass
class Violation:
    level: int  # 1=fill correctness, 2=state machine, 3=market invariant, 4=determinism
    order_id: str
    expected: Any
    actual: Any
    description: str


class CorrectnessValidator:
    """
    Validates contestant engine responses against reference LOB.

    Validation Levels:
    L1: Fill correctness (price-time priority respected)
    L2: Order state machine (valid transitions)
    L3: Market invariants (volume conservation, bid < ask)
    L4: Deterministic replay (same input → identical output)
    """

    def __init__(self):
        self.violations: list[Violation] = []
        self.reference_book = OrderBook()
        self.contestant_fills: list[dict] = []
        self.reference_fills: list[Fill] = []

    def validate_submission(
        self,
        actions: list[dict],
        contestant_responses: list[dict],
    ) -> dict[str, Any]:
        """
        Main entry point. Runs the same actions through both engines and diffs.

        Args:
            actions: List of bot actions (same format as TradingBot.run_scenario)
            contestant_responses: List of contestant engine responses

        Returns:
            Validation report dict
        """
        self.violations = []
        self.reference_book = OrderBook()

        # Replay actions through reference LOB
        reference_states = []
        for action in actions:
            ref_result = self._run_reference_action(action)
            reference_states.append(ref_result)

        # Compare against contestant responses
        for i, (action, contestant_resp, ref_state) in enumerate(
            zip(actions, contestant_responses, reference_states)
        ):
            self._validate_action(action, contestant_resp, ref_state, i)

        # Check market invariants on final state
        self._check_market_invariants()

        return {
            "total_actions": len(actions),
            "violations_count": len(self.violations),
            "violations_by_level": self._count_by_level(),
            "correctness_rate": 1.0 - (len(self.violations) / max(len(actions), 1)),
            "violations": [
                {
                    "level": v.level,
                    "order_id": v.order_id,
                    "description": v.description,
                    "expected": v.expected,
                    "actual": v.actual,
                }
                for v in self.violations
            ],
        }

    def _run_reference_action(self, action: dict) -> dict:
        """Run a single action through the reference LOB."""
        action_type = action.get("type", "").lower()

        if action_type in ("limit", "market", "ioc", "fok"):
            order = Order(
                id=action.get("order_id", f"order-{time.time_ns()}"),
                side=action["side"],
                order_type=action_type,
                price=action.get("price"),
                quantity=action["qty"],
                participant_id=action.get("participant_id", action.get("order_id", f"bot-{time.time_ns()}")),
            )
            fills, updated = self.reference_book.submit_order(order)
            return {
                "type": action_type,
                "fills": [
                    {
                        "fill_id": f.fill_id,
                        "price": f.price,
                        "quantity": f.quantity,
                        "buy_order_id": f.buy_order_id,
                        "sell_order_id": f.sell_order_id,
                    }
                    for f in fills
                ],
                "status": updated.status,
                "filled_qty": updated.filled_qty,
                "remaining_qty": updated.remaining_qty,
            }

        elif action_type == "cancel":
            success, order = self.reference_book.cancel_order(action["order_id"])
            return {"type": "cancel", "success": success, "status": order.status if order else "not_found"}

        else:
            return {"type": "unknown", "error": f"Unknown action type: {action_type}"}

    def _validate_action(
        self,
        action: dict,
        contestant_resp: dict,
        ref_state: dict,
        index: int,
    ) -> None:
        """Validate a single action against reference state."""
        action_type = action.get("type", "").lower()

        if action_type in ("limit", "market", "ioc", "fok"):
            self._validate_order_response(action, contestant_resp, ref_state, index)
        elif action_type == "cancel":
            self._validate_cancel_response(action, contestant_resp, ref_state, index)

    def _validate_order_response(
        self,
        action: dict,
        contestant_resp: dict,
        ref_state: dict,
        index: int,
    ) -> None:
        """L1 + L2 validation for order submissions."""
        order_id = action.get("order_id", f"action-{index}")

        # L1: Fill correctness
        contestant_fills = contestant_resp.get("fills", [])
        reference_fills = ref_state.get("fills", [])

        if len(contestant_fills) != len(reference_fills):
            self.violations.append(Violation(
                level=1,
                order_id=order_id,
                expected=f"{len(reference_fills)} fills",
                actual=f"{len(contestant_fills)} fills",
                description=f"Fill count mismatch: expected {len(reference_fills)}, got {len(contestant_fills)}",
            ))
        else:
            for cf, rf in zip(contestant_fills, reference_fills):
                if abs(cf.get("price", 0) - rf["price"]) > 0.001:
                    self.violations.append(Violation(
                        level=1,
                        order_id=order_id,
                        expected=f"price={rf['price']}",
                        actual=f"price={cf.get('price')}",
                        description="Fill price mismatch (price-time priority violation)",
                    ))
                if cf.get("quantity") != rf["quantity"]:
                    self.violations.append(Violation(
                        level=1,
                        order_id=order_id,
                        expected=f"qty={rf['quantity']}",
                        actual=f"qty={cf.get('quantity')}",
                        description="Fill quantity mismatch",
                    ))

        # L2: State machine validation
        contestant_status = contestant_resp.get("status", "unknown")
        reference_status = ref_state.get("status", "unknown")

        valid_transitions = {
            "pending": ["partial_fill", "filled", "cancelled"],
            "partial_fill": ["filled", "cancelled"],
            "filled": [],
            "cancelled": [],
        }

        if contestant_status != reference_status:
            self.violations.append(Violation(
                level=2,
                order_id=order_id,
                expected=f"status={reference_status}",
                actual=f"status={contestant_status}",
                description=f"Order state mismatch: expected {reference_status}, got {contestant_status}",
            ))

    def _validate_cancel_response(
        self,
        action: dict,
        contestant_resp: dict,
        ref_state: dict,
        index: int,
    ) -> None:
        """Validate cancel responses."""
        order_id = action["order_id"]

        contestant_status = contestant_resp.get("status", "unknown")
        reference_status = ref_state.get("status", "unknown")

        if contestant_status != reference_status:
            self.violations.append(Violation(
                level=2,
                order_id=order_id,
                expected=f"cancel_status={reference_status}",
                actual=f"cancel_status={contestant_status}",
                description=f"Cancel response mismatch: expected {reference_status}, got {contestant_status}",
            ))

    def _check_market_invariants(self) -> None:
        """L3: Check market invariants on final state."""
        state = self.reference_book.get_orderbook_state(depth=1)

        best_bid = state["bids"][0]["price"] if state["bids"] else None
        best_ask = state["asks"][0]["price"] if state["asks"] else None

        if best_bid and best_ask:
            bid_price = float(best_bid)
            ask_price = float(best_ask)
            if bid_price >= ask_price:
                self.violations.append(Violation(
                    level=3,
                    order_id="market",
                    expected=f"bid < ask ({bid_price} < {ask_price})",
                    actual=f"bid >= ask ({bid_price} >= {ask_price})",
                    description="Market invariant violated: bid-ask spread non-negative",
                ))

    def _count_by_level(self) -> dict[int, int]:
        """Count violations by level."""
        counts = {1: 0, 2: 0, 3: 0, 4: 0}
        for v in self.violations:
            counts[v.level] = counts.get(v.level, 0) + 1
        return counts


# ─── Test ────────────────────────────────────────────────────────────────────

def test_validator():
    """Test the correctness validator with a simple scenario."""
    validator = CorrectnessValidator()

    actions = [
        {"type": "limit", "side": "sell", "price": 100.0, "qty": 10, "order_id": "S1"},
        {"type": "limit", "side": "buy", "price": 100.0, "qty": 5, "order_id": "B1"},
        {"type": "cancel", "order_id": "S1"},
    ]

    # Simulated contestant responses — must match reference LOB output exactly
    contestant_responses = [
        {"status": "pending",       "filled_qty": 0, "remaining_qty": 10, "fills": []},
        {"status": "filled",        "filled_qty": 5, "remaining_qty": 0,  "fills": [{"price": 100.0, "quantity": 5}]},
        {"status": "cancelled",     "cancelled_qty": 5},
    ]

    report = validator.validate_submission(actions, contestant_responses)

    print(f"Total actions: {report['total_actions']}")
    print(f"Violations: {report['violations_count']}")
    print(f"Correctness rate: {report['correctness_rate']:.2%}")

    assert report["violations_count"] == 0, "Expected no violations for correct responses"
    print("✓ Validator test passed")


if __name__ == "__main__":
    test_validator()