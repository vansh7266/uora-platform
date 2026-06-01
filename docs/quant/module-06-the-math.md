# Module 06 — The Math of Quant

> **Prerequisite:** [Module 05](module-05-latency.md). Comfort with percentiles helps.
> **Goal:** Learn *every* piece of math UORA uses — mean/variance, regression, cosine
> similarity, and sequence/graph distance — from intuition to formula to the exact line of
> code that uses it. No prior stats required.
> **Time:** ~55 minutes. Take it in pieces; this is the toolbox you'll reuse forever.

---

## 0. Don't be scared of the math

Every formula here is something you already understand intuitively; we're just giving it a
name and a symbol. And crucially — **each one maps to a real line in the UORA codebase**, so
you're never learning math in a vacuum. Run every snippet.

The five tools:

| Tool | One-line meaning | Used in UORA for… |
|------|------------------|-------------------|
| Mean / variance / std | center and spread of numbers | latency "entropy", throughput stability |
| Percentile | the value X% of data falls under | p50/p90/p99 latency (Module 05) |
| Linear regression | the slope of a trend line | detecting latency *drift* (memory leaks) |
| Cosine similarity | how similar two vectors' *shapes* are | response-pattern matching |
| Sequence / graph distance | how similar two structures are | determinism (L4) & state-machine match |

---

## 1. Mean, variance, standard deviation — center and spread

- **Mean** (average): add them up, divide by count. The center of mass.
  `mean = (Σ xᵢ) / n`
- **Variance**: the *average squared distance from the mean*. Big variance = spread out.
  `var = (Σ (xᵢ − mean)²) / n`
- **Standard deviation (std)**: the square root of variance — back in the original units.
  `std = √var`

Why squared? Squaring makes all distances positive and punishes big deviations harder.
Taking the square root at the end returns to human-readable units (ns, not ns²).

```python
import numpy as np
print(np.mean([1,2,3,4,5]))   # 3.0
print(np.var([1,2,3,4,5]))    # 2.0
print(np.std([1,2,3,4,5]))    # 1.4142  (= √2)
```

> 📎 **In the codebase:** the anomaly detector uses `np.std(latencies)` as the feature it
> calls **`latency_entropy`** (`ml_detector/detector.py`). The intuition: a *healthy* engine
> has natural jitter, so a *moderate* spread of latencies. A spread that **collapses to near
> zero** is suspicious — it can mean the engine crashed and is returning instant canned
> errors, or hardcoded responses (Module 08). It also uses `np.var(...)` for
> **`throughput_variance`** — wildly varying throughput signals an unstable engine.

