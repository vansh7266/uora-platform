# Module 05 — Latency & Percentiles

> **Prerequisite:** [Module 04](module-04-market-data.md) (orders crossing the network).
> **Goal:** Measure latency *correctly*, understand why the **average is a lie**, master
> percentiles (p50/p90/p99), and see the exact functions UORA uses to compute them.
> **Time:** ~50 minutes + running the examples. This is a flagship module — go slow.

---

## 1. Why latency is the whole game

High-frequency trading is, mechanically, a **race**. When a profitable opportunity appears,
many firms see it at once. The order that reaches the matching engine *first* wins the trade
(price-time priority — Module 01). Being **one microsecond slower** can mean you lose, every
time, forever. Firms spend millions on microwave towers and co-location to shave nanoseconds.

So when UORA benchmarks a matching engine, **how fast it responds** is a first-class score
input. Latency sits in the *denominator* of the composite score (Module 09): lower latency
→ higher score. This module is how we measure it without fooling ourselves.

---

## 2. What "latency" means, and how to measure it without lying

**Latency** = the time between sending a request and receiving its response. For UORA, it's
how long the contestant's engine takes to acknowledge an order.

The first trap is measuring with the **wrong clock**. You must use a **monotonic** clock —
one that only ever moves forward at a steady rate — not the wall-clock time of day.
Wall-clock time can jump backward or forward when the OS syncs with NTP, which would produce
*negative* or absurd latencies.

UORA gets this right:

```python
# uora/bot_fleet/bot.py
t_start = time.perf_counter_ns()      # monotonic, nanosecond resolution
result  = await coro                  # send the order, await the engine's reply
latency_ns = time.perf_counter_ns() - t_start
```

`time.perf_counter_ns()` is Python's monotonic high-resolution clock. **Never** measure
latency with `time.time()`.

### Units — get fluent

| Unit | Symbol | Seconds | Mental anchor |
|------|--------|---------|---------------|
| millisecond | ms | 10⁻³ | a blink is ~100 ms |
| microsecond | µs | 10⁻⁶ | light travels ~300 m |
| **nanosecond** | ns | 10⁻⁹ | light travels ~30 cm |

HFT lives in **nanoseconds and microseconds**. UORA stores every latency as an integer
**nanosecond** count (`latency_ns BIGINT` in the database) and converts to ms only for human
display.

---

## 3. The average is a lie

Here is the single most important idea in this module. Consider 100 orders:

- 95 of them are fast: **1 ms** each.
- 5 of them are slow: **100 ms** each (a GC pause, a lock, a cache miss).

```python
from uora.scoring.engine import compute_latency_summary

rows = ([{"latency_ns": 1_000_000,   "success": True}] * 95 +
        [{"latency_ns": 100_000_000, "success": True}] * 5)

s = compute_latency_summary(rows, duration_seconds=10.0)
print("mean:", 5.95, "ms")                       # the average
print("p50 :", s["p50_latency_ns"]/1e6, "ms")    # 1.0
print("p90 :", s["p90_latency_ns"]/1e6, "ms")    # 1.0
print("p99 :", s["p99_latency_ns"]/1e6, "ms")    # 100.0
```

Read those numbers slowly:

- The **average** is **5.95 ms** — but *no single order took 5.95 ms*. The average is a
  fiction created by mixing fast and slow.
- The **median (p50)** is **1 ms** — half your orders are at least this fast. This is the
  "typical" experience.
- The **p99** is **100 ms** — the slow tail. **This is what kills you in HFT**, because
  during those 5 slow orders you lost the race.

> **The lesson:** averages *hide* the tail; percentiles *expose* it. A trader who only looks
> at the mean has no idea that 1 in 20 of their orders is 100× too slow. In HFT, the **tail
> is the product.**

---

## 4. Percentiles, from zero

A **percentile** answers: *"What value is X% of my data at or below?"*

