# Module 07 — Correctness & Determinism

> **Prerequisite:** [Module 02](module-02-matching-engine.md) (matching rules),
> [Module 03](module-03-order-lifecycle.md) (state machine), [Module 06](module-06-the-math.md)
> (sequence distance).
> **Goal:** Understand how UORA decides whether a contestant's engine is **correct** — the
> L1–L4 validation ladder in `diff_engine.py` — and why **determinism** is non-negotiable in
> trading.
> **Time:** ~50 minutes + running the examples.

---

## 1. The hardest question UORA answers

Speed is easy to measure (Module 05). The hard question is: **is this engine actually
right?** A fast engine that fills orders at the wrong price, or loses orders, or behaves
randomly, is worse than useless — it's dangerous. Correctness is the gate; speed only matters
*after* you're correct.

How do you check correctness when you don't know what the "right" answer is in advance?

---

## 2. The big idea: differential testing

UORA uses a classic, powerful technique called **differential testing** (or "diff testing"):

> Run the **same input** through a **trusted reference** implementation and the **untrusted**
> one. Wherever their outputs differ, the untrusted one is (probably) wrong.

UORA's trusted reference is the `OrderBook` you met in Modules 01–02 — small, readable, and
covered by tests. For each benchmark it:

1. Replays the action stream through the **reference** engine → the "correct" answers.
2. Compares the **contestant's** responses against those answers, action by action.
3. Counts the disagreements as **violations**, grouped into four levels.

You don't need an oracle that knows the answer a priori — you *build* the oracle (the
reference) and diff against it. This is the same idea behind testing a new compiler against
gcc, or a new database against SQLite.

> 📎 **In the codebase:** `CorrectnessValidator.validate_submission(actions,
> contestant_responses)` in `uora/validator/diff_engine.py` is the whole loop. It replays
> `actions` through `self.reference_book`, then calls `_validate_action` on each pair.

---

## 3. The validation ladder: L1 → L4

UORA grades correctness at four levels, from "did the trade happen right" up to "is the engine
deterministic." Each catches a different *class* of bug.

### L1 — Fill correctness (price-time priority)

Did the engine produce the **right trades**? L1 checks, for each order: same **number** of
fills, same **price** on each fill, same **quantity** on each fill. A mismatch here usually
means a price-time-priority violation (Module 01) — the engine matched the wrong resting
order, or at the wrong price.

```python
from uora.validator.diff_engine import CorrectnessValidator

actions = [
    {"type": "limit", "side": "sell", "price": 100.0, "qty": 10, "order_id": "S1"},
    {"type": "limit", "side": "buy",  "price": 100.0, "qty": 5,  "order_id": "B1"},  # ref: fill 5
]
contestant = [
    {"status": "pending", "fills": []},                                  # S1 — correct
    {"status": "filled",  "fills": [{"price": 100.0, "quantity": 3}]},   # B1 — WRONG qty (3≠5)
]

rep = CorrectnessValidator().validate_submission(actions, contestant)
print(rep["correctness_rate"])     # 0.5
print(rep["violations_by_level"])  # {1: 1, 2: 0, 3: 0, 4: 0}
print(rep["violations"][0]["description"])   # Fill quantity mismatch
```

Note prices are compared with a **tolerance** (`abs(cf - rf) > 0.001`), not `==`, to dodge
floating-point error — exactly the tick-size concern from Module 01.

### L2 — Order state machine

Did each order end in the **right state**? This is the FSM check from
[Module 03](module-03-order-lifecycle.md): compare the contestant's `status` to the
reference's, after normalizing the `accepted`→`pending` alias. A "filled" order the contestant
calls "pending" is an L2 violation.

### L3 — Market invariants

Does the final book obey the **laws of markets**? The headline invariant: **best bid < best
ask** (a non-crossed book — Module 01 §3). If `bid ≥ ask`, two orders that should have traded
are both still resting — a broken engine.

```python
# uora/validator/diff_engine.py  (paraphrased)
best_bid = state["bids"][0]["price"] if state["bids"] else None
best_ask = state["asks"][0]["price"] if state["asks"] else None
if best_bid and best_ask and float(best_bid) >= float(best_ask):
    # → Level-3 violation: "bid-ask spread non-negative"
```

> ⚠️ **Honest limitation (a real finding, and a Phase-2 fix).** As written, `_check_market_
> invariants()` inspects the **reference** book's final state — and the reference is correct
> by construction, so it essentially never fires. To genuinely catch a contestant who crosses
> their book, UORA should reconstruct the **contestant's** book from their responses and check
> *that*. I'm flagging this as a hardening task rather than pretending it works. (A platform
> author who knows exactly where their checks are weak is more trustworthy, not less.)

### L4 — Deterministic replay

Run the **same** input twice; do you get the **same** output? A trading engine **must** be
deterministic (§5). L4 compares the reference's state graph to the contestant's using the
normalized sequence/graph similarity from [Module 06](module-06-the-math.md):

```python
similarity = _ged_normalized(ref_graph, contestant_graph)   # 1.0 = identical, <1.0 = diverged
if similarity < 1.0:
    # → Level-4 violation: "state machine diverges from reference"
```

> ⚠️ **Honest limitation:** the state graph only forms edges between responses that share an
> `order_id`. If a contestant's responses omit `order_id`, the graph has *no edges* and the
> similarity degenerates to `1.0` (a false pass). Robust L4 requires stable order ids in the
> response contract. Another Phase-2 hardening note.

