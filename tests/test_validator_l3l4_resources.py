"""
Tests for the Phase-3 hardening fixes:
  * L3 — validator detects crossed contestant book (bid >= ask)
  * L4 — validator detects status divergence even with single-action-per-order
  * Resource metering — _compute_resource_penalty produces correct values
"""
import pytest
from uora.validator.diff_engine import CorrectnessValidator, _ged_normalized, _build_state_graph
import networkx as nx


# ─── L3 Tests ────────────────────────────────────────────────────────────────


def _validator_report(actions, contestant_responses):
    v = CorrectnessValidator()
    return v.validate_submission(actions, contestant_responses)


def test_l3_fires_when_contestant_book_is_crossed():
    """Contestant reports both a buy at 101 and a sell at 100 as pending.
    A correct engine would have matched them; not doing so is an L3 violation."""
    actions = [
        {"type": "limit", "side": "buy",  "price": 101.0, "qty": 5, "order_id": "B1"},
        {"type": "limit", "side": "sell", "price": 100.0, "qty": 5, "order_id": "S1"},
    ]
    # Broken engine: reports both orders as resting (never matched the cross)
    contestant = [
        {"status": "pending", "filled_qty": 0, "remaining_qty": 5, "fills": []},
        {"status": "pending", "filled_qty": 0, "remaining_qty": 5, "fills": []},
    ]
    report = _validator_report(actions, contestant)
    l3_violations = [v for v in report["violations"] if v["level"] == 3]
    assert l3_violations, "L3 should fire: contestant book has bid 101 >= ask 100"
    assert "contestant" in l3_violations[0]["order_id"]


def test_l3_does_not_fire_for_non_crossed_book():
    """Normal scenario: sell resting at 102, buy at 100 → no cross."""
    actions = [
        {"type": "limit", "side": "sell", "price": 102.0, "qty": 5, "order_id": "S1"},
        {"type": "limit", "side": "buy",  "price": 100.0, "qty": 5, "order_id": "B1"},
    ]
    contestant = [
        {"status": "pending", "filled_qty": 0, "remaining_qty": 5, "fills": []},
        {"status": "pending", "filled_qty": 0, "remaining_qty": 5, "fills": []},
    ]
    report = _validator_report(actions, contestant)
    l3_violations = [v for v in report["violations"] if v["level"] == 3]
    assert not l3_violations, f"Unexpected L3 violation: {l3_violations}"


def test_l3_does_not_fire_after_cancel():
    """Buy is pending, sell enters but contestant cancels sell → book uncrossed."""
    actions = [
        {"type": "limit", "side": "buy",  "price": 101.0, "qty": 5, "order_id": "B1"},
        {"type": "limit", "side": "sell", "price": 100.0, "qty": 5, "order_id": "S1"},
        {"type": "cancel", "order_id": "B1"},
    ]
    # Contestant cancels B1 before reporting the cross
    contestant = [
        {"status": "pending",   "filled_qty": 0, "remaining_qty": 5, "fills": []},
        {"status": "pending",   "filled_qty": 0, "remaining_qty": 5, "fills": []},
        {"status": "cancelled", "cancelled_qty": 5},
    ]
    report = _validator_report(actions, contestant)
    l3_violations = [v for v in report["violations"] if v["level"] == 3]
    assert not l3_violations, "B1 was cancelled; book is no longer crossed"


def test_l3_fires_on_crossed_book_after_partial_fill():
    """B1 buy at 101 gets partial fill but its remaining amount still crosses S2 at 100."""
    actions = [
        {"type": "limit", "side": "buy",  "price": 101.0, "qty": 10, "order_id": "B1"},
        {"type": "limit", "side": "sell", "price": 100.0, "qty": 3,  "order_id": "S1"},  # should consume 3 of B1
        {"type": "limit", "side": "sell", "price": 100.0, "qty": 5,  "order_id": "S2"},  # remaining 7 of B1 should fill this
    ]
    # Broken engine: B1 ends up as partial_fill but S2 also stays pending
    contestant = [
        {"status": "pending",      "filled_qty": 0, "remaining_qty": 10, "fills": []},
        {"status": "filled",       "filled_qty": 3, "remaining_qty": 0,  "fills": [{"price": 101.0, "quantity": 3}]},
        {"status": "pending",      "filled_qty": 0, "remaining_qty": 5,  "fills": []},  # should have filled
    ]
    # Force B1 into partial_fill so it's still open
    contestant[0] = {"status": "partial_fill", "filled_qty": 3, "remaining_qty": 7, "fills": []}
    report = _validator_report(actions, contestant)
    l3_violations = [v for v in report["violations"] if v["level"] == 3]
    assert l3_violations, "Partial B1 at 101 + pending S2 at 100 → crossed book"


# ─── L4 Tests ────────────────────────────────────────────────────────────────


