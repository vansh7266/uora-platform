# Module 02 — The Matching Engine

> **Prerequisite:** [Module 01](module-01-lob-mechanics.md) (bids/asks, spread, price-time priority).
> **Goal:** Master the four order types, partial-fill edge cases, the order state machine,
> and self-trade prevention — all the rules your validator must know cold.
> **Time:** ~50 minutes + running the examples.

---

## 1. Why this matters for UORA

In Module 01 you built intuition for a book that only held simple limit orders. Real engines
handle **four order types**, each with different rules. UORA's job is to decide whether a
contestant's engine got those rules *exactly* right.

Here's the trap: if **your** understanding of the rules is wrong, your validator will flag a
*correct* engine as broken (a false positive) or pass a *cheating* one (a false negative).
Either destroys the platform's credibility in front of judges. So this module is about
precision, not vibes.

Everything below is verified against the real engine in
[`uora/validator/reference_lob.py`](../../uora/validator/reference_lob.py).

---

## 2. The four order types

> **Memory hook:** every order type is just a different answer to two questions —
> *"What price am I willing to accept?"* and *"What happens to the part that doesn't fill?"*

| Type | Price constraint | Unfilled remainder | Can rest in book? |
|------|------------------|--------------------|-------------------|
| **Limit** | Yes — my price or better | **Rests** in the book | ✅ Yes |
| **Market** | None — any price | **Discarded** | ❌ No |
| **IOC** (Immediate-or-Cancel) | Yes | **Cancelled** immediately | ❌ No |
| **FOK** (Fill-or-Kill) | Yes | **All-or-nothing**: cancel the *whole* order if it can't fully fill | ❌ No |

### 2.1 Limit — "trade at my price or better, and wait if you must"

```
BUY LIMIT 100 @ 50.00  →  fills against any seller asking ≤ 50.00;
                          whatever is left RESTS in the book at 50.00.
```

### 2.2 Market — "trade right now at whatever price"

A market order has **no price** (`price=None`). It sweeps the book until filled or the book
runs dry. Any remainder is **discarded** — market orders never rest.

```python
from uora.validator.reference_lob import OrderBook, Order
book = OrderBook()
book.submit_order(Order("S1", "sell", "limit", 100.0, 5))     # a resting seller
fills, mkt = book.submit_order(Order("B1", "buy", "market", None, 3))
print(len(fills), mkt.status, mkt.remaining_qty)   # 1 filled 0
```

> ⚠️ **Real-world caveat:** a market order with no liquidity to absorb it can fill at a
> terrible price ("slippage") or, in real exchanges, be rejected. The reference engine
> simply discards the unfilled remainder and marks the order `cancelled` if it couldn't
> fully fill. Production venues add price bands / circuit breakers to stop runaway fills.

### 2.3 IOC — "fill what you can *now*, cancel the rest"

IOC is a limit order that is **not allowed to rest**. It fills everything it can at its price
limit, then cancels the leftover *immediately*.

```python
book = OrderBook()
book.submit_order(Order("S1", "sell", "limit", 100.0, 3))      # only 3 available
fills, ioc = book.submit_order(Order("B1", "buy", "ioc", 100.0, 5))
print(len(fills), fills[0].quantity)   # 1 3        -> filled the 3 that existed
print(ioc.status, ioc.remaining_qty)   # cancelled 2 -> the other 2 are cancelled, not rested
print("B1" in book.orders)             # False       -> IOC never rests
```

**Timeline view:**
```
IOC BUY 100 @ 50.00 arrives
├── 60 lots resting @ 49.50  → fill 60   (49.50 ≤ 50.00 ✓)
├── 30 lots resting @ 49.80  → fill 30   (49.80 ≤ 50.00 ✓)
├── 20 lots resting @ 50.10  → STOP      (50.10 > 50.00 ✗ price limit)
└── 10 lots still unfilled   → CANCELLED instantly
Final: 90 filled, 10 cancelled, status = "cancelled"
```

### 2.4 FOK — "all of it, right now, or none of it"

FOK checks **before trading** whether the *entire* quantity can be filled. If not, it
executes **zero** fills and cancels the whole order. This is the only type that looks at the
book before committing.

```python
book = OrderBook()
book.submit_order(Order("S1", "sell", "limit", 100.0, 3))      # only 3 available
fills, fok = book.submit_order(Order("B1", "buy", "fok", 100.0, 5))  # wants 5
print(fills)                # []          -> ZERO fills
print(fok.status)           # cancelled   -> whole order killed
print(book.get_best_ask())  # 100.0       -> resting S1 is completely untouched
```

**The IOC vs FOK distinction is a classic interview question:**

| Available liquidity | Order wants | **IOC** result | **FOK** result |
|---------------------|-------------|----------------|----------------|
| 80 lots | 100 lots | fill 80, cancel 20 | **cancel all** (0 filled) |
| 120 lots | 100 lots | fill 100 | fill 100 |

IOC takes what it can get; FOK is all-or-nothing.

