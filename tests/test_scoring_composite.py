"""
Unit tests for the composite score and the wired-in anomaly features.

These pin down the Phase-2 hardening: the score formula is a pure, testable function;
resource_penalty genuinely affects the score (it used to be a hardcoded constant); and
extract_features computes real pattern_correlation / state_transition_ged values with the
correct distance semantics (the GED field was previously stored as similarity, inverted).
"""

import math

from uora.scoring.engine import compute_composite_score
from uora.ml_detector.detector import MLAnomalyDetector
from uora.benchmark.worker import BenchmarkWorker


# ── The composite score formula (pure function) ──────────────────────────────

def test_composite_matches_reference_numbers():
    # The exact value taught in docs/quant/module-09-scoring.md
    assert round(compute_composite_score(1000, 1.0, 0.99, 500_000), 2) == 660.0


def test_correctness_is_a_multiplicative_gate():
    full = compute_composite_score(1000, 1.0, 0.99, 500_000)
    half = compute_composite_score(1000, 0.5, 0.99, 500_000)
    assert math.isclose(half, full / 2, rel_tol=1e-9)


def test_success_rate_is_in_the_formula():
    # The docstring used to omit success_rate; the code multiplies by it. Prove it matters.
    a = compute_composite_score(1000, 1.0, 1.00, 500_000)
    b = compute_composite_score(1000, 1.0, 0.50, 500_000)
    assert math.isclose(b, a * 0.5, rel_tol=1e-9)


def test_lower_tail_latency_scores_higher():
    fast = compute_composite_score(1000, 1.0, 0.99, 100_000)    # p99 = 0.1 ms
    slow = compute_composite_score(1000, 1.0, 0.99, 5_000_000)  # p99 = 5 ms
    assert fast > slow
    assert round(slow, 2) == 165.0
    assert round(fast, 2) == 900.0


def test_resource_penalty_is_live_and_squared():
    base = compute_composite_score(1000, 1.0, 0.99, 500_000, 1.0)
    hog = compute_composite_score(1000, 1.0, 0.99, 500_000, 2.0)
    assert hog < base                                   # NOT a dead constant anymore
    assert math.isclose(base, 990 / 1.5, rel_tol=1e-9)  # denom 0.5 + 1^2
    assert math.isclose(hog, 990 / 4.5, rel_tol=1e-9)   # denom 0.5 + 2^2  (squared)


def test_denominator_floored_at_one():
    # Zero p99 and zero resource penalty -> raw denom 0; must be floored to 1.0.
    assert compute_composite_score(1000, 1.0, 1.0, 0, 0.0) == 1000.0


def test_monotonic_in_throughput():
    lo = compute_composite_score(500, 1.0, 0.99, 500_000)
    hi = compute_composite_score(2000, 1.0, 0.99, 500_000)
    assert hi > lo


# ── Real anomaly features (the wired path) ───────────────────────────────────

def test_ged_feature_is_a_distance_zero_when_identical():
    stream = [
        {"order_id": "A", "type": "limit", "status": "pending"},
        {"order_id": "A", "type": "limit", "status": "filled"},
    ]
    f = MLAnomalyDetector.extract_features("s", [1_000_000, 2_000_000], stream, stream, 0, 2)
    # identical reference vs contestant -> deterministic -> distance 0.0 (NOT 1.0)
    assert f.state_transition_ged == 0.0


def test_ged_feature_grows_when_streams_diverge():
    expected = [
        {"order_id": "A", "type": "limit", "status": "pending"},
        {"order_id": "A", "type": "limit", "status": "filled"},
    ]
    actual = [
        {"order_id": "A", "type": "limit", "status": "pending"},
        {"order_id": "A", "type": "cancel", "status": "cancelled"},
    ]
    f = MLAnomalyDetector.extract_features("s", [1_000_000, 2_000_000], expected, actual, 0, 2)
    assert f.state_transition_ged > 0.0   # diverged -> nonzero distance
    assert 0.0 <= f.pattern_correlation <= 1.0


def test_worker_build_features_returns_real_vector():
    results = {
        "results": [
            {"action": {"type": "limit"}, "result": {"order_id": "A", "type": "limit", "status": "filled"},  "latency_ns": 1_000_000},
            {"action": {"type": "limit"}, "result": {"order_id": "B", "type": "limit", "status": "pending"}, "latency_ns": 3_000_000},
        ],
        "total_orders": 2,
        "failed_orders": 0,
    }
    attempted = [r["action"] for r in results["results"]]
    responses = [r["result"] for r in results["results"]]
    f = BenchmarkWorker._build_features("s1", results, attempted, responses)
    assert f is not None
    assert f.latency_entropy > 0.0     # std of [1ms, 3ms] is nonzero
    assert f.error_rate == 0.0
