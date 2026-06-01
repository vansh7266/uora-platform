# Module 03 — Order Lifecycle & State Machines

> **Prerequisite:** [Module 02](module-02-matching-engine.md) (order types, the four states).
> **Goal:** Treat an order as a formal *state machine*, know which transitions are legal,
> and see exactly how UORA's **L2 correctness check** uses this to catch broken engines.
> **Time:** ~40 minutes + running the examples.

---

## 1. Why an order is a state machine

Every order is born, lives, and dies. Along the way it occupies exactly one **state** at a
time, and it can only move between states along certain **legal paths**. That is the precise
definition of a *finite state machine* (FSM) — the same idea behind traffic lights, vending
machines, and TCP connections.

Why should you care? Because a huge class of engine bugs and cheats show up as **illegal
state transitions**: an order that gets "filled twice," a "cancel" of an order that already
completed, a fill on an order that was already cancelled. If you model the lifecycle as an
FSM, these bugs become *impossible to miss* — they're literally edges that shouldn't exist.

This is the foundation of UORA's **Level 2 (L2) validation** in
[`uora/validator/diff_engine.py`](../../uora/validator/diff_engine.py).

---

## 2. The four states

From Module 02, recall the reference engine's status vocabulary (lowercase strings):

| State | Meaning | Terminal? |
|-------|---------|:---------:|
| `pending` | Accepted; resting in the book or about to match | No |
| `partial_fill` | Some quantity filled, the rest still working | No |
| `filled` | Entire quantity matched | **Yes** |
| `cancelled` | Killed (cancel request, IOC/FOK leftover, market with no fill) | **Yes** |

A **terminal** (or *absorbing*) state is one you can never leave. `filled` and `cancelled`
are the end of the story — once an order reaches them, nothing further can happen to it. This
single property is what makes "zombie cancels" and "ghost fills" detectable.

---

## 3. The legal transition graph

```
                        ┌──────────────┐
              start ──▶ │   pending    │
                        └──────┬───────┘
                ┌──────────────┼───────────────┐
                ▼              ▼               ▼
        ┌──────────────┐ ┌───────────┐  ┌──────────┐
        │ partial_fill │ │  filled   │  │cancelled │
        └──────┬───┬───┘ │(terminal) │  │(terminal)│
               │   │     └───────────┘  └──────────┘
               │   └──────────────┐
               ▼                  ▼
          ┌──────────┐      ┌───────────┐
          │  filled  │      │ cancelled │
          │(terminal)│      │(terminal) │
          └──────────┘      └───────────┘
```

**Legal transitions** (the only edges that may exist):

```
pending      → partial_fill | filled | cancelled
partial_fill → filled       | cancelled
filled       → ∅   (terminal — no outgoing edges)
cancelled    → ∅   (terminal — no outgoing edges)
```

**Illegal transitions** — a correct engine *never* produces these, so if a contestant's
engine does, it's broken or cheating:

| Illegal edge | Nickname | What it means |
|--------------|----------|---------------|
| `filled → cancelled` | zombie cancel | cancelling an order that already completed |
| `filled → filled` | double fill | the same order matched twice (phantom liquidity) |
| `cancelled → filled` | ghost fill | a dead order trading |
| `cancelled → partial_fill` | resurrection | a cancelled order coming back to life |

---

## 4. ▶ Runnable: drive an order through its life

```python
from uora.validator.reference_lob import OrderBook, Order
book = OrderBook()

# pending — a seller posts 4 lots and rests (no buyer yet)
fills, s1 = book.submit_order(Order("S1", "sell", "limit", 100.0, 4))
print(s1.status)                       # pending

# partial_fill — a buyer wants 10 but only 4 exist: fills 4, the other 6 rest
fills, b1 = book.submit_order(Order("B1", "buy", "limit", 100.0, 10))
print(b1.status, b1.filled_qty, b1.remaining_qty)   # partial_fill 4 6

# filled — a new seller arrives and fills B1's remaining 6
fills, s2 = book.submit_order(Order("S2", "sell", "limit", 100.0, 6))
print(b1.status, b1.remaining_qty)     # filled 0
print("B1" in book.orders)             # False  -> fully filled orders leave the book
```