> 📎 **In the codebase:** `submit_order()` routes by `order_type` to `_match_limit`,
> `_match_market`, `_match_ioc`, or `_match_fok`. FOK's pre-check is `_calculate_available()`
> — a dry run that sums fillable quantity *without mutating the book*. Read those four
> methods; they're short and map one-to-one to the rules above.

---

## 3. Partial fills — where naive engines break

### 3.1 The fill price is the *resting* order's price

This is the rule beginners get wrong most often.

```python
book = OrderBook()
book.submit_order(Order("S1", "sell", "limit", 50.00, 100))    # seller asks 50.00
fills, _ = book.submit_order(Order("B1", "buy", "limit", 51.00, 50))  # buyer will pay up to 51
print(fills[0].price)   # 50.00   -> NOT 51.00
```

The buyer was *willing* to pay 51, but they trade at the seller's **50.00**. The 1.00
difference is **price improvement** that goes to the aggressor. Mechanically: the passive
(resting) order sets the price. Charge the aggressor's price and you've built a broken,
unfair engine — and handed every contestant free money.

### 3.2 Sweeping multiple price levels

```python
book = OrderBook()
book.submit_order(Order("S1", "sell", "limit", 50.00, 30))
book.submit_order(Order("S2", "sell", "limit", 50.25, 40))
fills, b1 = book.submit_order(Order("B1", "buy", "limit", 50.50, 60))

for f in fills:
    print(f.sell_order_id, f.quantity, "@", f.price)
# S1 30 @ 50.0     -> took all of S1
# S2 30 @ 50.25    -> took 30 of S2's 40
print(book.get_best_ask())   # 50.25  -> S2 still rests with 10 lots
```

What a naive engine gets wrong here:
- Fills all 60 at the best price 50.00 (wrong — each level fills at *its own* price).
- Removes S2 entirely even though 10 lots remain (wrong — partial fill, S2 stays).

---

## 4. The order state machine

Every order lives a life through a small set of states. Getting the transitions right is
**L2 validation** in UORA (Module 07).

```
                         ┌──────────────┐
                         │   pending    │   (accepted; resting or about to match)
                         └──────┬───────┘
                ┌───────────────┼────────────────┐
                ▼               ▼                ▼
        ┌──────────────┐  ┌───────────┐   ┌──────────┐
        │ partial_fill │  │ cancelled │   │  filled  │
        │ (some qty;   │  │ (cancel,  │   │ (all qty │
        │  rest rests) │  │  IOC/FOK) │   │ matched) │
        └──────┬───────┘  └───────────┘   └──────────┘
               │  (remaining qty matches)
               ▼
          ┌──────────┐
          │  filled  │
          └──────────┘
```

**Legal transitions:**
```
pending      → partial_fill   (first partial match)
pending      → filled         (fully matched at once)
pending      → cancelled      (cancel request; IOC/FOK leftover; market with no fill)
partial_fill → filled         (remaining quantity matches later)
partial_fill → cancelled      (cancelled while partially filled)
```

**Illegal transitions — your validator must reject these:**
```
filled    → cancelled      "zombie cancel": the order is already done
filled    → filled         "double fill": same order matched twice
cancelled → filled         "ghost fill": filling a dead order
cancelled → partial_fill   same problem
```

> ⚠️ **Note on the reference engine's vocabulary:** statuses are lowercase strings —
> `"pending"`, `"partial_fill"`, `"filled"`, `"cancelled"`. The validator also treats a
> contestant's `"accepted"` as equivalent to `"pending"` (a public-API alias). You'll see
> exactly that in `_normalize_status()` in `diff_engine.py`. Mismatched status vocabulary is
> a real source of false positives — Module 07 covers it.

---

## 5. Self-trade prevention (STP)

A **self-trade** (or *wash trade*) is when the same participant ends up on **both** sides of
a trade. In real markets this is illegal — it can be used to fake volume and manipulate
prices. So engines prevent it.

The reference engine uses the most common mode: **cancel the aggressor**. If the incoming
order would match against a resting order from the *same* `participant_id`, the incoming
(aggressing) order is cancelled instead of trading.

```python
book = OrderBook()
# Same participant "firm_A" on both sides:
book.submit_order(Order("S1", "sell", "limit", 100.0, 50, participant_id="firm_A"))
fills, b1 = book.submit_order(Order("B1", "buy", "limit", 100.0, 50, participant_id="firm_A"))

print(fills)                 # []          -> self-trade prevented
print(b1.status)             # cancelled   -> aggressor cancelled by STP
print(book.get_best_ask())   # 100.0       -> resting S1 untouched
```

> 📎 **In the codebase:** the check is two lines at the top of `_match_against_queue()`:
> `if aggressor.participant_id == resting.participant_id: aggressor.status = "cancelled";
> return fills`. Note that `Order` defaults `participant_id` to the order's own `id` when you
> don't pass one — so two *different* orders only self-trade if you give them the *same*
> `participant_id`. (This default once hid an infinite-loop bug; the file header notes the
> "STP fix.")