- **p50** (the **median**): 50% of orders were this fast or faster. The midpoint.
- **p90**: 90% were at or below this; the slowest 10% were worse.
- **p99**: 99% were at or below this; the slowest **1%** were worse.
- **p99.9 / p99.99**: the *extreme* tail — matters enormously at scale (§7).

A clean way to say it: **"my p99 latency is 100 ms"** = *"99% of my orders finished within
100 ms; the worst 1% took longer."* Lower percentile values are better — they mean even your
slow requests are fast.

```
   1ms ███████████████████████████████████████████  p50 (median) — typical
   1ms ███████████████████████████████████████████  p90 — still fast
 100ms ███████████████████████████████████████████  p99 — the tail that hurts
```

---

## 5. How UORA computes percentiles: nearest-rank

There are several percentile definitions. UORA uses the **nearest-rank** method because it's
deterministic and simple — and *determinism matters* (Module 07): the same data must always
give the same percentile, with no interpolation ambiguity.

```python
# uora/scoring/engine.py
def _nearest_rank_percentile(sorted_values, percentile):
    if not sorted_values:
        return 0
    rank = int(np.ceil(len(sorted_values) * percentile))   # ⌈n · p⌉
    return sorted_values[min(max(rank, 1) - 1, len(sorted_values) - 1)]
```

The recipe:
1. **Sort** the values ascending.
2. Compute the **rank** = ⌈n · p⌉ (round *up*). For n=10, p=0.99: ⌈9.9⌉ = 10.
3. Return the value at position `rank` (1-indexed).

```python
from uora.scoring.engine import _nearest_rank_percentile
s = list(range(1, 11))   # [1,2,3,4,5,6,7,8,9,10]
print(_nearest_rank_percentile(s, 0.50))   # 5
print(_nearest_rank_percentile(s, 0.90))   # 9
print(_nearest_rank_percentile(s, 0.99))   # 10
```

> 📎 **In the codebase:** the *same* nearest-rank function appears in both
> `scoring/engine.py` and `bot_fleet/coordinator.py` — deliberately, so the live bot fleet
> and the final scoring agree to the exact integer. Raw per-order latencies land in the
> `latency_events` hypertable; `compute_latency_summary()` rolls them up into p50/p90/p99,
> throughput, and success/error rates.

---

## 6. Throughput — the other half

**Throughput** (often **TPS**, transactions/orders per second) = how many orders the engine
processes per unit time.

```python
s = compute_latency_summary(rows, duration_seconds=10.0)
print(s["throughput"])   # 10.0  -> 100 orders over 10 seconds
```

Latency and throughput are *different* questions:

- **Latency** = how long *one* order takes (a single car's trip time).
- **Throughput** = how many orders *per second* (cars per hour through the highway).

They trade off. Push throughput too high and queues build, so latency (especially the tail)
explodes. A great engine keeps **low p99 latency even at high throughput**. That's precisely
why UORA's score rewards throughput in the numerator *and* punishes p99 in the denominator
(Module 09): you can't win by being fast on one order while choking under load, nor by
processing many orders sloppily and slowly.

> 🧮 **Little's Law** (worth knowing): in a stable system, `L = λ · W` — the average number
> of in-flight requests `L` equals arrival rate `λ` times average time-in-system `W`. It's
> the formal link between throughput and latency. When `λ` rises past what the engine can
> serve, `W` (and the tail) blows up.

---

## 7. 🧮 The math: why the tail dominates at scale

This is the deepest idea here, and the real reason HFT obsesses over p99/p99.9.

Suppose serving one user request requires calling **N** independent services (or, in trading,
your order passes through N hops/components), each with a p99 of 10 ms — i.e. each is slow
1% of the time. The probability that **at least one** hop is in its slow 1% is:

```
P(slow request) = 1 − (0.99)^N
```

- N = 1   → 1% of requests are slow
- N = 10  → 1 − 0.99¹⁰ ≈ **9.6%**
- N = 100 → 1 − 0.99¹⁰⁰ ≈ **63%**

At N=100, the thing that was a "1-in-100 rare event" for one component becomes the **common
case** for the overall request. This is the famous **"tail at scale"** result (Dean &
Barroso, Google). It's why a component's p99 — not its average — is what determines
system-level experience, and why shaving the tail is worth so much.

### Why percentiles, formally

For a sorted sample, the p-th percentile is the value at rank ⌈n·p⌉. Percentiles are
**order statistics** — they describe the *shape* of the distribution, not just its center.
The mean is sensitive to outliers (one 100 ms order drags it up); the median and high
percentiles are **robust** to the bulk yet **reveal** the tail. That combination is why
latency is *always* reported as a percentile spread, never a single average.

---

## 8. Real-world caveats (the stuff that bites professionals)

- **Coordinated omission** — the most famous latency-measurement bug (Gil Tene). If you send
  a request, wait for the reply, *then* send the next, a stall makes you stop sending — so
  you never record the requests that *would* have been slow. Your measurement quietly omits
  the worst cases and reports a far-too-rosy tail. UORA's bots are closed-loop (send → await
  → sleep 1–10 ms), so they carry some coordinated-omission risk; an honest improvement is to
  measure each order against its *intended* send time. *Knowing this caveat is intermediate.*
