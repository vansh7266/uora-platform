"""
UORA Correctness Validator
Compares contestant engine output against reference LOB output.
Detects price-time priority violations, state machine errors, and market invariant breaches.
"""

from __future__ import annotations

import json
import math
import sys
import difflib
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
        # Normalise so public-API "accepted" and internal "pending" are the same node.
        status = _normalize_status(resp.get("status", "unknown"))
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

    Combines two signals:
      * Node similarity (60 %) — captures order_id:status divergence even when
        each order appears only once (no repeated order_id → no edges).  This
        is the primary signal in the typical single-action-per-order scenario.
      * Edge similarity (40 %) — captures wrong state-transition sequences when
        an order appears in multiple actions (submit + cancel, etc.).

    Replaces exact GED with SequenceMatcher for O(N²) instead of NP-Hard.
    """
    n_ref = ref_graph.number_of_nodes()
    n_con = contestant_graph.number_of_nodes()

    # Trivial cases
    if n_ref == 0 and n_con == 0:
        return 1.0
    if n_ref == 0 or n_con == 0:
        return 0.0

    # Node similarity — primary signal.
    # Each node label is "order_id:status", so a wrong status means a different node.
    ref_nodes = sorted(ref_graph.nodes())
    con_nodes = sorted(contestant_graph.nodes())
    node_sim = difflib.SequenceMatcher(None, ref_nodes, con_nodes).ratio()

    # Edge similarity — catches wrong state-transition paths.
    ref_edges = sorted(f"{u}->{v}" for u, v in ref_graph.edges())
    con_edges = sorted(f"{u}->{v}" for u, v in contestant_graph.edges())
    edge_sim = (
        difflib.SequenceMatcher(None, ref_edges, con_edges).ratio()
        if (ref_edges or con_edges)
        else 1.0  # neither graph has edges → neither can diverge on transitions
    )

    return 0.6 * node_sim + 0.4 * edge_sim


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
        for index, action in enumerate(actions):
            ref_result = self._run_reference_action(action, index)
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

        # L3: Check market invariants on the contestant's implied book.
        # (Reference LOB is always valid — checking it never fires.)
        self._check_market_invariants(actions, contestant_responses)

        # L4: State Graph / Determinism Check
        # Annotate contestant responses with order_ids from the action list so
        # the graph builder produces meaningful node labels ("S1:filled" instead
        # of "order-1:filled") and can create cross-action transition edges when
        # the same order appears in multiple actions (e.g. submit then cancel).
        annotated_contestant: list[dict] = [
            {"order_id": action.get("order_id", f"order-{i}"), **resp}
            for i, (action, resp) in enumerate(
                zip(actions, contestant_responses[: len(actions)])
            )
        ]
        ref_graph = _build_state_graph(reference_states)
        con_graph = _build_state_graph(annotated_contestant)
        similarity = _ged_normalized(ref_graph, con_graph)
        
        if similarity < 1.0:
            self.violations.append(Violation(
                level=4,
                order_id="system",
                expected="similarity=1.0",
                actual=f"similarity={similarity:.4f}",
                description="L4 validation failed: contestant state machine diverges from reference",
            ))

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

    def _run_reference_action(self, action: dict, index: int) -> dict:
        """Run a single action through the reference LOB."""
        action_type = action.get("type", "").lower()

        if action_type in ("limit", "market", "ioc", "fok"):
            order_id = action.get("order_id", f"order-{index}")
            order = Order(
                id=order_id,
                side=action["side"],
                order_type=action_type,
                price=action.get("price"),
                quantity=_action_quantity(action),
                participant_id=action.get("participant_id", order_id),
            )
            fills, updated = self.reference_book.submit_order(order)
            return {
                "order_id": order_id,   # needed by L4 graph builder
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
            return {
                "order_id": action["order_id"],  # needed by L4 graph builder
                "type": "cancel",
                "success": success,
                "status": order.status if order else "not_found",
            }

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

        # L2: State machine validation — compare normalised status against reference.
        # Per-order transition-path checking (pending→partial_fill→filled) would need
        # the full event stream, not just per-action responses; the L4 graph check covers
        # that with the annotated contestant graph built in validate_submission.
        contestant_status = contestant_resp.get("status", "unknown")
        reference_status = ref_state.get("status", "unknown")

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

    def _check_market_invariants(
        self,
        actions: list[dict],
        contestant_responses: list[dict],
    ) -> None:
        """L3: Check market invariants on the contestant's implied order book.

        The reference LOB is always valid by construction, so checking it would
        never fire.  Instead, we reconstruct the contestant's *implied* open-order
        book from the reported statuses and check for a crossed market.

        A crossed market occurs when the contestant reports a pending buy order at
        price P_bid and a pending sell order at price P_ask with P_bid >= P_ask —
        meaning the engine should have matched them but didn't.
        """
        # ── Reconstruct contestant's implied open orders ─────────────────────
        # For each action, track the last known {status, price, side} per order_id.
        order_book: dict[str, dict] = {}

        for action, resp in zip(actions, contestant_responses[: len(actions)]):
            action_type = action.get("type", "").lower()

            if action_type in ("limit", "market", "ioc", "fok"):
                order_id = action.get("order_id")
                price = action.get("price")
                side = action.get("side", "").lower()
                status = _normalize_status(resp.get("status", "unknown"))
                if order_id and price is not None:
                    order_book[order_id] = {
                        "status": status,
                        "price": float(price),
                        "side": side,
                    }

            elif action_type == "cancel":
                cancel_id = action.get("order_id")
                if cancel_id and cancel_id in order_book:
                    order_book[cancel_id]["status"] = _normalize_status(
                        resp.get("status", "unknown")
                    )

        # ── Check for crossed contestant book ────────────────────────────────
        open_bids = [
            v["price"]
            for v in order_book.values()
            if v["status"] in ("pending", "partial_fill") and v["side"] == "buy"
        ]
        open_asks = [
            v["price"]
            for v in order_book.values()
            if v["status"] in ("pending", "partial_fill") and v["side"] == "sell"
        ]

        if open_bids and open_asks:
            best_bid = max(open_bids)
            best_ask = min(open_asks)
            if best_bid >= best_ask:
                self.violations.append(
                    Violation(
                        level=3,
                        order_id="contestant",
                        expected=f"best_bid({best_bid:.4f}) < best_ask({best_ask:.4f})",
                        actual=f"best_bid({best_bid:.4f}) >= best_ask({best_ask:.4f})",
                        description=(
                            f"L3: Contestant book crossed — bid {best_bid:.4f} >= ask {best_ask:.4f}. "
                            "Matching engine failed to execute a valid aggressor order."
                        ),
                    )
                )

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


def test_reference_fallback_ids_are_deterministic():
    validator = CorrectnessValidator()
    actions = [{"type": "limit", "side": "sell", "price": 100.0, "qty": 10}]

    first = validator._run_reference_action(actions[0], 0)
    validator = CorrectnessValidator()
    second = validator._run_reference_action(actions[0], 0)

    assert first == second


if __name__ == "__main__":
    test_validator()
    test_validator_flags_response_count_mismatch()
    test_validator_accepts_quantity_alias_from_openapi_actions()
    test_reference_fallback_ids_are_deterministic()
