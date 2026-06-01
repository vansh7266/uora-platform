# Appendix B — Resources to Go Deeper

> The curated path from "finished this handbook" to "employable quant developer." This is
> **not** a link dump — it's opinionated and ordered. Start with the ⭐ in each section; only
> go wider if you want depth there. Most picks are free.

---

## How to use this

1. You've finished the handbook — you have the *map*. These resources fill in *territory*.
2. **Pick a direction** (microstructure? performance? ML? systems?) and go deep on one before
   spreading out. Breadth without one deep spike is how people stay junior.
3. **Build while you read.** Re-implement UORA's reference book from scratch. Parse a real
   LOBSTER file. Re-derive the score. Reading alone fades; building sticks.

---

## The one-best-thing per pillar (if you only do five things)

| Pillar | Do this one thing | Why |
|--------|-------------------|-----|
| Microstructure | ⭐ Larry Harris, *Trading and Exchanges* (order-book chapters) | The definitive, practitioner-grade explanation of how markets actually work. |
| Latency/perf | ⭐ Gil Tene, *"How NOT to Measure Latency"* (1-hr talk) | Permanently fixes how you think about percentiles and tails. |
| Math/ML | ⭐ 3Blue1Brown, *Essence of Linear Algebra* + StatQuest stats | Visual intuition for the dot products, variance, and regression UORA uses. |
| Systems | ⭐ Kleppmann, *Designing Data-Intensive Applications* | The best systems book, period — queues, storage, delivery semantics. |
| Quant career | ⭐ Xinfeng Zhou, *A Practical Guide to Quantitative Finance Interviews* | What the field actually tests; calibrates where you are. |

---

## By topic (mapped to the handbook)

### Market microstructure & order books — Modules 01–04, 07
- ⭐ **Larry Harris — *Trading and Exchanges*** — the bible. Read order precedence, order types,
  and market structure chapters.
- **Robert Kissell — *The Science of Algorithmic Trading*** — practitioner intro to
  microstructure and execution.
- **LOBSTER** (lobsterdata.com) — read "Data Structure"; grab the free sample (Module 04).
- **Nasdaq TotalView-ITCH spec** — the real exchange message protocol behind LOBSTER.
- **QuantStart** "Limit Order Book" / "Matching Engine" articles — free, code-first.

### Latency, performance & percentiles — Module 05
- ⭐ **Gil Tene — "How NOT to Measure Latency"** (YouTube) — *watch it twice.*
- **Brendan Gregg — *Systems Performance*** — the modern performance bible; latency chapters.
- **HdrHistogram** (hdrhistogram.org) — the standard for recording tail latency; read *why*.
- **Dean & Barroso — "The Tail at Scale"** (CACM 2013) — the paper behind tail-at-scale.

### The math: stats, linear algebra, ML — Modules 06, 08
- ⭐ **3Blue1Brown — *Essence of Linear Algebra*** (YouTube) — dot products & vectors, visual.
- ⭐ **StatQuest with Josh Starmer** (YouTube) — stats, regression, and ML from zero, joyfully.
- **Khan Academy — Statistics & Probability** — solid free fundamentals.
- **Jake VanderPlas — *Python Data Science Handbook*** (free online) — NumPy + practical math.
- **Liu, Ting & Zhou — "Isolation Forest"** (ICDM 2008) — the anomaly-detection paper (Module 08).
- **scikit-learn user guide** — "Novelty and Outlier Detection" compares the alternatives.

### Correctness, determinism & testing — Module 07
- ⭐ **TigerBeetle / FoundationDB talks on deterministic simulation testing** (YouTube) — how
  the best build bit-for-bit reproducible systems.
- **Hypothesis** (Python property-based testing) — generate adversarial action streams.
- **Jepsen** (jepsen.io) — Kyle Kingsbury's distributed-correctness testing; inspiring rigor.
- **"Differential testing"** — search the *Csmith* compiler-fuzzing work.

### Systems & infrastructure — Module 10
- ⭐ **Martin Kleppmann — *Designing Data-Intensive Applications*** — if you read one systems
  book, this. Queues, storage, replication, delivery semantics.
