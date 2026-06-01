# Module 04 — Market Data & LOBSTER

> **Prerequisite:** [Module 01](module-01-lob-mechanics.md) (the book) and a feel for orders.
> **Goal:** Understand what real market data looks like, the three "levels" of data, and how
> UORA turns NASDAQ **LOBSTER** data into an order stream it can replay against every engine.
> **Time:** ~40 minutes + running the examples.

---

## 1. Why a benchmark lives or dies on its data

You cannot benchmark a trading engine with random noise. If the order stream isn't *realistic*
— real price clustering, real cancellation rates, real bursts — your latency and correctness
numbers mean nothing. **Garbage in, garbage benchmark.**

UORA's answer is to replay **real, historical order flow** from NASDAQ, captured in the
**LOBSTER** format, identically to every contestant. Same input, same conditions, fair
comparison. This module is about what that data *is*.

---

## 2. Market data is a *stream of events*, not a photo

Beginners picture market data as a series of snapshots ("the book at 9:30, the book at
9:31…"). Real market data is the opposite: it's the **stream of individual events** that
*change* the book — every order added, every order cancelled, every trade. The snapshot is
something you *reconstruct* by applying the events in order.

This is a profound and practical idea: **if you have the event stream, you can rebuild the
book at any instant** by replaying events up to that moment. It's event sourcing, exactly
like a database write-ahead log or a git history.

It's also *why benchmarking works*: feed the same order events to every engine and compare
the trades each one produces.

---

## 3. The three levels of market data

You'll hear "L1 / L2 / L3" constantly. Know them cold:

| Level | Also called | What you see | Example |
|-------|-------------|--------------|---------|
| **L1** | Top of book | Best bid, best ask, last trade | `bid 100.00 / ask 100.50` |
| **L2** | Market by price (MBP) | Aggregated size at each price level | `100.50 → 15 lots (2 orders)` |
| **L3** | Market by order (MBO) | *Every individual order* add/modify/cancel | `order #1002 added: sell 50 @ 100.25` |

- **L3 is the richest** — you see each order's identity and queue position, so you can
  reconstruct *everything* (including L2 and L1 from it).
- UORA's `get_orderbook_state()` (Module 01 §7) emits an **L2** view — it aggregates orders
  into price levels.
- **LOBSTER message files are essentially L3** — order-by-order events. That's why we can
  replay them through a matching engine.

---

## 4. What LOBSTER actually is

**LOBSTER** = *Limit Order Book System – The Efficient Reconstructor*, an academic project
(lobsterdata.com) that publishes reconstructed limit-order-book data for NASDAQ stocks. It
ships two paired files per stock per day:

- a **message file** — the event stream (one row per event), and
- an **orderbook file** — the reconstructed L2 snapshot after each event (handy for checking
  your reconstruction).

UORA only needs the **message file**: the events. Each row has six columns:

```
Time,  EventType,  OrderID,  Size,  Price,  Direction
```

### The event types

| EventType | Meaning | UORA action |
|:---------:|---------|-------------|
| 1 | Add order (new limit order) | `"limit"` |
| 2 | Partial cancellation | `"cancel"` (with a quantity) |
| 3 | Delete (full cancellation) | `"cancel"` (whole order) |
| 4 | Execution of a visible order | **skipped** |
| 5 | Execution of a hidden order | **skipped** |
| 7 | Trading halt | **skipped** |

### 🔑 The elegant trick: skip the executions

Why does UORA *throw away* the execution events (4, 5)? Because it doesn't need them — it
replays the **adds and cancels**, and lets the **matching engine generate the executions
itself**. That's the whole point of benchmarking: every engine receives the identical order
flow, and we compare the trades *they* produce against the reference. If you replayed the
recorded trades too, you'd be telling the engine the answer.

### Two encodings beginners trip over

1. **Price is in integer cents.** `10050` means **$100.50**. (Remember the tick-size point
   from Module 01: real systems store prices as integers to avoid float bugs.) The parser
   divides by 100.
2. **Direction is `±1`.** `1` = buy, `−1` = sell. The parser maps these to `"buy"`/`"sell"`.
3. **Time is fractional seconds since midnight.** The parser scales it to **nanoseconds**
   (`× 1e9`) to match UORA's nanosecond clock (Module 05).

> 📎 **In the codebase:** all of this is `uora/bot_fleet/lobster_parser.py` — about 60 lines.
> `_SKIP = {4, 5, 7}`, `_SIDE = {1: "buy", -1: "sell"}`, `price = price_cents / 100.0`,
> `ts = int(float(row[0]) * 1_000_000_000)`. Read it; it's a model of a clean parser.

---

## 5. ▶ Runnable: watch raw NASDAQ rows become UORA actions

The parser module has a built-in demo — run it directly:

```bash
python3 -m uora.bot_fleet.lobster_parser
```
```
✓ Parsed 4 actions (1 skipped: type 4)
  {'type': 'limit',  'side': 'buy',  'price': 100.5,  'qty': 100, 'order_id': '1001', ...}
  {'type': 'limit',  'side': 'sell', 'price': 100.25, 'qty': 50,  'order_id': '1002', ...}
  {'type': 'cancel', 'order_id': '1001', 'qty': 30, ...}      # type 2: partial cancel
  {'type': 'cancel', 'order_id': '1002', ...}                 # type 3: full delete
```

Or parse single rows yourself to see the encoding decode:

```python
from uora.bot_fleet.lobster_parser import _parse_row

print(_parse_row(["36000.0", "1", "1001", "100", "10050",  "1"]))
# {'type':'limit','side':'buy','price':100.5,'qty':100,'order_id':'1001',
#  'timestamp':36000000000000,'participant_id':'lobster-1001'}

print(_parse_row(["36000.0", "4", "1001", "70", "10025", "-1"]))
# None    <-- execution event, skipped (the engine will generate executions itself)
```

Notice `10050 → 100.5`, `direction 1 → "buy"`, and `36000.0` seconds → `36000000000000` ns.

---

## 6. ▶ Runnable: replay a real scenario through the engine

UORA ships a 50-action scenario in `data/lobster/sample_actions.json` (already in action
form). Replay it through the reference book and watch a market form:

```python
import json
from collections import Counter
from uora.validator.reference_lob import OrderBook, Order

actions = json.load(open("data/lobster/sample_actions.json"))
print("total actions:", len(actions))                      # 50
print("by type:", dict(Counter(a["type"] for a in actions)))  # {'limit': 34, 'cancel': 16}

book, total_fills = OrderBook(), 0
for a in actions:
    if a["type"] in ("limit", "market", "ioc", "fok"):
        fills, _ = book.submit_order(Order(
            a["order_id"], a["side"], a["type"], a.get("price"),
            a.get("qty", a.get("quantity", 0)),
            participant_id=a.get("participant_id", ""),
        ))
        total_fills += len(fills)
    elif a["type"] == "cancel":
        book.cancel_order(a["order_id"])

print("total fills generated:", total_fills)               # 20  <- engine MADE these
print("best bid:", book.get_best_bid(), "best ask:", book.get_best_ask())  # 100.75 None
print("top bids:", book.get_orderbook_state(depth=3)["bids"])
# [{'price': '100.75', 'quantity': 150, ...}, {'price': '100.25', ...}, {'price': '100.00', ...}]
```

You fed in 34 orders + 16 cancels and the **engine produced 20 trades** on its own. That's
the benchmark loop in miniature: *replay the flow, let the engine make the market, then judge
the result.* In the real platform, the **bot fleet** (Module 10) sends these actions over the
network to the contestant's engine instead of calling a local function — but the idea is
identical.

> 📎 **In the codebase:** the worker loads this file via `load_actions()` in
> `benchmark/worker.py`; `BotCoordinator` distributes the actions across many bots; and
> `TradingBot.run_scenario()` sends each one and records the result + latency.

---

## 7. 🧮 The math: units, scale, and why integers

- **Time:** LOBSTER time is seconds-since-midnight as a float; UORA stores **nanoseconds**
  (`int`). 1 second = 1e9 ns. HFT lives at the nanosecond, so everything is integer ns —
  floats would lose precision at that scale (a `float64` can't exactly represent arbitrary
  nanosecond counts across a full day).
- **Price:** integer cents → dollars by `/100`. Internally, *keep prices as integer ticks*
  for exact comparison; UORA uses floats in the reference book for readability and compares
  with a `0.001` tolerance to stay safe (Module 01 §8).
- **Data volume:** a single active NASDAQ stock can generate **millions** of messages per
  day. This is why the storage layer is a time-series database with hypertables and
  compression (Module 10), not a spreadsheet.

---

## 8. Real-world caveats

- **Reconstruction ≠ reality.** LOBSTER reconstructs the *visible* book. **Hidden/iceberg
  orders** (type 5) aren't fully observable, so any reconstruction has blind spots.
- **One venue.** LOBSTER is NASDAQ. Real assets trade across *many* venues simultaneously;
  the "true" national book (NBBO) is an aggregation. UORA deliberately scopes to one book.
- **Survivorship & sampling.** Public sample data is often a "nice" day. Benchmarks should
  include stressed/volatile sessions too (UORA's chaos injection, `bot_fleet/chaos.py`,
  exists for exactly this).
- **Free samples are tiny.** The lobsterdata.com free sample is a few stocks for one day.
  Production research buys full feeds.

---

## 9. Common mistakes

1. **Replaying executions** instead of letting the engine generate them — you leak the answer.
2. **Forgetting the cents encoding** — treating `10050` as $10,050 instead of $100.50.
3. **Mixing time units** — comparing LOBSTER seconds against UORA nanoseconds.
4. **Ignoring cancels** — cancels are ~30–60% of real message traffic; drop them and your
   book bloats with phantom liquidity. (Our sample is 16 cancels out of 50 — about a third.)

---

## 10. Exercises

1. **Decode by hand.** What action is `["34200.5", "1", "555", "200", "9975", "-1"]`? Give
   type, side, price, qty. Verify with `_parse_row`.
2. **Cancel ratio.** Compute the fraction of cancel events in `sample_actions.json`. Why do
   real markets cancel so much? (Hint: market makers constantly re-quote.)
3. **Reconstruct L1.** Replay the sample but print `(best_bid, best_ask)` after every 10th
   action. Watch the top of book move.
4. **Stretch.** The parser skips event types 4/5/7. If you *didn't* skip type 4 (executions)
   and instead applied them as forced trades, what could go wrong when benchmarking a
   contestant whose engine disagrees with the recorded execution?

---

## 11. 📚 Resources

- **LOBSTER** (lobsterdata.com) — the source. Read "Data Structure" and grab the free sample.
- **Nasdaq TotalView-ITCH** spec — the *raw* exchange protocol LOBSTER is built from. Skim it
  to see real message formats (Add, Cancel, Execute, Replace).
- **Databento** and **Polygon.io** docs — modern commercial market-data APIs; their schema
  docs are excellent free reading on L1/L2/L3.
- **Kaggle** — search "limit order book" for free datasets to practice on.
- **Paper:** *"The Price Impact of Order Book Events"* (Cont, Kukanov, Stoikov, 2014) — once
  you're comfortable, this connects order-flow data to price moves.

---

## What's next

You now have realistic order flow streaming through an engine. The instant orders cross the
network, the single most important number in HFT appears: **latency**. Next we measure it
correctly — and learn why the *average* latency is a lie.

**→ [Module 05 — Latency & Percentiles](module-05-latency.md)**
