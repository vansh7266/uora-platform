"""
UORA ML Anomaly Detector
==========================
Detects cheating, crashes, and suspicious behavior in contestant submissions
using an Isolation Forest on engineered features.

Features engineered:
  1. latency_entropy       — std dev of response times (crash = near-zero)
  2. pattern_correlation     — cross-correlation with known test sequences
  3. volume_conservation     — |submitted - filled - cancelled - remaining|
  4. state_transition_ged  — graph edit distance of order state machine
  5. latency_trend_slope     — linear regression slope (memory leak = rising)
  6. throughput_variance     — variance in TPS across time windows
  7. error_rate              — % of 4xx/5xx responses
  8. p99_to_p50_ratio      — tail latency inflation (jitter detection)

Author: Vansh (UORA Team)
"""

from __future__ import annotations

import math
import random
import time
from dataclasses import dataclass, field
from typing import Optional

import numpy as np
from sklearn.ensemble import IsolationForest


@dataclass
class BenchmarkFeatures:
    """Feature vector extracted from a single benchmark run."""
    submission_id: str
    latency_entropy: float = 0.0          # std dev of latencies (ns)
    pattern_correlation: float = 0.0        # 0.0-1.0, 1.0 = perfect match = hardcoded
    volume_conservation_delta: float = 0.0  # should be 0 for correct engines
    state_transition_ged: float = 0.0     # graph edit distance
    latency_trend_slope: float = 0.0        # positive = degrading performance
    throughput_variance: float = 0.0      # variance in orders/sec across windows
    error_rate: float = 0.0               # 0.0-1.0
    p99_to_p50_ratio: float = 1.0         # healthy ~2-3x, >10x = tail risk


@dataclass
class AnomalyResult:
    """Result of anomaly detection on a single submission."""
    submission_id: str
    anomaly_score: float          # -0.5 to 0.5 (sklearn raw), we normalize to 0-1
    is_anomaly: bool              # True if flagged
    reason: str                   # Human-readable explanation
    confidence: float             # 0.0-1.0