---

## 4. The score that comes out: `correctness_rate`

All four levels feed one number:

```
correctness_rate = 1 − (total_violations / number_of_actions)
```

In the L1 example above: 1 violation over 2 actions → **0.5**. This rate flows straight into
the composite score (Module 09) as a **multiplier** — so correctness doesn't just *subtract*
points, it *scales* your whole score. An engine that's 50% correct has its throughput-and-
latency score **halved**. Correctness is the gate, mathematically.

---

## 5. 🧮 Why determinism is sacred in trading

**Determinism** means: *same inputs → byte-for-byte same outputs, every time.* In most
software this is "nice to have." In trading and in UORA it is **mandatory**, for four reasons:

1. **Replay & audit.** Regulators and risk teams must replay a trading day and get *exactly*
   what happened. A non-deterministic engine can't be audited.
2. **Fair benchmarking.** UORA must be able to re-run a contestant and get the same score. If
   the engine is random, the leaderboard is noise.
3. **Debugging.** You can only fix a bug you can reproduce. Heisenbugs that vanish on replay
   are a nightmare in a system handling real money.
4. **Trust.** A non-deterministic matching engine could be *hiding* behavior that only appears
   sometimes — a backdoor that fills a favored account 1 time in 1000.

### Where non-determinism sneaks in (and how the reference avoids it)

| Source | The trap | UORA's reference avoids it by… |
|--------|----------|-------------------------------|
| **Wall-clock time** | Using `time.time()` as a tiebreaker → different every run | Using a **logical counter** `event_sequence` for fill timestamps (`_next_event_timestamp`) |
| **Hash/set ordering** | Iterating a `set` or pre-3.7 `dict` in arbitrary order | Ordered `dict` + `deque` per price level (FIFO) |
| **Floating point** | `==` on floats; reordered float sums | Compares prices with a `0.001` tolerance |
| **Threads** | Race conditions reorder fills | The reference is single-threaded and synchronous |
| **RNG** | Unseeded randomness | No randomness in matching; the ML detector seeds its RNG (`RANDOM_STATE=42`) |

That logical-clock detail is the key: because fill timestamps come from a deterministic
counter, the **same stream always produces identical fills and snapshots** — which you proved
in Module 01 (`test_deterministic_replay_timestamps`) and can re-prove now:

```python
from uora.validator.reference_lob import OrderBook, Order
def run():
    b = OrderBook(); b.submit_order(Order("S1", "sell", "limit", 100.0, 5))
    fills, _ = b.submit_order(Order("B1", "buy", "limit", 100.0, 5))
    return [f.__dict__ for f in fills], b.get_orderbook_state()

a1, s1 = run(); a2, s2 = run()
print(a1 == a2, s1 == s2)   # True True  -> bit-for-bit reproducible
```

---

## 6. Common mistakes

1. **Trusting a buggy reference.** Differential testing is only as good as the oracle. UORA's
   reference is unit-tested precisely so it can *be* the oracle.
2. **Comparing floats with `==`.** Use a tolerance (UORA uses `0.001`).
3. **Hidden non-determinism.** Iterating sets, unseeded RNG, wall-clock tiebreakers.
4. **Treating all violations equally.** A single L1 fill error and a single L4 divergence both
   cost `1/n` here — arguably L1 should weigh more. (A reasonable scoring refinement.)

---

## 7. Exercises

1. **Trigger each level.** Craft contestant responses that produce exactly one L1 violation,
   then exactly one L2 violation. Predict `correctness_rate` for each; verify.
2. **Fill-count vs fill-qty.** Make B1 report *two* fills instead of one. Which L1 message do
   you get now ("Fill count mismatch")? How does it differ from the quantity mismatch?
3. **Prove determinism.** Extend the §5 `run()` with a cancel and a partial fill. Confirm two
   runs still match exactly.
4. **Break determinism (thought experiment).** If the reference used `time.time()` for fill
   timestamps instead of a counter, exactly which assertion in the replay test would fail, and
   why?
5. **Stretch / Phase-2.** Sketch how you'd fix the L3 limitation: reconstruct the *contestant's*
   book from their responses and check `best_bid < best_ask` on *that*. What data would you
   need in each response?

---

## 8. 📚 Resources

- **Differential testing** — search "differential testing csmith" (the famous C-compiler
  fuzzer). The clearest illustration of UORA's core technique.
- **Property-based testing — *Hypothesis* (Python)** — generate thousands of random action
  streams and assert invariants (bid < ask, conservation). A natural next step for UORA's
  validator.
- **Deterministic simulation testing** — talks/blogs from **FoundationDB** and **TigerBeetle**
  on building bit-for-bit deterministic systems. Gold-standard material on §5.
- **Jepsen** (jepsen.io) — Kyle Kingsbury's work on testing distributed-system correctness.
  Inspiring rigor.
- **Larry Harris, *Trading and Exchanges*** — for the market invariants behind L3.

---

## What's next

You can now tell whether an engine is correct. But some failures are subtler than a wrong fill
— an engine that *cheats* by hardcoding answers, or one that's silently degrading. Catching
those needs machine learning. Module 08 builds UORA's Isolation-Forest anomaly detector.

**→ [Module 08 — Anomaly Detection & ML](module-08-anomaly-detection.md)**