- **Google SRE Book** (free, sre.google) — load, queues, cascading failures.
- **Redis Streams docs** (redis.io) — consumer groups, `XREADGROUP`, `XACK`.
- **TimescaleDB docs** — hypertables & continuous aggregates.
- **gVisor** (gvisor.dev) — user-space kernel sandboxing, "What is gVisor?".
- **MDN — "Using server-sent events"** — the SSE primer.

### Quant finance, broadly + careers
- ⭐ **Xinfeng Zhou — *A Practical Guide to Quantitative Finance Interviews*** ("the green book").
- **Euan Sinclair — *Volatility Trading*** — when you want real trading strategy depth.
- **Hull — *Options, Futures, and Other Derivatives*** — the standard if you go toward pricing.
- **wilmott.com forums** and **r/quant** — community, honest career talk.

---

## Books, tiered

**Start (beginner):**
- *A Practical Guide to Quantitative Finance Interviews* — Zhou
- *Python Data Science Handbook* — VanderPlas (free)

**Core (intermediate — where this handbook leaves you):**
- *Trading and Exchanges* — Harris
- *Designing Data-Intensive Applications* — Kleppmann
- *Systems Performance* — Gregg

**Deep (advanced):**
- *Algorithmic and High-Frequency Trading* — Cartea, Jaimungal, Penalva (the math-heavy HFT text)
- *Market Microstructure Theory* — O'Hara
- *Options, Futures, and Other Derivatives* — Hull

---

## Free courses & lecture series
- **MIT OCW 15.401 / 15.450** — Finance Theory & Analytics of Finance (free).
- **3Blue1Brown** — Linear Algebra *and* Calculus essences.
- **StatQuest** — stats & ML playlists.
- **Jane Street Tech Talks** (YouTube) — exchange & systems talks you can now follow.
- **fast.ai** — if you want to go deeper into ML practically.

---

## Datasets to practice on
- **LOBSTER** free sample — real NASDAQ order book (Module 04 format).
- **Kaggle** — search "limit order book" / "high frequency trading".
- **Databento / Polygon.io** — modern market-data APIs with free tiers and superb docs.
- **Crypto exchange APIs** (Binance, Coinbase) — free, real-time L2/L3 order books to stream.

---

## The canon of papers (read once you're comfortable)
- **Dean & Barroso — "The Tail at Scale"** (2013) — latency at scale.
- **Liu, Ting & Zhou — "Isolation Forest"** (2008) — anomaly detection.
- **Cont, Kukanov & Stoikov — "The Price Impact of Order Book Events"** (2014) — links
  order-flow data to price moves.
- **Easley, López de Prado & O'Hara — "Flow Toxicity and Liquidity" (VPIN)** (2012) — a famous
  microstructure signal.

---

## Tools worth learning
- **Python**: `numpy`, `pandas`, `scikit-learn`, `asyncio` (all used in UORA).
- **A systems language**: C++ or Rust — real matching engines are written here (and contestants
  submit them).
- **Docker / containers** — you can't ship quant infra without it (Module 10).
- **A time-series database** — TimescaleDB or ClickHouse.
- **perf / flamegraphs** (Brendan Gregg's tools) — to actually *see* where latency goes.

---

## A 90-day roadmap (≈1 hr/day) to "I could do this for a living"

| Days | Focus | Concrete output |
|------|-------|-----------------|
| 1–14 | Re-read Modules 01–03 + Harris order-book chapters | Reimplement the reference LOB from scratch, passing all 9 tests |
| 15–28 | Module 04 + LOBSTER | Parse a real LOBSTER file; replay it; reconstruct L1/L2 |
| 29–45 | Module 05 + Gil Tene + HdrHistogram | Build a latency harness; report p50/p90/p99/p99.9 honestly |
| 46–60 | Module 06 + 3B1B + StatQuest | Re-derive every UORA feature in a notebook |
| 61–75 | Modules 07–08 + Isolation Forest paper | Add property-based tests; train an anomaly detector on real runs |
| 76–90 | Modules 09–10 + Kleppmann (queues/storage) | Stand up the UORA stack; trace one submission end to end |

Finish that and you won't just understand UORA — you'll be able to *build* the next one.

---

← Back to the [Handbook index](README.md) · Formula lookup: [Appendix A](appendix-a-math-reference.md)