class MLAnomalyDetector:
    """
    Isolation Forest-based anomaly detector for UORA contestant submissions.

    Training data comes from "normal" runs of the reference engine.
    Any submission that deviates significantly is flagged for review.
    """

    CONTAMINATION: float = 0.01   # Expected % of anomalies in population
    N_ESTIMATORS: int = 100
    RANDOM_STATE: int = 42

    def __init__(self) -> None:
        self.model: Optional[IsolationForest] = None
        self.is_fitted: bool = False
        self.normal_profiles: list[BenchmarkFeatures] = []

    # ─── Training ───────────────────────────────────────────────────────────

    def add_normal_profile(self, features: BenchmarkFeatures) -> None:
        """Add a known-good benchmark run to the training set."""
        self.normal_profiles.append(features)

    def fit(self) -> None:
        """Train the Isolation Forest on all collected normal profiles."""
        if len(self.normal_profiles) < 10:
            # Not enough data — use synthetic normal data for initial baseline
            self._generate_synthetic_normal_data()

        X = np.array([[f.latency_entropy,
                       f.pattern_correlation,
                       f.volume_conservation_delta,
                       f.state_transition_ged,
                       f.latency_trend_slope,
                       f.throughput_variance,
                       f.error_rate,
                       f.p99_to_p50_ratio]
                      for f in self.normal_profiles])

        self.model = IsolationForest(
            n_estimators=self.N_ESTIMATORS,
            contamination=self.CONTAMINATION,
            random_state=self.RANDOM_STATE,
            n_jobs=-1
        )
        self.model.fit(X)
        self.is_fitted = True
        print(f"✓ ML Detector trained on {len(self.normal_profiles)} normal profiles")

    def _generate_synthetic_normal_data(self, n: int = 100) -> None:
        """Generate realistic normal profiles for demo/training purposes."""
        rng = np.random.default_rng(self.RANDOM_STATE)
        for i in range(n):
            self.normal_profiles.append(BenchmarkFeatures(
                submission_id=f"synthetic-normal-{i}",
                latency_entropy=rng.uniform(1_000_000, 20_000_000),  # 1-20ms std dev
                pattern_correlation=rng.uniform(0.0, 0.4),           # low correlation
                volume_conservation_delta=rng.uniform(0, 10),        # near-zero
                state_transition_ged=rng.uniform(0, 0.15),           # deterministic
                latency_trend_slope=rng.uniform(-0.002, 0.002),      # flat trend
                throughput_variance=rng.uniform(1000, 20000),        # moderate variance
                error_rate=rng.uniform(0.0, 0.03),                   # <3% errors
                p99_to_p50_ratio=rng.uniform(2.0, 5.0)               # healthy tail
            ))

    # ─── Detection ──────────────────────────────────────────────────────────

    def detect(self, features: BenchmarkFeatures) -> AnomalyResult:
        """Run anomaly detection on a single submission's feature vector."""
        if not self.is_fitted:
            self.fit()

        X = np.array([[features.latency_entropy,
                       features.pattern_correlation,
                       features.volume_conservation_delta,
                       features.state_transition_ged,
                       features.latency_trend_slope,
                       features.throughput_variance,
                       features.error_rate,
                       features.p99_to_p50_ratio]])

        # sklearn returns: 1 = normal, -1 = anomaly
        raw_pred = self.model.predict(X)[0]
        raw_score = self.model.score_samples(X)[0]  # negative = more anomalous

        # Normalize score to 0-1 (1 = definitely anomaly)
        anomaly_score = 1.0 - (raw_score + 0.5)  # heuristic normalization
        anomaly_score = max(0.0, min(1.0, anomaly_score))

        is_anomaly = raw_pred == -1 and anomaly_score > 0.8
        reason = self._explain_anomaly(features, anomaly_score)
        confidence = anomaly_score if is_anomaly else 1.0 - anomaly_score

        return AnomalyResult(
            submission_id=features.submission_id,
            anomaly_score=round(anomaly_score, 4),
            is_anomaly=is_anomaly,
            reason=reason,
            confidence=round(confidence, 4)
        )

    def _explain_anomaly(self, f: BenchmarkFeatures, score: float) -> str:
        """Generate human-readable explanation based on which features triggered."""
        reasons = []

        if f.pattern_correlation > 0.95:
            reasons.append("Perfect correlation with test patterns (hardcoded responses)")
        if f.latency_entropy < 1e6 and f.latency_entropy > 0:  # < 1ms std dev
            reasons.append("Latency entropy collapse (engine crash/restart detected)")
        if abs(f.latency_trend_slope) > 0.01:
            reasons.append(f"Latency degradation trend (slope={f.latency_trend_slope:.4f})")
        if f.error_rate > 0.1:
            reasons.append(f"High error rate ({f.error_rate*100:.1f}%)")
        if f.p99_to_p50_ratio > 10.0:
            reasons.append(f"Extreme tail latency inflation (p99/p50={f.p99_to_p50_ratio:.1f}x)")
        if f.volume_conservation_delta > 100:
            reasons.append(f"Volume conservation violation (delta={f.volume_conservation_delta})")
        if f.state_transition_ged > 0.5:
            reasons.append("Non-deterministic state transitions")
        if f.throughput_variance > 1e10:
            reasons.append("Extreme throughput variance (unstable engine)")

        if not reasons:
            if score > 0.5:
                reasons.append("General behavioral deviation from normal profile")
            else:
                return "No anomaly detected — behavior within normal parameters"

        return " | ".join(reasons)

    # ─── Feature Extraction Helpers ────────────────────────────────────────

    @staticmethod
    def extract_features(submission_id: str,
                           latencies: list[int],
                           expected_actions: list[dict],
                           actual_actions: list[dict],
                           errors: int,
                           total: int) -> BenchmarkFeatures:
        """
        Extract feature vector from raw benchmark data.

        Args:
            submission_id: UUID of the submission
            latencies: List of latency measurements in nanoseconds
            expected_actions: Ground truth from reference LOB
            actual_actions: Contestant engine output
            errors: Number of HTTP 4xx/5xx responses
            total: Total number of requests
        """
        if not latencies:
            latencies = [1_000_000]  # 1ms default

        arr = np.array(latencies, dtype=np.float64)
        p50 = np.percentile(arr, 50)
        p99 = np.percentile(arr, 99)

        # 1. Latency entropy
        latency_entropy = float(np.std(arr))

        # 2. Pattern correlation (simplified: compare response counts per action type)
        expected_counts = {}
        actual_counts = {}
        for a in expected_actions:
            t = a.get("type", "unknown")
            expected_counts[t] = expected_counts.get(t, 0) + 1
        for a in actual_actions:
            t = a.get("type", "unknown")
            actual_counts[t] = actual_counts.get(t, 0) + 1

        all_types = set(expected_counts.keys()) | set(actual_counts.keys())
        exp_vec = [expected_counts.get(t, 0) for t in all_types]
        act_vec = [actual_counts.get(t, 0) for t in all_types]

        if np.linalg.norm(exp_vec) == 0 or np.linalg.norm(act_vec) == 0:
            pattern_correlation = 0.0
        else:
            pattern_correlation = float(np.dot(exp_vec, act_vec) /
                                       (np.linalg.norm(exp_vec) * np.linalg.norm(act_vec)))

        # 3. Volume conservation (simplified)
        volume_conservation_delta = abs(len(expected_actions) - len(actual_actions))

        # 4. State transition GED — real Graph Edit Distance via NetworkX
        from uora.validator.diff_engine import _build_state_graph, _ged_normalized
        ref_graph = _build_state_graph(expected_actions)
        con_graph = _build_state_graph(actual_actions)
        state_transition_ged = _ged_normalized(ref_graph, con_graph)

        # 5. Latency trend slope (linear regression on time series)
        if len(latencies) >= 2:
            x = np.arange(len(latencies))
            slope, _ = np.polyfit(x, arr, 1)
            latency_trend_slope = float(slope)
        else:
            latency_trend_slope = 0.0

        # 6. Throughput variance — time-bucketed event counts per second
        #    Use cumulative latency as pseudo-wall-clock; bucket into 1-second windows.
        if len(latencies) >= 2:
            cumulative_s = np.cumsum(arr) / 1e9          # nanoseconds → seconds
            total_time = cumulative_s[-1]
            if total_time > 0:
                n_buckets = max(1, int(np.ceil(total_time)))
                bucket_counts = np.zeros(n_buckets, dtype=np.int64)
                bucket_indices = np.minimum(
                    np.floor(cumulative_s).astype(np.int64),
                    n_buckets - 1,
                )
                for bi in bucket_indices:
                    bucket_counts[bi] += 1
                throughput_variance = float(np.var(bucket_counts))
            else:
                throughput_variance = 0.0
        else:
            throughput_variance = 0.0

        # 7. Error rate
        error_rate = errors / total if total > 0 else 0.0

        # 8. P99/P50 ratio
        p99_to_p50_ratio = (p99 / p50) if p50 > 0 else 1.0

        return BenchmarkFeatures(
            submission_id=submission_id,
            latency_entropy=latency_entropy,
            pattern_correlation=pattern_correlation,
            volume_conservation_delta=volume_conservation_delta,
            state_transition_ged=state_transition_ged,
            latency_trend_slope=latency_trend_slope,
            throughput_variance=throughput_variance,
            error_rate=error_rate,
            p99_to_p50_ratio=p99_to_p50_ratio
        )