> ⚠️ **Real-world caveat:** real venues offer several STP modes — cancel-aggressor,
> cancel-resting, cancel-both, or decrement-and-cancel. For UORA, cancel-aggressor is the
> reference behavior; in the anomaly detector (Module 08) an unusually high self-trade rate
> can itself be a signal that someone is gaming the benchmark.

---

## 6. Five test cases that break naive engines

These mirror the real tests in `reference_lob.py`. Run them; they all pass against the
reference engine, which is the point — *your mental model should match the code.*

```python
from uora.validator.reference_lob import OrderBook, Order

def test_ioc_partial_then_cancel():
    book = OrderBook()
    book.submit_order(Order("S1", "sell", "limit", 100.0, 3))
    fills, ioc = book.submit_order(Order("B1", "buy", "ioc", 100.0, 5))
    assert len(fills) == 1 and fills[0].quantity == 3   # filled what existed
    assert ioc.status == "cancelled" and ioc.remaining_qty == 2
    assert "B1" not in book.orders                      # IOC never rests

def test_fok_full_kill():
    book = OrderBook()
    book.submit_order(Order("S1", "sell", "limit", 100.0, 3))
    fills, fok = book.submit_order(Order("B1", "buy", "fok", 100.0, 5))
    assert fills == []                                  # zero fills
    assert fok.status == "cancelled"
    assert "S1" in book.orders                          # resting order untouched

def test_fill_price_is_resting_price():
    book = OrderBook()
    book.submit_order(Order("S1", "sell", "limit", 50.00, 100))
    fills, _ = book.submit_order(Order("B1", "buy", "limit", 51.00, 50))
    assert fills[0].price == 50.00                      # NOT the aggressor's 51.00

def test_zombie_cancel_is_rejected():
    book = OrderBook()
    book.submit_order(Order("S1", "sell", "limit", 100.0, 50))
    book.submit_order(Order("B1", "buy",  "limit", 100.0, 50))   # fully fills S1
    ok, order = book.cancel_order("S1")                 # try to cancel a filled order
    assert ok is False and order is None                # rejected cleanly, no crash
    assert book.get_best_ask() is None                  # book is empty

def test_self_trade_prevention():
    book = OrderBook()
    book.submit_order(Order("S1", "sell", "limit", 100.0, 50, participant_id="firm_A"))
    fills, b1 = book.submit_order(Order("B1", "buy", "limit", 100.0, 50, participant_id="firm_A"))
    assert fills == [] and b1.status == "cancelled"     # STP cancelled aggressor
    assert book.orders["S1"].remaining_qty == 50        # resting order untouched
```

---

## 7. Summary cheatsheet

| Order Type | Price limit? | Rests? | Partial fill? | Pre-checks book? |
|------------|:-----------:|:------:|:-------------:|:----------------:|
| Limit | ✅ | ✅ | ✅ | ❌ |
| Market | ❌ | ❌ | ✅ | ❌ |
| IOC | ✅ | ❌ | ✅ | ❌ |
| FOK | ✅ | ❌ | ❌ (all-or-nothing) | ✅ |

**The three rules to never forget:**
1. Fill price = the **resting** order's price.
2. At one price level, **oldest fills first** (FIFO / time priority).
3. **Market/IOC/FOK never rest**; only Limit can leave quantity in the book.

---

## 8. Exercises

1. **IOC across levels.** Post sells 60@49.50 and 30@49.80. Send an IOC buy of 100 @ 50.00.
   How many filled, at what prices, and what's the final status? Predict, then run.
2. **FOK just barely fills.** Post sells totalling exactly 100 lots across two prices. Send
   FOK buy 100. Does it fill? Now send FOK buy 101 against the same book — what happens?
3. **STP with default ids.** Repeat the self-trade test but *don't* pass `participant_id`.
   Why does it now trade? (Hint: §5 note about the default.)
4. **State machine.** Write down, for a limit order that fills in two steps, the exact
   sequence of statuses it passes through. Confirm with `submit_order`'s returned order.
5. **Stretch.** The reference FOK does a dry-run `_calculate_available()` before matching.
   Why can't IOC use the same shortcut and skip straight to "fill what's available"?

---

## 9. 📚 Resources

- **Larry Harris, *Trading and Exchanges*** — the chapters on order types and order
  precedence rules. The definitive treatment; worth owning.
- **CME Group / Nasdaq education pages** — exchanges publish free, authoritative docs on
  order types (search "CME order types" / "Nasdaq order types specification").
- **"Price-Time Priority" and "Pro-Rata Matching"** (Investopedia / exchange docs) — most
  equities use price-time; many futures use *pro-rata*. Knowing both is intermediate-level.
- **QuantStart, "Matching Engine" articles** — code-first walkthroughs that complement this.

---

## What's next

You now know the rules an engine must follow. Module 03 zooms into the **order lifecycle** as
a formal state machine — the foundation of UORA's L2 correctness checks — and shows how
`diff_engine.py` compares a contestant's state transitions against the reference.

**→ [Module 03 — Order Lifecycle & State Machines](module-03-order-lifecycle.md)**
