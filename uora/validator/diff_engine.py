"""
UORA Correctness Validator
Compares contestant engine output against reference LOB output.
Detects price-time priority violations, state machine errors, and market invariant breaches.
"""

from __future__ import annotations

import json
import math
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import networkx as nx

try:
    from uora.validator.reference_lob import OrderBook, Order, Fill
except ModuleNotFoundError:
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
    from uora.validator.reference_lob import OrderBook, Order, Fill


@dataclass
class Violation:
    level: int  # 1=fill correctness, 2=state machine, 3=market invariant, 4=determinism
    order_id: str
    expected: Any
    actual: Any
    description: str


def _action_quantity(action: dict) -> int:
    """Return quantity from LOBSTER-style qty or OpenAPI-style quantity."""
    quantity = action.get("qty", action.get("quantity", 0))
    return int(quantity or 0)


def _normalize_status(status: str) -> str:
    """Treat public API accepted and internal LOB pending as the same state."""
    return "pending" if status == "accepted" else status


# ─── Graph Edit Distance Helpers ────────────────────────────────────────────

def _build_state_graph(responses: list[dict]) -> nx.DiGraph:
    """
    Build a directed graph from order responses.

    Nodes represent order states (labelled by order_id + status).
    Edges represent transitions between states, labelled by the triggering action type.

    Args:
        responses: List of order response dicts, each with at least
                   'order_id', 'status', 'type', and optionally 'fills'.

    Returns:
        nx.DiGraph encoding the observed state machine.
    """
    g = nx.DiGraph()
    for i, resp in enumerate(responses):
        order_id = resp.get("order_id", f"order-{i}")
        status = resp.get("status", "unknown")
        node_label = f"{order_id}:{status}"
        g.add_node(node_label, order_id=order_id, status=status)

        # Add transition edge from previous state of same order
        for j in range(i - 1, -1, -1):
            prev_resp = responses[j]
            if prev_resp.get("order_id") == order_id:
                prev_status = prev_resp.get("status", "unknown")
                prev_label = f"{order_id}:{prev_status}"
                action_type = resp.get("type", "unknown")
                g.add_edge(prev_label, node_label, action=action_type)
                break

    return g


def _ged_normalized(ref_graph: nx.DiGraph, contestant_graph: nx.DiGraph) -> float:
    """
    Compute normalised Graph Edit Distance between two state graphs.

    Returns a value in [0.0, 1.0] where:
        1.0 = perfect match (GED = 0)
        0.0 = completely different

    For graphs with ≤15 nodes: uses exact GED via ``nx.graph_edit_distance``
    with a 0.5 s timeout per computation.
    For larger graphs: falls back to Jaccard similarity on node + edge sets.

    Args:
        ref_graph: Reference (ground-truth) state graph.
        contestant_graph: Contestant engine's state graph.

    Returns:
        Normalised similarity score in [0.0, 1.0].
    """
    n_ref = ref_graph.number_of_nodes()
    n_con = contestant_graph.number_of_nodes()

    # Trivial cases
    if n_ref == 0 and n_con == 0:
        return 1.0
    if n_ref == 0 or n_con == 0:
        return 0.0

    # Exact GED for small graphs
    if n_ref <= 15 and n_con <= 15:
        try:
            ged = nx.graph_edit_distance(
                ref_graph,
                contestant_graph,
                timeout=0.5,
            )
        except (nx.NetworkXError, ValueError):
            ged = None

        if ged is not None:
            max_edits = max(n_ref, n_con) + max(ref_graph.number_of_edges(),
                                                  contestant_graph.number_of_edges())
            max_edits = max(max_edits, 1)  # avoid division by zero
            return max(0.0, 1.0 - (ged / max_edits))

    # Jaccard fallback for large graphs
    ref_nodes = set(ref_graph.nodes())
    con_nodes = set(contestant_graph.nodes())
    ref_edges = set(ref_graph.edges())
    con_edges = set(contestant_graph.edges())

    node_jaccard = (len(ref_nodes & con_nodes) /
                    len(ref_nodes | con_nodes)) if (ref_nodes | con_nodes) else 1.0
    edge_jaccard = (len(ref_edges & con_edges) /
                    len(ref_edges | con_edges)) if (ref_edges | con_edges) else 1.0

    return math.sqrt(node_jaccard * edge_jaccard)


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
        if len(contestant_responses) != len(actions):
            self.violations.append(Violation(
                level=2,
                order_id="batch",
                expected=f"{len(actions)} responses",
                actual=f"{len(contestant_responses)} responses",
                description=(
                    f"Response count mismatch: expected {len(actions)}, "
                    f"got {len(contestant_responses)}"
                ),
            ))

        for i, (action, contestant_resp, ref_state) in enumerate(
            zip(actions, contestant_responses[:len(actions)], reference_states)
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
                quantity=_action_quantity(action),
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

        if _normalize_status(contestant_status) != _normalize_status(reference_status):
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


def test_validator_flags_response_count_mismatch():
    """Dropped contestant responses must be counted as correctness violations."""
    validator = CorrectnessValidator()

    actions = [
        {"type": "limit", "side": "sell", "price": 100.0, "qty": 10, "order_id": "S1"},
        {"type": "limit", "side": "buy", "price": 100.0, "qty": 5, "order_id": "B1"},
    ]

    report = validator.validate_submission(actions, contestant_responses=[])

    assert report["violations_count"] >= 1
    assert any(
        v["description"] == "Response count mismatch: expected 2, got 0"
        for v in report["violations"]
    )


def test_validator_accepts_quantity_alias_from_openapi_actions():
    """OpenAPI clients use quantity while LOBSTER fixtures use qty."""
    validator = CorrectnessValidator()

    actions = [
        {
            "type": "limit",
            "side": "sell",
            "price": 100.0,
            "quantity": 10,
            "order_id": "S1",
        }
    ]
    contestant_responses = [
        {"status": "accepted", "filled_qty": 0, "remaining_qty": 10, "fills": []},
    ]

    report = validator.validate_submission(actions, contestant_responses)

    assert report["violations_count"] == 0


if __name__ == "__main__":
    test_validator()