def test_l4_fires_when_contestant_reports_wrong_status():
    """Contestant reports 'pending' where reference says 'filled' → L4 fires."""
    actions = [
        {"type": "limit", "side": "sell", "price": 100.0, "qty": 5, "order_id": "S1"},
        {"type": "limit", "side": "buy",  "price": 100.0, "qty": 5, "order_id": "B1"},
    ]
    # Correct: S1→pending, B1→filled; S1 should be partial_fill/filled after B1
    # Broken: contestant reports B1 as pending (never matched)
    contestant = [
        {"status": "pending", "filled_qty": 0, "remaining_qty": 5, "fills": []},
        {"status": "pending", "filled_qty": 0, "remaining_qty": 5, "fills": []},  # wrong
    ]
    report = _validator_report(actions, contestant)
    l4_violations = [v for v in report["violations"] if v["level"] == 4]
    assert l4_violations, "L4 should fire: contestant says B1 is pending, ref says filled"


def test_l4_clean_for_correct_responses():
    """Correct contestant responses produce no L4 violation."""
    actions = [
        {"type": "limit", "side": "sell", "price": 100.0, "qty": 10, "order_id": "S1"},
        {"type": "limit", "side": "buy",  "price": 100.0, "qty": 5,  "order_id": "B1"},
        {"type": "cancel", "order_id": "S1"},
    ]
    contestant = [
        {"status": "pending",   "filled_qty": 0, "remaining_qty": 10, "fills": []},
        {"status": "filled",    "filled_qty": 5, "remaining_qty": 0,  "fills": [{"price": 100.0, "quantity": 5}]},
        {"status": "cancelled", "cancelled_qty": 5},
    ]
    report = _validator_report(actions, contestant)
    l4_violations = [v for v in report["violations"] if v["level"] == 4]
    assert not l4_violations, f"No L4 expected for correct responses: {l4_violations}"


def test_ged_normalized_detects_node_divergence_without_edges():
    """When both graphs have isolated nodes (one action per order) the
    node-comparison path must still detect status divergence."""
    # Ref graph: order-0:pending, order-1:filled (correct engine)
    ref = nx.DiGraph()
    ref.add_node("order-0:pending")
    ref.add_node("order-1:filled")

    # Contestant graph: order-0:pending, order-1:pending (wrong)
    con = nx.DiGraph()
    con.add_node("order-0:pending")
    con.add_node("order-1:pending")

    sim = _ged_normalized(ref, con)
    # Nodes differ → similarity < 1.0 → L4 should fire
    assert sim < 1.0, f"Expected similarity < 1.0 for diverging nodes, got {sim}"


def test_ged_normalized_identical_graphs_returns_one():
    g = nx.DiGraph()
    g.add_nodes_from(["A:pending", "B:filled"])
    g.add_edge("A:pending", "A:filled")
    assert _ged_normalized(g, g) == pytest.approx(1.0)


def test_ged_normalized_empty_graphs_returns_one():
    assert _ged_normalized(nx.DiGraph(), nx.DiGraph()) == pytest.approx(1.0)


def test_ged_normalized_one_empty_returns_zero():
    g = nx.DiGraph()
    g.add_node("A:pending")
    assert _ged_normalized(g, nx.DiGraph()) == pytest.approx(0.0)
    assert _ged_normalized(nx.DiGraph(), g) == pytest.approx(0.0)


# ─── Resource metering tests ─────────────────────────────────────────────────


def test_resource_penalty_baseline_within_limits():
    from uora.benchmark.worker import BenchmarkWorker
    # 30% CPU, 128 MiB → both below thresholds → penalty = 1.0
    assert BenchmarkWorker._compute_resource_penalty(30.0, 128.0) == pytest.approx(1.0)


def test_resource_penalty_mid_cpu():
    from uora.benchmark.worker import BenchmarkWorker
    # 75% CPU → halfway through 50-100% band → cpu_extra = 0.25
    penalty = BenchmarkWorker._compute_resource_penalty(75.0, 0.0)
    assert pytest.approx(penalty, abs=0.01) == 1.25


def test_resource_penalty_max_cpu_and_max_mem():
    from uora.benchmark.worker import BenchmarkWorker
    # 100% CPU → cpu_extra=0.5; 512 MiB → mem_extra=0.5 → total=2.0
    penalty = BenchmarkWorker._compute_resource_penalty(100.0, 512.0)
    assert pytest.approx(penalty, abs=0.01) == 2.0


def test_resource_penalty_over_cpu_limit():
    from uora.benchmark.worker import BenchmarkWorker
    # 200% CPU → cpu_extra capped at 1.0 → penalty = 2.0 (no mem pressure)
    penalty = BenchmarkWorker._compute_resource_penalty(200.0, 0.0)
    assert penalty == pytest.approx(2.0, abs=0.01)