You just watched one order travel `pending → partial_fill → filled` — two legal edges, ending
in a terminal state. That's a healthy lifecycle.

> ⚠️ **Honest engine quirk (worth knowing).** In this reference engine, an order's `status`
> is set from *its own* submission. A **resting** order that is later *partially* consumed by
> incoming aggressors keeps `status = "pending"` (with `filled_qty > 0`) until it's fully
> filled — it is not relabeled `partial_fill`. Real production venues emit an explicit
> partial-fill execution report for the resting side too. UORA sidesteps this by validating
> the **response to each submitted action** against the reference, rather than tracking every
> resting order's status over time. Knowing where a model simplifies reality is the mark of
> someone who actually understands it.

---

## 5. How UORA enforces it (L2 validation)

UORA doesn't hand-code the illegal-edge table. It does something simpler and more robust: it
runs the **same actions** through the trusted reference engine, then checks that the
contestant's reported status for each action **matches the reference's**. Because the
reference only ever produces *legal* transitions, matching it is equivalent to obeying the
FSM — with no edge table to get wrong.

```python
# uora/validator/diff_engine.py  — the heart of the L2 check (paraphrased)
contestant_status = contestant_resp.get("status", "unknown")
reference_status  = ref_state.get("status", "unknown")

if _normalize_status(contestant_status) != _normalize_status(reference_status):
    # → record a Level-2 "Order state mismatch" violation
    ...
```

### The `accepted` alias — a real source of false positives

Public trading APIs often reply `"accepted"` when an order is received and resting, whereas
the internal engine calls that same state `"pending"`. If your validator treated those as
different, it would flag **correct** engines. UORA normalizes them:

```python
def _normalize_status(status: str) -> str:
    return "pending" if status == "accepted" else status
```

> 📎 **In the codebase:** both snippets live in `diff_engine.py`
> (`_normalize_status` and `_validate_order_response`). This is a great example of a
> *domain-knowledge* detail that only shows up once you've talked to people who run real
> exchanges. We'll meet more of these in Module 07.

---

## 6. ▶ Runnable: watch the validator catch a lie

Let's give the validator a contestant that fills an order correctly but **mislabels its
state** — claims `pending` when the order is actually `filled`:

```python
from uora.validator.diff_engine import CorrectnessValidator

actions = [
    {"type": "limit", "side": "sell", "price": 100.0, "qty": 10, "order_id": "S1"},
    {"type": "limit", "side": "buy",  "price": 100.0, "qty": 10, "order_id": "B1"},  # fills S1
]
contestant = [
    {"status": "pending", "fills": []},                                   # S1 — correct
    {"status": "pending", "fills": [{"price": 100.0, "quantity": 10}]},   # B1 — WRONG status
]

report = CorrectnessValidator().validate_submission(actions, contestant)
print(report["correctness_rate"])     # 0.5
print(report["violations_by_level"])  # {1: 0, 2: 1, 3: 0, 4: 0}
for v in report["violations"]:
    print(f"L{v['level']} {v['order_id']}: {v['description']}")
# L2 B1: Order state mismatch: expected filled, got pending
```

Notice: the **fills were correct** (so L1 passes — same price, same quantity), but the
**state was wrong** (so L2 fires). The two levels catch genuinely different failure modes,
which is why UORA separates them. `correctness_rate = 1 − violations/actions = 1 − 1/2 = 0.5`
— a number that flows all the way into the leaderboard score (Module 09).

---

## 7. 🧮 The math/CS: FSMs and idempotency

**Formally**, an order lifecycle is a deterministic finite automaton
`M = (Q, Σ, δ, q₀, F)`:

- `Q` = states = `{pending, partial_fill, filled, cancelled}`
- `Σ` = inputs = events like *match*, *cancel*, *expire*
- `δ` = the transition function (the legal edges above)
- `q₀` = start = `pending`
- `F` = accepting/terminal states = `{filled, cancelled}`

The key structural fact: `filled` and `cancelled` have **no outgoing edges** (`δ` is
undefined on them). Any event arriving at a terminal state must be **rejected**, not acted
on.

**Idempotency.** A correct `cancel_order` must be *idempotent on terminal orders*: cancelling
an already-finished order must be a safe no-op that changes nothing.

```python
book = OrderBook()
book.submit_order(Order("S1", "sell", "limit", 100.0, 50))
book.submit_order(Order("B1", "buy",  "limit", 100.0, 50))   # fully fills S1
ok, order = book.cancel_order("S1")     # S1 is already terminal (filled, removed)
print(ok, order)                        # False None  -> safe rejection, no corruption
```

A buggy engine might raise, double-count, or "resurrect" S1 here. The reference returns
`(False, None)` and leaves the book untouched. That defensive behavior *is* the lesson.

---

## 8. Real-world caveats

Real venues have a richer state set than our four. You don't need to implement them, but an
intermediate quant knows they exist:

- `rejected` — the order failed validation on arrival (bad price, risk limit) and never
  entered the book.
- `expired` — a day order that reached end-of-session unfilled.
- `suspended` / `halted` — trading paused (news, circuit breaker); orders freeze.
- `replaced` / `amended` — a *modify* request changes price or size. Many venues implement
  modify as cancel-old + new-order, which can **lose time priority** (you go to the back of
  the queue). That queue-position consequence is a famous microstructure subtlety.

---

## 9. Common mistakes

1. **Acting on a terminal order.** Allowing `filled → cancelled` or `cancelled → filled`.
2. **Status-vocabulary drift.** Returning `"ACCEPTED"`, `"NEW"`, or `"open"` and not mapping
   it to the reference's `"pending"` — instant false-positive flood. (See `_normalize_status`.)
3. **Treating modify as free.** Amending price/size without re-queuing, silently keeping time
   priority you no longer deserve.
4. **Losing idempotency.** A double-cancel or double-fill that corrupts book state.

---

## 10. Exercises

1. **Trace it.** For a FOK buy that cannot fully fill, write the exact state sequence the
   order goes through. (Hint: one transition, into a terminal state.)
2. **Make the validator fire L2.** Modify the §6 contestant so S1 (not B1) has the wrong
   status. Predict the `correctness_rate` and the violation text, then run it.
3. **Idempotency.** After fully filling and removing S1, call `cancel_order("S1")` twice.
   What does each call return? Why is that the *correct* behavior?
4. **Stretch.** The reference checks state by *matching the reference*, not by validating
   edges against a transition table. Give one scenario where a transition-table approach
   would be *better*, and one where exact-match is better. (Think: what if there's no trusted
   reference?)

---

## 11. 📚 Resources

- **"Finite-state machine"** (Wikipedia) — the CS foundation; read the DFA section.
- **Larry Harris, *Trading and Exchanges*** — order handling, modifies, and time-priority
  consequences of amendments.
- **FIX Protocol `OrdStatus` (tag 39)** — the *real* industry order-status enum (New,
  PartiallyFilled, Filled, Canceled, Replaced, Rejected, Expired…). Skim the FIX spec; it's
  exactly this FSM, standardized across the industry. (UORA's bot can speak FIX — see
  `bot_fleet/fix_adapter.py`.)

---

## What's next

You can now reason about an order's whole life and see how UORA judges it. But every benchmark
needs *input* — a realistic stream of orders to replay. Where does that come from, and what
does real market data actually look like?

**→ [Module 04 — Market Data & LOBSTER](module-04-market-data.md)**