- **Warm-up / JIT / cache** — the first orders are slow (cold caches, JIT compilation).
  Production benchmarks discard a warm-up window.
- **GC and safepoint pauses** — garbage-collected engines (Go, JVM) get periodic pauses that
  show up *only* in the tail. This is exactly the kind of thing UORA's anomaly detector
  (Module 08) is built to flag via the p99/p50 ratio.
- **Resolution & overhead** — even reading the clock costs time; at nanosecond scale your
  measurement instrument has to be faster than what you measure.

---

## 9. Common mistakes

1. **Reporting the average.** The cardinal sin. Always report percentiles.
2. **Using `time.time()`** instead of a monotonic clock for durations.
3. **Ignoring p99.9** at scale — see §7; the tail compounds.
4. **Comparing latencies across runs with different load** — latency is meaningless without
   the throughput it was measured at.

---

## 10. Exercises

1. **Build the lie.** Make a dataset of 90 orders at 2 ms and 10 at 50 ms. Predict the mean,
   p50, p90, p99. Verify with `compute_latency_summary`.
2. **Rank by hand.** For n=20 samples, what 1-indexed rank does nearest-rank pick for p90 and
   p99? Confirm with `_nearest_rank_percentile`.
3. **Tail at scale.** Compute `1 − 0.999^N` (each hop p99.9 = slow 0.1% of the time) for
   N = 50 and N = 500. How good does each component have to be for a 500-hop request to stay fast?
4. **Throughput vs latency.** Keep the same 100 orders but pass `duration_seconds=1.0` instead
   of 10. Which metric changes, and which doesn't? Why?
5. **Stretch.** Describe, in code or words, how you'd fix coordinated omission in
   `TradingBot`/`BotCoordinator`. (Hint: schedule send times in advance; record latency from
   the *scheduled* time, not the actual send.)

---

## 11. 📚 Resources

- **Gil Tene — "How NOT to Measure Latency"** (YouTube talk). *Watch this.* The definitive
  talk on percentiles and coordinated omission. One hour that changes how you think.
- **Brendan Gregg — *Systems Performance*** — the chapters on latency and USE method. The
  modern performance bible.
- **HdrHistogram** (hdrhistogram.org) — the standard library for recording latency across a
  huge dynamic range without losing tail resolution. Read *why* it exists.
- **Dean & Barroso — "The Tail at Scale"** (CACM, 2013) — the paper behind §7. Short, famous,
  essential.
- **Little's Law** (Wikipedia) — the throughput↔latency identity, with intuition.

---

## What's next

You've now met several formulas — percentiles, throughput, ratios. Module 06 steps back and
teaches *all* the math UORA uses, from zero: mean and variance, regression, similarity, and
the graph distance behind determinism checks — each tied to the exact line of code that uses it.

**→ [Module 06 — The Math of Quant](module-06-the-math.md)**