> ⚠️ **Caveat:** calling std "entropy" is a loose naming choice — true information entropy is
> a different formula. It's a reasonable *proxy* for "how much variation is there," but know
> the difference. (We'll flag this again in Module 08.)

---

## 2. Percentiles (recap)

Covered in depth in [Module 05](module-05-latency.md). The one-liner: the p-th percentile is
the value at sorted rank `⌈n·p⌉`. The mean tells you the center; percentiles tell you the
**tail**. In quant, the tail is usually what matters. See `_nearest_rank_percentile`.

---

## 3. Linear regression — measuring a trend

Imagine plotting latency over time. Is it **drifting upward** (a memory leak slowly degrading
the engine) or staying flat (healthy)? **Linear regression** fits the straight line
`y = m·x + c` that best matches your points, and the **slope `m`** is the trend:

- `m > 0` → values rising over time (degrading).
- `m ≈ 0` → flat (stable).
- `m < 0` → falling (e.g. a restart that suddenly "improved" — also suspicious).

"Best fit" means the line minimizing the sum of squared vertical distances to the points
(*least squares*). You don't compute it by hand — `numpy` does:

```python
import numpy as np
y = [1.0, 1.1, 1.2, 1.3, 1.4]          # latency creeping up each interval
slope, intercept = np.polyfit(np.arange(len(y)), np.array(y), 1)
print(round(slope, 4))                  # 0.1   -> rising 0.1 per step

flat = [2.0, 2.0, 2.0, 2.0]
print(round(np.polyfit(np.arange(4), np.array(flat), 1)[0], 4))   # 0.0
```

> 📎 **In the codebase:** this is the **`latency_trend_slope`** feature in
> `detector.extract_features()`: `slope, _ = np.polyfit(x, arr, 1)`. The detector flags
> `abs(slope) > 0.01` — *either* direction is suspicious. Rising = leak/degradation; a sharp
> negative = a crash-and-restart. A flat trend is the healthy signature.

---

## 4. Cosine similarity — comparing the *shape* of two vectors

How do you measure whether two lists of numbers "point the same way," ignoring their size?
**Cosine similarity** measures the angle between two vectors:

```
              a · b            (a₁b₁ + a₂b₂ + … + aₙbₙ)
cos(θ) = ───────────── = ────────────────────────────────────
            ‖a‖ · ‖b‖        √(Σaᵢ²) · √(Σbᵢ²)
```

- **1.0** → same direction (identical *shape*, even if different magnitude).
- **0.0** → perpendicular (completely unrelated).
- It ignores scale: `[1,1]` and `[10,10]` are identical in direction → 1.0.

```python
import numpy as np
def cosine(a, b):
    a, b = np.array(a, float), np.array(b, float)
    if np.linalg.norm(a) == 0 or np.linalg.norm(b) == 0:
        return 0.0
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))

print(round(cosine([3,1,2], [3,1,2]), 4))   # 1.0  identical shape
print(round(cosine([1,1],   [10,10]), 4))   # 1.0  same direction, ignores size
print(round(cosine([1,0],   [0,1]),   4))   # 0.0  orthogonal / unrelated
```

> 📎 **In the codebase:** `detector.extract_features()` builds a *count vector of action
> types* for the expected stream and the contestant's stream, then takes their cosine
> similarity as **`pattern_correlation`**. The intended signal: an engine whose response
> pattern is *suspiciously* perfectly aligned with the test patterns may be returning
> hardcoded answers.
>
> ⚠️ **Honest caveat (we revisit in Module 08):** as currently computed over *coarse* action
> counts, a perfectly *correct* engine also scores near 1.0 — so by itself this is a weak
> cheating signal. It earns its keep only in combination with the other features (e.g. near-
> zero latency entropy). Recognizing that a feature is weak *is* senior-level analysis.

---

## 5. Sequence & graph distance — comparing two structures

Sometimes you must compare not numbers but **structures** — e.g. "did the contestant's engine
move orders through the same state transitions as the reference?" That's comparing two
**graphs** (or two sequences of edges).

The gold-standard metric is **Graph Edit Distance (GED)**: the minimum number of
insert/delete/relabel edits to turn one graph into the other. But exact GED is **NP-hard** —
it can take effectively forever on big graphs. So UORA makes a deliberate engineering
trade-off: it serializes each graph's edges into a sorted sequence and compares them with
Python's `difflib.SequenceMatcher`, which gives a **similarity ratio in [0, 1]** in
*polynomial* time.

```python
from uora.validator.diff_engine import _build_state_graph, _ged_normalized

ref  = [{"order_id":"A","status":"pending","type":"limit"},
        {"order_id":"A","status":"filled", "type":"limit"}]
same = list(ref)
diff = [{"order_id":"A","status":"pending",  "type":"limit"},
        {"order_id":"A","status":"cancelled","type":"limit"}]   # A ends cancelled, not filled

print(_ged_normalized(_build_state_graph(ref), _build_state_graph(same)))   # 1.0  identical
print(_ged_normalized(_build_state_graph(ref), _build_state_graph(diff)))   # 0.0  diverged
```

- **1.0** → the two state machines are structurally identical (deterministic match).
- **< 1.0** → they diverge — used directly in UORA's **L4 determinism** check (Module 07) and
  as the **`state_transition_ged`** anomaly feature (Module 08).

> ⚠️ **Caveat (important, and a real codebase note):** `SequenceMatcher.ratio()` is **not**
> true GED — it's a fast approximation. The code comment says as much
> ("Replaces exact GED with SequenceMatcher … instead of NP-Hard timeouts"). It's a sound
> trade-off, but call it what it is: a *similarity ratio*, not a graph edit distance. Also
> note this metric depends on edges existing between same-`order_id` responses — if responses
> lack stable `order_id`s, the graphs have no edges and the ratio degenerates to 1.0. We'll
> see that limitation bite in Module 07.

---

## 6. How it all comes together

These five tools aren't academic — they *are* UORA's intelligence layer:

```
raw benchmark data
   │
   ├─ np.std(latencies) ............ latency_entropy ─────┐
   ├─ np.var(throughput) .......... throughput_variance ─┤
   ├─ np.polyfit(...).slope ....... latency_trend_slope ─┤
   ├─ cosine(expected, actual) .... pattern_correlation ─┼─▶ 8-feature vector ─▶ Isolation
   ├─ _ged_normalized(...) ........ state_transition_ged ┤      (Module 08)        Forest
   ├─ errors / total .............. error_rate ──────────┤
   └─ p99 / p50 ................... p99_to_p50_ratio ─────┘
                                                              and ─▶ composite score
                                                                     (Module 09)
```

Every number a judge sees on the leaderboard traces back to one of these formulas. That's the
payoff of this module: the math *is* the product.

---

## 7. Real-world caveats, gathered

- **Std ≠ entropy.** UORA's "entropy" feature is really a standard deviation. Fine as a proxy;
  wrong as a name.
- **Cosine ignores magnitude.** Two vectors can be "identical" in direction while wildly
  different in size. Sometimes that's what you want; sometimes it hides a real difference.
- **Regression assumes linearity.** A `polyfit(...,1)` slope describes a *straight-line*
  trend. Latency that spikes then recovers can show slope ≈ 0 while being deeply unhealthy —
  which is why UORA uses *several* features, not one.
- **SequenceMatcher ≠ GED.** A fast, polynomial approximation, not the NP-hard exact metric.
- **Small samples lie.** Variance, slope, and percentiles are noisy on tiny datasets. Trust
  them more as `n` grows.

---

## 8. Exercises

1. **Spread.** By hand, compute the mean and variance of `[10, 12, 14]`. Verify with numpy.
2. **Trend.** Make a latency series that *spikes then recovers* (e.g. `[1,1,9,1,1]`). What
   slope does `np.polyfit` give? Does the slope reveal the spike? (This motivates §7.)
3. **Shape vs size.** Find two different-magnitude vectors with cosine similarity exactly 1.0,
   and two with similarity 0.0. Explain why.
4. **Determinism.** Build two response lists for the *same* order that end in different
   statuses and confirm `_ged_normalized` drops below 1.0. Then make them identical and
   confirm 1.0.
5. **Stretch.** Why is exact GED NP-hard, and why is SequenceMatcher an acceptable stand-in
   *here* but not for, say, comparing molecular graphs? (Hint: our graphs are nearly linear
   chains per order.)

---

## 9. 📚 Resources

- **Khan Academy — Statistics & Probability** (free). Mean, variance, std, the basics, done
  well. Start here if any of §1 felt shaky.
- **3Blue1Brown — "Essence of Linear Algebra"** (YouTube). Dot products and vectors made
  *visual* — exactly the intuition behind cosine similarity.
- **StatQuest with Josh Starmer** (YouTube) — linear regression and stats explained
  joyfully, from zero.
- **Jake VanderPlas — *Python Data Science Handbook*** (free online) — NumPy and the
  practical math, with code.
- **"Graph edit distance"** (Wikipedia) — for §5; skim to appreciate why it's NP-hard.

---

## What's next

You now own the math. Time to use it for UORA's core job: deciding whether a contestant's
engine is **correct** and **deterministic**. Module 07 walks the full L1–L4 validation ladder
in `diff_engine.py`.

**→ [Module 07 — Correctness & Determinism](module-07-correctness.md)**
