# Module 09 — Scoring & Benchmarking

> **Prerequisite:** [Module 05](module-05-latency.md) (latency/throughput),
> [Module 07](module-07-correctness.md) (correctness_rate), [Module 08](module-08-anomaly-detection.md).
> **Goal:** Derive UORA's **composite score** term by term, understand *why* the formula is
> shaped the way it is, and see honestly where the code and its own documentation disagree.
> **Time:** ~45 minutes + running the examples.

---

## 1. The goal: one number to rank them all

A leaderboard needs a single, ordered number. But an engine has *many* qualities —
throughput, correctness, p50/p90/p99 latency, success rate, resource use, anomaly score. The
**composite score** collapses these into one rank-able value. The art is choosing a formula
that rewards what you value and punishes what you don't — and that can't be gamed by
sacrificing one quality for another.

---

## 2. The design philosophy

Before the formula, the *intent*:

- **Reward** the good: higher **throughput**, higher **correctness**, higher **success rate**.
- **Punish** the bad: higher **tail latency (p99)**, higher **resource consumption**.
- **Gate** on correctness: a wrong engine should be *fundamentally* limited, not merely docked
  a few points. So correctness is a **multiplier**, not a subtraction.

That intent translates directly into *where each term lives* — numerator (good) vs denominator
(bad), multiplier (gate) vs additive (penalty).

---

## 3. The formula, as it actually runs

Here is the real code from `uora/scoring/engine.py` (not a paraphrase):

```python
numerator   = avg_throughput * correctness_rate * float(summary["success_rate"])
denominator = (p99_latency / 1_000_000) + (resource_penalty ** 2)   # p99 ns → ms
composite_score = numerator / max(denominator, 1.0)
```

In words:

```
                 throughput × correctness_rate × success_rate
composite =  ────────────────────────────────────────────────────
                  p99_latency_ms  +  resource_penalty²        (floored at 1.0)
```

Let's justify every piece.

| Term | Where | Effect | Why |
|------|-------|--------|-----|
| `throughput` | numerator | more orders/sec → higher score | rewards raw speed |
| `correctness_rate` | numerator (**×**) | 50% correct → score **halved** | correctness is a gate, not a tax |
| `success_rate` | numerator (**×**) | failed requests shrink the score | an engine that errors out isn't useful |
| `p99_latency_ms` | denominator | lower tail → higher score | tail latency is what loses HFT races (Module 05) |
| `resource_penalty²` | denominator (**squared**) | resource hogs punished **non-linearly** | doubling resource use quarters its contribution |
| `max(…, 1.0)` | denominator floor | prevents divide-by-tiny blow-ups | a sub-millisecond engine can't get an infinite score |

---

## 4. ▶ Runnable: feel the formula

```python
def composite(throughput, correctness, success_rate, p99_ns, resource_penalty=1.0):
    numerator   = throughput * correctness * success_rate
    denominator = (p99_ns / 1_000_000) + (resource_penalty ** 2)
    return numerator / max(denominator, 1.0)

base = composite(1000, 1.0, 0.99, 500_000)          # 660.0  (p99 = 0.5 ms)
print(base)
print(composite(1000, 0.5, 0.99, 500_000))          # 330.0  — half correctness ⇒ half score
print(composite(1000, 1.0, 0.99, 5_000_000))        # 165.0  — 10× worse tail ⇒ score crashes
print(composite(1000, 1.0, 0.99, 100_000))          # 900.0  — 5× faster tail ⇒ score jumps
print(composite(1000, 1.0, 0.99, 500_000, 2.0))     # 220.0  — 2× resource ⇒ score ÷3 (squared!)
```

Read the lesson in the numbers:

- **Correctness is a true gate:** halving it (1.0 → 0.5) *exactly halves* the score (660 → 330).
- **The tail dominates:** a 10× worse p99 (0.5 → 5 ms) cuts the score 4× (660 → 165); a 5×
  *better* p99 lifts it (660 → 900). You win or lose on the tail.
- **Resource use is punished hard:** because it's *squared*, doubling `resource_penalty`
  (1 → 2) drops the denominator-weight enough to cut the score to a third (660 → 220).

> 📎 **In the codebase:** `compute_score()` reads raw `latency_events` from TimescaleDB, rolls
> them up with `compute_latency_summary()` (Module 05), fetches `correctness_rate` from the
> validator results (Module 07), computes the formula above, persists a row into
> `benchmark_scores`, and runs the anomaly detector (Module 08). `get_leaderboard()` then
> `SELECT … ORDER BY composite_score DESC` — that ordering *is* the leaderboard the SSE stream
> pushes to the dashboard (Module 10).

---

## 5. ⚠️ Where the code and the docs disagree — told straight

A senior engineer reads the code, not the comments. Here are three honest discrepancies in
the scoring path today, each a **Phase-2 fix**:

1. **The docstring omits `success_rate`.** The file header and the `"formula"` string both say
   `(throughput × correctness) / (p99_ms + resource²)`, but the *code* multiplies by
   `success_rate` too. The code is the truth; the comment is stale. **Fix:** align the
   docstring with the code (or decide success_rate shouldn't be there and remove it).

2. **`resource_penalty` is hardcoded to `1.0`.** Look two lines up in `compute_score`:
   `resource_penalty = 1.0  # Default … until cgroup/container metrics are attached.` So the
   `resource_penalty²` term is currently a **constant** — it doesn't actually measure anyone's
   CPU/memory. The builder even writes a `resources:{id}` key to Redis that nobody reads.
   **Fix:** sample real container stats during the benchmark and feed a true penalty in.

3. **Two anomaly features are passed as `0.0`.** In the inline anomaly call, `pattern_correlation`
   and `state_transition_ged` are hardcoded to `0.0` instead of being computed from the run's
   action/response data (the real `extract_features` exists and does compute them — Module 06).
   So the 8-feature model is effectively running on 6 live features. **Fix:** compute the full
   vector where the data lives (the worker) and pass it in.

None of this makes the platform fake — the matching, validation, latency, and leaderboard are
real. But these three are the gap between *"looks production-grade"* and *"is."* Naming them
precisely is step one of fixing them.

---

## 6. 🧮 The math: why this shape?

- **Multiply to gate, add to penalize.** Putting `correctness` in the numerator as a
  *multiplier* means it scales the *entire* score — a structural gate. Putting `p99` in the
  *denominator* as an *additive* term means latency penalizes smoothly without ever zeroing
  the score. Different roles, different math.
- **Squaring `resource_penalty`** makes the penalty **convex**: small overages barely matter,
  big ones hurt a lot. That's the right incentive — you don't want to punish a slightly hungry
  engine, but you want to crush a wasteful one.
- **Units.** Numerator ≈ orders/sec; denominator ≈ milliseconds. The ratio isn't a physical
  unit — it's an *index*, meaningful only *relative* to other engines on the same benchmark.
  Never read a composite score as if it had units; read it as a rank.
- **Monotonicity** (a property you want): improving any single good input (↑throughput,
  ↑correctness, ↓p99) never *decreases* the score, holding others fixed. This formula has it —
  which means contestants can't be punished for getting better at something.

---

## 7. Real-world caveats

- **Goodhart's Law:** *"When a measure becomes a target, it ceases to be a good measure."* The
  instant contestants optimize for this exact formula, they'll exploit its blind spots (e.g.
  if `resource_penalty` is constant, ignore efficiency entirely). Good benchmarks evolve and
  keep some criteria opaque.
- **Weights encode values.** Why p99 and not p99.9? Why square resources and not latency?
  Every choice is a value judgment. Be able to *defend* each one — judges will ask.
- **Normalization.** Comparing engines across *different* market scenarios needs normalization
  (e.g. score per unit of offered load) or the "easy" scenario wins. UORA benchmarks all
  engines on the *same* replay to sidestep this.
- **Single number hides shape.** Two engines with score 660 can be very different (one fast +
  slightly wrong, one slower + perfect). The score ranks; the per-metric breakdown explains.
  That's why the dashboard shows both.

---

## 8. Common mistakes

1. **Reading the comment, not the code.** (See §5.) Always verify the live formula.
2. **Adding correctness instead of multiplying.** Then a 0%-correct engine could still rank
   high on throughput — absurd. Multiplication makes correctness a gate.
3. **Forgetting the denominator floor.** Without `max(…, 1.0)`, a sub-millisecond engine's
   score would explode toward infinity.
4. **Comparing composite scores across different benchmarks.** They're only comparable on the
   *same* replay.

---

## 9. Exercises

1. **Gate check.** Using `composite(...)`, find the correctness rate that turns a score of 660
   into 132. (Hint: it's a pure multiplier.)
2. **Tail vs throughput.** Engine A: throughput 2000, p99 4 ms. Engine B: throughput 1000, p99
   1 ms. Same correctness/success. Who wins, and by how much? Compute it.
3. **Resource convexity.** Plot (by hand or code) `composite` as `resource_penalty` goes
   1 → 2 → 3 → 4. Why does the curve fall faster than linearly?
4. **Design.** Propose a *fourth* numerator or denominator term you think UORA should add
   (e.g. p99.9, fairness, anomaly_score). Where would it go, multiplier or additive, and why?
5. **Stretch / Phase-2.** Write the real `resource_penalty`: given a container's average CPU%
   and memory MB during the run, propose a formula that's 1.0 at a baseline and grows convexly.
   How would you feed it into `compute_score`?

---

## 10. 📚 Resources

- **"Goodhart's Law"** (read the Wikipedia summary + Marilyn Strathern's phrasing) — essential
  for anyone designing metrics people compete on.
- **The original UORA score** lives in `uora/scoring/engine.py` — read `compute_score()` and
  `get_leaderboard()` end to end; you now understand every line.
- **"Designing Data-Intensive Applications" (Kleppmann)** — for the percentile/throughput
  reasoning that underpins the denominator.
- **Kaggle competition "Evaluation" pages** — real examples of how scoring formulas are
  defined and defended for leaderboards.

---

## What's next

You now understand the entire judging pipeline — speed, correctness, trust, and the score that
ranks them. The final module zooms out to the **systems** that make it run safely at scale:
sandboxing untrusted code, queues, the time-series database, and real-time streaming.

**→ [Module 10 — Systems for Quant](module-10-systems.md)**