# ─── Test Suite ───────────────────────────────────────────────────────────

def test_normal_engine() -> None:
    """Test 1: Normal reference engine behavior — should NOT flag."""
    detector = MLAnomalyDetector()
    detector.fit()

    features = BenchmarkFeatures(
        submission_id="test-normal",
        latency_entropy=8_000_000,      # 8ms std dev — within training range
        pattern_correlation=0.20,       # Low correlation
        volume_conservation_delta=3,    # Near-perfect
        state_transition_ged=0.08,      # Deterministic
        latency_trend_slope=0.0005,     # Flat
        throughput_variance=8000,       # Moderate
        error_rate=0.01,                # 1% errors
        p99_to_p50_ratio=3.5            # Healthy tail
    )

    result = detector.detect(features)
    assert not result.is_anomaly, f"Normal engine flagged incorrectly: {result.reason}"
    print(f"✓ Test 1: Normal engine — Anomaly score: {result.anomaly_score:.2f} (clean)")


def test_hardcoded_responses() -> None:
    """Test 2: Contestant hardcodes responses to known test patterns."""
    detector = MLAnomalyDetector()
    detector.fit()

    features = BenchmarkFeatures(
        submission_id="test-hardcode",
        latency_entropy=500_000,         # Very low variance
        pattern_correlation=0.99,        # Perfect correlation
        volume_conservation_delta=0,
        state_transition_ged=0.0,
        latency_trend_slope=0.0,
        throughput_variance=100,         # Suspiciously uniform
        error_rate=0.0,
        p99_to_p50_ratio=1.05           # Almost no tail = fake
    )

    result = detector.detect(features)
    assert result.is_anomaly, "Hardcoded engine NOT flagged!"
    assert "hardcoded" in result.reason.lower() or "correlation" in result.reason.lower()
    print(f"✓ Test 2: Hardcoded responses — FLAGGED: {result.reason}")