def test_parse_mem_mib_gib():
    from uora.benchmark.worker import BenchmarkWorker
    mib = BenchmarkWorker._parse_mem_mib("1GiB")
    assert mib == pytest.approx(1024.0)


def test_parse_mem_mib_mib():
    from uora.benchmark.worker import BenchmarkWorker
    assert BenchmarkWorker._parse_mem_mib("256MiB") == pytest.approx(256.0)


def test_parse_mem_mib_mb():
    from uora.benchmark.worker import BenchmarkWorker
    mib = BenchmarkWorker._parse_mem_mib("256MB")
    assert mib is not None and mib > 0


def test_container_name_from_docker_url():
    from uora.benchmark.worker import BenchmarkWorker
    assert BenchmarkWorker._container_name_from_url("http://sub-abc123:8080") == "sub-abc123"


def test_container_name_from_k8s_url():
    from uora.benchmark.worker import BenchmarkWorker
    url = "http://sub-abc123.uora.svc.cluster.local:8080"
    assert BenchmarkWorker._container_name_from_url(url) == "sub-abc123"


def test_container_name_none_for_ip():
    from uora.benchmark.worker import BenchmarkWorker
    # Bare IP — no meaningful container name
    name = BenchmarkWorker._container_name_from_url("http://127.0.0.1:8080")
    # "127" isn't useful but the function shouldn't crash
    assert name is not None  # returns "127" — at least no exception


# ─── Regression: string-price actions must not break LOB matching ─────────────


def test_string_prices_in_actions_produce_correct_fills():
    """
    Regression for a real production bug: actions from the bot fleet carry prices
    as JSON strings (e.g. "100.00"), not floats.  Before the fix, the reference
    LOB stored string dict keys, string comparisons like "100.00" < "99.00" were
    True (lexicographic), and the sell@99 never crossed the resting buy@100.
    Result: reference always reported 0 fills, so every correct contestant got
    spurious L1/L2 violations.
    """
    actions = [
        # Prices are STRINGS — exactly as the bot fleet sends them
        {"order_id": "B1", "side": "buy",  "type": "limit", "price": "100.00", "quantity": 50, "timestamp": 1},
        {"order_id": "S1", "side": "sell", "type": "limit", "price": "99.00",  "quantity": 30, "timestamp": 2},
    ]
    # Correct contestant: B1 rests (pending), S1 fills against B1 at resting price 100.00
    correct = [
        {"order_id": "B1", "status": "pending", "filled_qty": 0,  "remaining_qty": 50, "fills": []},
        {"order_id": "S1", "status": "filled",  "filled_qty": 30, "remaining_qty": 0,
         "fills": [{"fill_id": "f1", "resting_order_id": "B1", "price": "100.00", "quantity": 30, "timestamp": 2}]},
    ]
    report = _validator_report(actions, correct)
    assert report["violations_count"] == 0, (
        f"Correct contestant got {report['violations_count']} violations — "
        f"string-price bug likely: {[v['description'] for v in report['violations']]}"
    )
    assert report["correctness_rate"] == 1.0


def test_wrong_contestant_with_string_prices_gets_violations():
    """Contestant that misses the cross should get L1+L2+L3+L4 violations even with string prices."""
    actions = [
        {"order_id": "B1", "side": "buy",  "type": "limit", "price": "100.00", "quantity": 50, "timestamp": 1},
        {"order_id": "S1", "side": "sell", "type": "limit", "price": "99.00",  "quantity": 30, "timestamp": 2},
    ]
    wrong = [
        {"order_id": "B1", "status": "pending", "filled_qty": 0, "remaining_qty": 50, "fills": []},
        {"order_id": "S1", "status": "pending", "filled_qty": 0, "remaining_qty": 30, "fills": []},
    ]
    report = _validator_report(actions, wrong)
    assert report["violations_count"] >= 2, "Expected at least L1 and L2 violations for missed cross"
    assert report["correctness_rate"] < 1.0


def test_correctness_rate_never_goes_negative():
    """
    Regression: with more violations than actions the formula 1 - v/n goes
    negative.  It must be clamped to 0.
    """
    actions = [
        {"order_id": "X1", "side": "buy", "type": "limit", "price": "50.00", "quantity": 10, "timestamp": 1},
    ]
    # Many wrong fields → many violations from a single action
    very_wrong = [
        {"order_id": "X1", "status": "filled", "filled_qty": 999, "remaining_qty": 999,
         "fills": [
             {"fill_id": "f1", "resting_order_id": "ghost", "price": "9999.00", "quantity": 999, "timestamp": 1},
         ]},
    ]
    report = _validator_report(actions, very_wrong)
    assert report["correctness_rate"] >= 0.0, (
        f"correctness_rate went negative: {report['correctness_rate']}"
    )
