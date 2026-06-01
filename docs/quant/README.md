# The UORA Quant Handbook

> **Learn quantitative trading systems by building one.**
> A zero-to-intermediate course in market microstructure, matching engines, latency
> science, and the math behind high-frequency trading — taught through the *actual*
> code in this repository.

---

## Who this is for

You are a strong engineer but **new to quant finance**. You don't need any prior
finance knowledge. You don't need heavy math — we build every formula up from
intuition first, then write it down precisely, then show you exactly where it lives
in the UORA codebase.

By the end you will be able to:

- Explain how a real exchange matches buyers and sellers (and why the rules are what they are).
- Read and reason about an order book, order types, and order lifecycles.
- Understand *why* high-frequency traders obsess over nanoseconds, and measure latency correctly.
- Do the core math of quant systems: percentiles, variance, regression, similarity, determinism.
- Detect cheating and broken engines with machine learning.
- Defend the design of a benchmarking platform to a professional engineer.

This is **intermediate** by the end — not "quant researcher pricing exotic
derivatives," but "quant *developer* who understands trading infrastructure." That is
exactly the skill set UORA is built around, and exactly what the IICPC judges will probe.

---

## How to use this handbook

1. **Read in order.** Each module builds on the last.
2. **Run the code.** Every code block marked `▶ Runnable` works against this repo. Open a
   terminal in the project root and try it. Reading without running is how people *think*
   they understand quant and then freeze in interviews.
3. **Do the exercises.** They're small. They're where the learning actually happens.
4. **Follow the `📎 In the codebase` pointers.** They link each concept to the real file
   that implements it, so theory and practice never drift apart.
5. **Don't rush the math.** The `🧮 The math` sections are optional on a first pass but
   essential before you call yourself intermediate. [Appendix A](appendix-a-math-reference.md)
   collects every formula in one place.

A note on honesty: where the real world is messier than the lesson, I say so in a
`⚠️ Real-world caveat` box. A quant who doesn't know the limits of their model is dangerous.

---

## The learning path

```
                          ┌──────────────────────────────┐
        FOUNDATIONS       │  01  Markets & the Order Book │
                          │  02  The Matching Engine      │
                          │  03  Order Lifecycle & State  │
                          └───────────────┬──────────────┘
                                          │
                          ┌───────────────▼──────────────┐
        DATA & SPEED      │  04  Market Data & LOBSTER    │
                          │  05  Latency & Percentiles    │
                          │  06  The Math of Quant        │
                          └───────────────┬──────────────┘
                                          │
                          ┌───────────────▼──────────────┐
        JUDGING ENGINES   │  07  Correctness & Determinism│
                          │  08  Anomaly Detection & ML   │
                          │  09  Scoring & Benchmarking   │
                          └───────────────┬──────────────┘
                                          │
                          ┌───────────────▼──────────────┐
        PUTTING IT        │  10  Systems for Quant        │
        TOGETHER          │      (sandbox, queues, TSDB)  │
                          └──────────────────────────────┘
```

---

## Modules

| #  | Module | What you'll learn | Maps to UORA component |
|----|--------|-------------------|------------------------|
| 01 | [Markets & the Limit Order Book](module-01-lob-mechanics.md) | Bids, asks, spread, depth, price-time priority | `validator/reference_lob.py` |
| 02 | [The Matching Engine](module-02-matching-engine.md) | Limit / market / IOC / FOK, partial fills, self-trade prevention | `validator/reference_lob.py` |
| 03 | [Order Lifecycle & State Machines](module-03-order-lifecycle.md) | Legal vs illegal state transitions, why they matter | `validator/diff_engine.py` |
| 04 | [Market Data & LOBSTER](module-04-market-data.md) | What real order flow looks like, message types, replay | `bot_fleet/lobster_parser.py`, `data/lobster/` |
| 05 | [Latency & Percentiles](module-05-latency.md) | p50/p90/p99, tail latency, throughput, why HFT counts nanoseconds | `scoring/engine.py`, `telemetry/` |
| 06 | [The Math of Quant](module-06-the-math.md) | Mean, variance, percentiles, regression, cosine similarity, GED | `scoring/`, `ml_detector/` |
| 07 | [Correctness & Determinism](module-07-correctness.md) | Validation levels L1–L4, market invariants, deterministic replay | `validator/diff_engine.py` |
| 08 | [Anomaly Detection & ML](module-08-anomaly-detection.md) | Isolation Forest, feature engineering, catching cheaters | `ml_detector/detector.py` |
| 09 | [Scoring & Benchmarking](module-09-scoring.md) | The composite score formula, derived term by term | `scoring/engine.py` |
| 10 | [Systems for Quant](module-10-systems.md) | Sandboxing, queues, time-series DBs, real-time streaming | `sandbox/`, `submission/`, `benchmark/` |

**Appendices**

- [Appendix A — Math Reference](appendix-a-math-reference.md): every formula in UORA, one place.
- [Appendix B — Resources to Go Deeper](appendix-b-resources.md): the best books, courses, papers, datasets, and communities — curated, not a link dump.

---

## A 4-week study plan (≈1 hour/day)

You don't have to follow this, but if you want a schedule:

| Week | Focus | Modules | Outcome |
|------|-------|---------|---------|
| 1 | Foundations | 01 → 03 | You can explain how an exchange matches orders and trace any order's life. |
| 2 | Data & Speed | 04 → 06 | You can read market data and reason about latency and the underlying math. |
| 3 | Judging | 07 → 09 | You understand how UORA decides if an engine is correct, honest, and fast. |
| 4 | Systems + review | 10 + redo exercises | You can defend the whole platform end to end. |

---

## Prerequisites (all free, all optional)

- **Python basics** — variables, functions, classes, `list`/`dict`. If you can read the
  code in `uora/`, you're ready.
- **A terminal** in the project root.
- **Curiosity about markets.** That's the real prerequisite.

> New to the absolute basics of markets? Watch *"How does the stock market work?"*
> (Oliver Elfenbaum, TED-Ed, 5 min) before Module 01. Everything else we build here.

---

*Written for the UORA platform — IICPC Summer Hackathon 2026. Every code example is
verified against the implementation in this repository.*
