# Module 08 — Anomaly Detection & ML

> **Prerequisite:** [Module 06](module-06-the-math.md) (the features' math),
> [Module 07](module-07-correctness.md) (correctness).
> **Goal:** Understand how UORA uses an **Isolation Forest** plus hard rules to catch
> *cheating* and *unstable* engines — failures that aren't simple wrong answers.
> **Time:** ~50 minutes + running the examples.

---

## 1. Why correctness checks aren't enough

Module 07 catches engines that give **wrong answers**. But some bad engines give *right*
answers in suspicious ways:

- A contestant **hardcodes** responses to the known test patterns — correct outputs, but the
  engine isn't really matching anything.
- An engine **crashes and restarts** mid-run — its latency suddenly collapses to near-zero
  (it's returning instant errors).
- An engine **degrades** as it runs — a memory leak slowly inflating latency.
- An engine is **erratic** — wild swings in throughput that suggest instability.

None of these is a single "wrong fill." They're *patterns*. And you can't write a rule for
every possible cheat — clever contestants invent new ones. So UORA adds a layer that learns
what "normal" looks like and flags anything that **deviates**: an **anomaly detector**.

---

## 2. The problem: anomaly detection without labels

We have lots of examples of *normal* engine behavior, but we **don't** have labeled examples
of every kind of cheat (we don't even know them all yet). This rules out ordinary
classification. The right framing is **unsupervised anomaly detection**:

> Learn the shape of "normal." Flag anything that falls outside it.

UORA's tool of choice is the **Isolation Forest** — an algorithm built specifically for this.

---

## 3. Isolation Forest, intuitively

Most anomaly methods ask "how *dense* is the normal cluster, and how far is this point from
it?" Isolation Forest flips the question with a beautiful insight:

> **Anomalies are easy to isolate.** If you keep splitting the data with random cuts,
> a weird, far-out point gets cut off from the crowd in just a *few* splits. A normal point,
> buried in the dense middle, takes *many* splits to isolate.

So the algorithm builds many random trees (a "forest"), each repeatedly splitting on a random
feature at a random threshold. For each point it measures the **average path length** —
how many splits, on average, to isolate it:

- **Short path** → isolated quickly → **anomaly**.
- **Long path** → buried in the normal crowd → **normal**.

That's it. No distance metric, no density estimation — just "how quickly can I fence this
point off." It's fast, scales well, and handles many features. (Paper: Liu, Ting & Zhou, 2008.)

---

## 4. The 8 features — UORA's "fingerprint" of a run

The detector turns each benchmark run into an **8-number feature vector**. Each feature uses
math from [Module 06](module-06-the-math.md) and targets a specific failure:

| # | Feature | Math (Module 06) | A red value means… |
|---|---------|------------------|--------------------|
| 1 | `latency_entropy` | std of latencies | **collapse → 0**: crash returning instant errors |
| 2 | `pattern_correlation` | cosine similarity | **→ 1.0**: suspiciously perfect → possible hardcoding |
| 3 | `volume_conservation_delta` | abs difference | **large**: orders vanishing (lost/duplicated) |
| 4 | `state_transition_ged` | sequence distance | **large**: non-deterministic state machine |
| 5 | `latency_trend_slope` | regression slope | **≠ 0**: rising = leak; sharp drop = restart |
| 6 | `throughput_variance` | variance | **huge**: erratic, unstable engine |
| 7 | `error_rate` | errors / total | **high**: engine failing requests |
| 8 | `p99_to_p50_ratio` | percentile ratio | **>10**: extreme tail / jitter |

> 📎 **In the codebase:** `BenchmarkFeatures` (the dataclass) and
> `MLAnomalyDetector.extract_features(...)` in `ml_detector/detector.py` build this vector
> from raw benchmark data. Trace one feature end to end — say `p99_to_p50_ratio` — and you've
> connected Module 05 (percentiles) → Module 06 (ratio) → here.

---

## 5. The hybrid design: learned model **+** hard rules

UORA doesn't trust the model alone. `detect()` combines two signals:

1. **The Isolation Forest** — flags *novel* weirdness it learned to recognize as "far from
   normal." Catches cheats you didn't anticipate.
2. **Hard rules** — domain thresholds that must *never* be missed, e.g.
   `pattern_correlation > 0.95`, `error_rate > 0.1`, `p99_to_p50_ratio > 10`,
   `state_transition_ged > 0.5`. If any trips, the run is flagged with score ≥ 0.85.

```python
# ml_detector/detector.py  (paraphrased)
raw_pred       = self.model.predict(X)[0]            # 1 = normal, -1 = anomaly
decision_score = self.model.decision_function(X)[0]  # + = normal, − = anomalous

# squash the raw score into a clean 0..1 "anomaly probability"
anomaly_score = 1.0 / (1.0 + math.exp(decision_score * 20.0))

if rule_triggered:                  # any hard red-flag
    anomaly_score = max(anomaly_score, 0.85)
is_anomaly = (raw_pred == -1) or rule_triggered
```

Why both? The model catches the **unknown unknowns**; the rules guarantee the **known
red-flags** are never silently passed. Belt and suspenders — the right posture when money and
fairness are on the line.

---

## 6. ▶ Runnable: clean engine vs. a cheater

```python
from uora.ml_detector.detector import MLAnomalyDetector, BenchmarkFeatures
d = MLAnomalyDetector(); d.fit()

normal = BenchmarkFeatures("normal",
    latency_entropy=8_000_000, pattern_correlation=0.20, volume_conservation_delta=3,
    state_transition_ged=0.08, latency_trend_slope=0.0005, throughput_variance=8000,
    error_rate=0.01, p99_to_p50_ratio=3.5)

hardcoded = BenchmarkFeatures("cheater",
    latency_entropy=500_000, pattern_correlation=0.99, volume_conservation_delta=0,
    state_transition_ged=0.0, latency_trend_slope=0.0, throughput_variance=100,
    error_rate=0.0, p99_to_p50_ratio=1.05)

rn, rh = d.detect(normal), d.detect(hardcoded)
print(f"NORMAL    score={rn.anomaly_score:.3f} flagged={rn.is_anomaly}")
# NORMAL    score=0.093 flagged=False
print(f"CHEATER   score={rh.anomaly_score:.3f} flagged={rh.is_anomaly}")
# CHEATER   score=0.850 flagged=True
print(rh.reason)
# Perfect correlation with test patterns (hardcoded responses) | Latency entropy collapse ...
```

The cheater's profile — near-zero latency variance, perfect pattern correlation, a flatline
tail — is exactly the fingerprint of canned responses. The detector lands it at **0.85** and
explains *why* in plain English (`_explain_anomaly`). That explanation matters: a judge won't
trust a black box that just says "0.85 — trust me."

---

## 7. 🧮 The math under the hood

- **Path length & the score.** For a point `x`, Isolation Forest averages its isolation depth
  `E[h(x)]` across trees and normalizes by `c(n)`, the expected depth in a random tree of `n`
  points: `s(x) = 2^(−E[h(x)]/c(n))`. `s → 1` means anomaly; `s → 0.5` means normal. sklearn's
  `decision_function` returns a centered version (positive = normal).
- **The logistic squash.** UORA maps the raw decision score to `[0,1]` with
  `1 / (1 + e^(20·score))`. The `×20` sharpens the sigmoid so normal points sit near 0 and
  anomalies near 1, instead of a mushy middle. This is the same logistic function used in
  logistic regression.
- **Contamination.** `IsolationForest(contamination=0.05)` tells the model to expect ~5% of
  data to be anomalous — it sets the decision threshold. Choosing this is a judgment call: too
  high and you flag honest engines; too low and you miss cheats.

---

## 8. Real-world caveats (read this — it's where the honesty lives)

- **It currently trains on *synthetic* normal data.** With fewer than 10 real "known-good"
  runs, `fit()` calls `_generate_synthetic_normal_data()` and learns from *made-up* normals.
  That means today the **hard rules do most of the real work**, and the forest is only as good
  as the synthetic distribution. The genuine production fix (Phase-2): collect real
  reference-engine runs and train on those. *This is the difference between "ML-flavored" and
  "ML-driven," and I won't pretend it's the latter yet.*
- **`pattern_correlation` is a weak feature** (see Module 06): a *correct* engine also
  correlates highly with expected patterns, so >0.95 alone over-flags. It's only meaningful
  alongside the other features.
- **`latency_entropy` is really std**, not information entropy — a loose name.
- **Synthetic-normal + fixed thresholds** means the detector is a strong *screening* tool, not
  a verdict. Flag → human review, never flag → auto-disqualify.
- **Determinism of the detector itself:** `RANDOM_STATE=42` is seeded so the same run always
  yields the same score — consistent with Module 07's determinism principle.

---

## 9. Common mistakes

1. **Trusting an unsupervised score as ground truth.** Anomaly ≠ guilt. It means "look here."
2. **Training on contaminated data.** If your "normal" set secretly contains cheats, the model
   learns to call cheating normal.
3. **One feature to rule them all.** Single features are gameable; the *vector* is the defense.
4. **Ignoring explainability.** A flagged run must come with *reasons*, or no one will act on it.

---

## 10. Exercises

1. **Crash signature.** Build a `BenchmarkFeatures` for a crash-and-restart (entropy collapse,
   high error rate, sharp negative slope). Detect it; read the reason string.
2. **Borderline.** Start from the `normal` profile and slowly raise `p99_to_p50_ratio` (5 → 9
   → 11). Find where `is_anomaly` flips, and explain which signal tripped (rule vs model).
3. **Rules vs model.** Set every feature to a normal value *except* `error_rate = 0.2`. Is it
   flagged by the rule or the forest? How can you tell? (Hint: the 0.85 floor.)
4. **Stretch / Phase-2.** Outline how you'd replace synthetic training with real data: where
   would the "known-good" runs come from, how many, and how would you prevent contamination?

---

## 11. 📚 Resources

- **Liu, Ting & Zhou — "Isolation Forest"** (ICDM 2008) — the original paper. Short and
  readable; the "anomalies are easy to isolate" intuition is right in the abstract.
- **scikit-learn — `IsolationForest` user guide & docs** — practical, with examples.
- **StatQuest / "Isolation Forest clearly explained"** (YouTube) — visual intuition for §3.
- **Charu Aggarwal — *Outlier Analysis*** — the comprehensive textbook when you want depth.
- **scikit-learn "Novelty and Outlier Detection"** guide — compares Isolation Forest with
  One-Class SVM and Local Outlier Factor, so you know the alternatives.

---

## What's next

You can now judge an engine on speed (05), correctness (07), and trustworthiness (08). Module
09 combines all of it into the single number that ranks the leaderboard — the **composite
score** — and derives it term by term (including a discrepancy in the code I'll show you
honestly).

**→ [Module 09 — Scoring & Benchmarking](module-09-scoring.md)**
