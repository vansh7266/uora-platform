# Appendix A — Math Reference

> Every formula UORA uses, in one place. Each entry: the formula, a plain-English meaning,
> and where it lives in the code. Use this as a lookup card; the *teaching* is in the modules.

Notation: `n` = sample count, `xᵢ` = the i-th value, `Σ` = sum, `⌈·⌉` = round up (ceiling).

---

## 1. Descriptive statistics

| Quantity | Formula | Plain meaning | In UORA |
|----------|---------|---------------|---------|
| Mean (average) | `μ = (Σ xᵢ) / n` | center of the data | throughput/latency summaries |
| Variance | `σ² = (Σ (xᵢ − μ)²) / n` | average squared spread | `throughput_variance` |
| Std deviation | `σ = √σ²` | spread in original units | `latency_entropy = np.std(latencies)` |

> ⚠️ UORA calls std "entropy" — a loose name; it's standard deviation, not information entropy.
> (Module 06 §1, Module 08 §8.)

---

## 2. Percentiles (nearest-rank method)

```
rank  = ⌈ n · p ⌉            # p = 0.50, 0.90, 0.99 …
value = sorted_values[rank − 1]   # 1-indexed → 0-indexed
```

- p50 = median (typical), p90, p99 = the tail (what hurts in HFT).
- **In UORA:** `_nearest_rank_percentile()` in both `scoring/engine.py` and
  `bot_fleet/coordinator.py` (kept identical on purpose). (Module 05.)

Example: for `[1..10]`, p50 = 5, p90 = 9, p99 = 10.

---

## 3. Throughput & reliability

| Quantity | Formula | In UORA |
|----------|---------|---------|
| Throughput (TPS) | `total_orders / duration_seconds` | `compute_latency_summary` |
| Success rate | `successes / total` | numerator of composite score |
| Error rate | `failures / total` | anomaly feature `error_rate` |
| Tail ratio | `p99 / p50` | anomaly feature `p99_to_p50_ratio` (healthy ≈ 2–5; >10 = bad) |

**Little's Law** (throughput ↔ latency): `L = λ · W` — in-flight requests = arrival rate ×
time-in-system. (Module 05 §6.)

---

## 4. Linear regression (trend slope)

Least-squares slope of the best-fit line `y = m·x + c`:

```
        Σ (xᵢ − x̄)(yᵢ − ȳ)
m  =  ───────────────────────
           Σ (xᵢ − x̄)²
```

- `m > 0` rising (degradation/leak), `m ≈ 0` stable, `m < 0` falling (restart).
- **In UORA:** `np.polyfit(x, latencies, 1)[0]` → `latency_trend_slope`; flagged if
  `|m| > 0.01`. (Module 06 §3.)

---

## 5. Cosine similarity (vector shape)

```
              a · b              Σ aᵢ bᵢ
cos(θ) =  ───────────── = ──────────────────────
            ‖a‖ · ‖b‖      √(Σ aᵢ²) · √(Σ bᵢ²)
```

- 1.0 = same direction (ignores magnitude); 0.0 = unrelated (orthogonal).
- **In UORA:** `pattern_correlation` over action-type count vectors in
  `detector.extract_features`. (Weak alone — Module 06 §4, Module 08 §8.)

---

## 6. Sequence / graph similarity (determinism)

UORA approximates the NP-hard **Graph Edit Distance** with `difflib.SequenceMatcher.ratio()`
over sorted edge sequences:

```
ratio = 2 · M / T          # M = matched elements, T = total elements in both sequences
```

- 1.0 = structurally identical; < 1.0 = diverged.
- **In UORA:** `_ged_normalized()` in `validator/diff_engine.py` → L4 determinism check and
  the `state_transition_ged` anomaly feature. (Module 06 §5, Module 07 L4.)
- ⚠️ Not true GED; degenerates to 1.0 if responses lack `order_id` edges.

---

## 7. Correctness rate

```
correctness_rate = 1 − (total_violations / number_of_actions)
```

Violations counted across L1 (fills), L2 (state), L3 (invariants), L4 (determinism). Feeds the
composite score as a **multiplier**. (Module 07 §4.)

---

## 8. Composite score (the leaderboard number)

As implemented in `scoring/engine.py`:

```
                 throughput × correctness_rate × success_rate
composite =  ────────────────────────────────────────────────────
                  p99_latency_ms  +  resource_penalty²        ⌊ floored at 1.0 ⌋
```

- correctness/success = **multipliers** (gates); p99 = additive penalty; resource = **squared**
  penalty; `max(denom, 1.0)` prevents blow-ups.
- ⚠️ Today `resource_penalty = 1.0` (constant) and the docstring omits `success_rate` — see
  Module 09 §5. (Phase-2 fixes.)

Verified sensitivities (tput 1000, corr 1.0, succ 0.99, p99 0.5 ms, resource 1.0 → **660**):
half correctness → 330; p99 5 ms → 165; p99 0.1 ms → 900; resource 2.0 → 220.

---

## 9. Anomaly score (Isolation Forest)

Raw isolation score for point `x` (path-length based):

```
s(x) = 2^( − E[h(x)] / c(n) )      # → 1 anomaly, → 0.5 normal
```

UORA squashes sklearn's `decision_function` into [0, 1] and floors rule-hits:

```
anomaly_score = 1 / (1 + e^( 20 · decision_score ))
if any_hard_rule_triggered:  anomaly_score = max(anomaly_score, 0.85)
```

- **In UORA:** `MLAnomalyDetector.detect()`. `contamination = 0.05`, `RANDOM_STATE = 42`.
  (Module 08 §7.)

---

## 10. The tail at scale (why p99 matters)

For `N` independent components each "slow" with probability `p`:

```
P(request is slow) = 1 − (1 − p)^N
```

p = 1% (p99): N=10 → 9.6%, N=100 → 63%. The component tail becomes the system's common case.
(Dean & Barroso; Module 05 §7.)

---

## 11. Units quick-reference

| Thing | Unit in UORA | Conversion |
|-------|--------------|------------|
| Latency (internal) | nanoseconds (`int`) | 1 ms = 1e6 ns; 1 s = 1e9 ns |
| Latency (display) | milliseconds | `ns / 1e6` |
| Price (LOBSTER) | integer cents | `cents / 100` = dollars |
| Direction (LOBSTER) | ±1 | 1 = buy, −1 = sell |
| Composite score | unitless index | only comparable within the same benchmark |

---

← Back to the [Handbook index](README.md) · Deeper study: [Appendix B — Resources](appendix-b-resources.md)