def test_crash_pattern() -> None:
    """Test 3: Engine crashes mid-benchmark, then restarts with near-zero latency."""
    detector = MLAnomalyDetector()
    detector.fit()

    features = BenchmarkFeatures(
        submission_id="test-crash",
        latency_entropy=50_000,          # Entropy collapse
        pattern_correlation=0.4,
        volume_conservation_delta=500,   # Missing orders
        state_transition_ged=0.8,        # Inconsistent states
        latency_trend_slope=-0.05,       # Sudden improvement = restart
        throughput_variance=1_000_000,   # Erratic
        error_rate=0.25,                 # 25% errors
        p99_to_p50_ratio=1.01            # Flatline after crash
    )

    result = detector.detect(features)
    assert result.is_anomaly, "Crash pattern NOT flagged!"
    assert "entropy" in result.reason.lower() or "crash" in result.reason.lower() or "error rate" in result.reason.lower()
    print(f"✓ Test 3: Crash pattern — FLAGGED: {result.reason}")


def test_constant_latency_bot() -> None:
    """Test 4: Suspiciously constant latency regardless of load (throttled/broken clock)."""
    detector = MLAnomalyDetector()
    detector.fit()

    features = BenchmarkFeatures(
        submission_id="test-constant",
        latency_entropy=10_000,         # Almost no variance
        pattern_correlation=0.5,
        volume_conservation_delta=0,
        state_transition_ged=0.1,
        latency_trend_slope=0.0,
        throughput_variance=50,          # Suspiciously uniform
        error_rate=0.0,
        p99_to_p50_ratio=1.0             # Perfectly flat
    )

    result = detector.detect(features)
    assert result.is_anomaly, "Constant latency bot NOT flagged!"
    print(f"✓ Test 4: Constant latency bot — FLAGGED: {result.reason}")


if __name__ == "__main__":
    print("Running UORA ML Anomaly Detector Tests...\n")
    test_normal_engine()
    test_hardcoded_responses()
    test_crash_pattern()
    test_constant_latency_bot()
    print("\n✅ All ML detector tests passed.")