# Module 01 — Markets & the Limit Order Book

> **Prerequisite:** none. This is where you start.
> **Goal:** Understand how a modern exchange organizes buyers and sellers, and read the
> real order book that lives in `uora/validator/reference_lob.py`.
> **Time:** ~45 minutes reading + 15 minutes running code.

---

## 1. The problem every market has to solve

Imagine a room full of people. Some want to **buy** apples, some want to **sell** apples.
Everyone has a different idea of a fair price. How do you get the right buyer matched with
the right seller, fairly, thousands of times per second, with nobody able to cheat?

That matching machine is called an **exchange**, and the data structure at its heart is the
**Limit Order Book** (LOB). Every stock exchange (NYSE, NASDAQ), every crypto exchange
(Coinbase, Binance), and every futures market runs some version of this. If you understand
the LOB, you understand the skeleton of all modern trading.

UORA is a platform that **benchmarks** people's matching engines. So before you can judge
an engine, you must understand the thing it's supposed to be: a correct order book. That's
this module.

---

## 2. The two kinds of orders: bids and asks

There are exactly two things you can want:

- **Bid** = an order to **BUY**. "I'll buy 10 units at $100 or cheaper."
- **Ask** (also called **offer**) = an order to **SELL**. "I'll sell 10 units at $101 or higher."

> **Memory hook:** you *bid* at an auction to buy. Sellers *ask* for a price.

Each order carries: a **side** (buy/sell), a **price**, and a **quantity** (how many units,
often called *lots* or *size*).

The book keeps all the **bids** on one side and all the **asks** on the other, sorted by price:

```
            THE ORDER BOOK (for one asset)

   ASKS (sellers)                    ← lowest ask is the "best ask"
   ┌──────────┬──────────┐
   │  PRICE   │   SIZE   │
   ├──────────┼──────────┤
   │  101.00  │    40    │
   │  100.75  │    25    │
   │  100.50  │    15    │   ← best ask = 100.50  (cheapest place to BUY)
   ├──────────┴──────────┤
   │   ~~~ THE SPREAD ~~~ │   ← the gap between best bid and best ask
   ├──────────┬──────────┤
   │  100.00  │    30    │   ← best bid = 100.00  (highest price someone will pay)
   │   99.75  │    50    │
   │   99.50  │   210    │
   └──────────┴──────────┘
   BIDS (buyers)                     ← highest bid is the "best bid"
```

Two numbers describe the "top of book":

- **Best bid** = the *highest* price a buyer is currently willing to pay (here, 100.00).
- **Best ask** = the *lowest* price a seller is currently willing to accept (here, 100.50).

> 📎 **In the codebase:** these are exactly `get_best_bid()` and `get_best_ask()` in
> [`reference_lob.py`](../../uora/validator/reference_lob.py). Best bid is `max(self.bids)`,
> best ask is `min(self.asks)`. Read those two methods now — they're three lines each and
> they'll make this concrete.

---

## 3. Three numbers you must know

From the best bid and best ask, we derive the three quantities every trader watches:

| Term | Formula | In the picture | Meaning |
|------|---------|----------------|---------|
| **Spread** | `best_ask − best_bid` | `100.50 − 100.00 = 0.50` | The "cost of immediacy." Tight spread = liquid, healthy market. |
| **Mid-price** | `(best_ask + best_bid) / 2` | `(100.50 + 100.00)/2 = 100.25` | The fairest single estimate of the asset's value *right now*. |
| **Depth** | sum of size at each level | bids: 30+50+210 = 290 | How much you can trade before the price moves against you. |

**Why these matter for UORA:** a *correct* engine must always keep `best_bid < best_ask`.
If a buyer is willing to pay more than a seller is asking, they should have **already
traded** — they wouldn't both still be sitting in the book. A book where `best_bid ≥
best_ask` is "locked" or "crossed" and signals a broken engine. UORA's validator checks
exactly this (it's **L3 — market invariants**, which you'll meet in Module 07).

---

## 4. The one rule that runs the world: price-time priority

When a new order arrives that *could* trade, in what order do we match it against the
resting orders? Every fair exchange uses **price-time priority**:

1. **Price first.** The best price wins. A buyer always matches against the *cheapest*
   available seller first. A seller always matches against the *most expensive* buyer first.
2. **Time second.** Among orders at the *same* price, the one that arrived *earliest* wins.
   First come, first served. This is a **FIFO queue** (First In, First Out) at each price level.

That's it. That single rule — *better price beats worse price; at the same price, earlier
beats later* — is the moral and mechanical core of an exchange. It's what makes the market
fair: you can't jump the queue except by offering a genuinely better price.

### A worked example

The sell side has two resting orders, both at **100.00**:

```
ASKS @ 100.00:   [ S1: 5 lots (arrived first) ] → [ S2: 5 lots (arrived second) ]
```

A buyer sends: **BUY 5 lots @ 100.00**.

- Price check: best ask is 100.00, buyer will pay 100.00. They cross → **match**.
- Time check: at 100.00, **S1 arrived first**, so the buyer fills against **S1**, not S2.

Result: one fill of 5 lots between the buyer and **S1**. S1 is now gone; S2 still rests.

> 📎 **In the codebase:** this exact scenario is `test_price_time_priority()` in
> `reference_lob.py`. The FIFO behavior comes from using a `collections.deque` per price
> level and always matching `queue[0]` (the oldest). Look at `_match_against_queue()` —
> `resting = queue[0]` is the whole idea in one line.

---

## 5. Meet the real code

UORA's reference book is small and readable. Here are the two types you'll use constantly.
*(This is the actual API — earlier drafts of this handbook used method names that don't
exist in the repo. Everything below is verified against the real file.)*

```python
# uora/validator/reference_lob.py  (paraphrased signatures)

@dataclass
class Order:
    id: str                  # unique order id, e.g. "B1"
    side: str                # "buy" or "sell"
    order_type: str          # "limit", "market", "ioc", "fok"
    price: float | None      # None for market orders
    quantity: int            # total size requested
    participant_id: str = "" # who sent it (defaults to id) — used for self-trade prevention
    filled_qty: int = 0      # how much has filled so far
    status: str = "pending"  # "pending" | "partial_fill" | "filled" | "cancelled"

    @property
    def remaining_qty(self) -> int:
        return self.quantity - self.filled_qty


class OrderBook:
    def submit_order(self, order: Order) -> tuple[list[Fill], Order]: ...
    def cancel_order(self, order_id: str) -> tuple[bool, Order | None]: ...
    def get_orderbook_state(self, depth: int = 10) -> dict: ...
    def get_best_bid(self) -> float | None: ...
    def get_best_ask(self) -> float | None: ...
```

Two design choices worth noting now (we'll go deeper in §8):

- A book is **two dictionaries**: `self.bids` and `self.asks`, each mapping
  `price → deque[Order]`. The deque gives us FIFO time priority for free.
- `submit_order` returns **both** the list of fills it generated *and* the updated order
  (so you can see its final `status` and `remaining_qty`).

---

## 6. ▶ Runnable: build a book with your own hands

Open a terminal in the project root and run `python3` (or `ipython`). Type this in:

```python
from uora.validator.reference_lob import OrderBook, Order

book = OrderBook()

# 1) A seller posts 10 lots at 101.00. Nobody to trade with yet → it rests.
fills, s1 = book.submit_order(Order("S1", "sell", "limit", 101.00, 10))
print(fills)             # []  -> no trade happened
print(s1.status)         # "pending"
print(book.get_best_ask())  # 101.0
print(book.get_best_bid())  # None  -> no buyers yet

# 2) A buyer crosses the spread: wants 8 lots and will pay up to 101.00.
fills, b1 = book.submit_order(Order("B1", "buy", "limit", 101.00, 8))
print(len(fills))        # 1   -> one trade
print(fills[0].price)    # 101.0  -> fill happens at the RESTING order's price
print(fills[0].quantity) # 8
print(b1.status)         # "filled"   -> buyer got everything they wanted
print(s1.remaining_qty)  # 2          -> seller has 2 lots left, still resting
print(book.get_best_ask())  # 101.0   -> the remaining 2 lots
```

Now prove price-time priority to yourself:

```python
book = OrderBook()
book.submit_order(Order("S1", "sell", "limit", 100.00, 5))  # arrives FIRST
book.submit_order(Order("S2", "sell", "limit", 100.00, 5))  # arrives SECOND

fills, _ = book.submit_order(Order("B1", "buy", "limit", 100.00, 5))
print(fills[0].sell_order_id)  # "S1"  -> earliest order at that price wins
```

> **Exercise checkpoint:** before reading on, predict what `book.get_best_ask()` returns
> after that last trade. Then check. (Answer: `100.0` — S2's 5 lots are still resting.)

---

## 7. Reading the book: Level 2 market data

Traders rarely look at one order. They look at the **aggregated** book — total size at each
price level. That aggregated view is called **Level 2 (L2)** data, and it's what the live
depth chart on the UORA dashboard draws.

```python
book = OrderBook()
book.submit_order(Order("S1", "sell", "limit", 101.00, 10))
book.submit_order(Order("S2", "sell", "limit", 101.00, 5))   # same price as S1
book.submit_order(Order("B1", "buy",  "limit", 100.00, 20))

state = book.get_orderbook_state(depth=5)
print(state["asks"])  # [{'price': '101.00', 'quantity': 15, 'order_count': 2}]
print(state["bids"])  # [{'price': '100.00', 'quantity': 20, 'order_count': 1}]
```

Notice the ask level shows `quantity: 15` and `order_count: 2`: two separate orders (S1's 10
+ S2's 5) **aggregated** into one price level. That's the difference between an individual
order and a *price level*. (Prices come back as formatted strings like `"101.00"` — a small
detail that matters when you compare to a contestant engine's output in Module 07.)

> 📎 **In the codebase:** `get_orderbook_state()` sorts bids descending and asks ascending,
> then sums `remaining_qty` per level. The dashboard's `ValidationPanel` orderbook chart is
> drawing this exact structure.

---

## 8. 🧮 The math: why a dict-of-deques?

This section is about *data-structure thinking* — the kind of reasoning a quant developer
gets grilled on. Skip on first read if you like, but come back.

We need four operations to be fast, because an exchange does millions of them:

| Operation | How often | Our cost | Why |
|-----------|-----------|----------|-----|
| Add a resting order | constant stream | **O(1)** | `dict[price].append(order)` |
| Find best bid/ask | every incoming order | **O(P)** today | `max(self.bids)` / `min(self.asks)` over `P` price levels |
| Match oldest at a price | every trade | **O(1)** | `deque.popleft()` |
| Cancel a specific order | frequent | **O(1)** lookup + O(k) remove | `self.orders[id]`, then remove from its deque |

The book is `price → deque[Order]`:

- A **dict** gives O(1) access to any price level.
- A **deque** (double-ended queue) gives O(1) append at the back (new orders) and O(1) pop
  at the front (oldest order matches first). That `popleft()` *is* time priority.

> ⚠️ **Real-world caveat — and a genuine improvement opportunity in UORA.**
> Finding the best price with `max()`/`min()` is **O(P)** in the number of price levels.
> For a teaching reference book that's fine. A production engine handling millions of
> orders/second would instead keep prices in a **sorted structure** (a balanced BST, a
> skip list, or `sortedcontainers.SortedDict`) so best-price lookup is **O(1)** and
> inserting a new level is **O(log P)**. Real HFT engines go further still — flat arrays
> indexed by price-tick for **O(1)** everything, because cache locality beats asymptotic
> cleverness at nanosecond scale. *Knowing this trade-off is exactly the "intermediate"
> bar.* (We revisit complexity in [Module 06](module-06-the-math.md).)

### Tick size — a subtlety beginners miss

Prices don't move continuously. Every market has a **tick size**: the smallest legal price
increment (e.g. $0.01 for many stocks). Prices are really *integers* of ticks. Storing
prices as floats (as the reference book does for clarity) invites rounding bugs — note the
validator compares fill prices with a tolerance of `0.001`, not `==`, precisely to dodge
floating-point error. Production systems store prices as integer ticks and never use floats.

---

## 9. Common beginner mistakes (that break engines)

1. **Filling at the aggressor's price.** The fill happens at the **resting** order's price,
   not the incoming order's. A buyer willing to pay 101 who matches a resting ask at 100
   trades at **100** — and pockets the difference as "price improvement."
2. **Forgetting time priority.** Matching the *biggest* or *newest* order at a price instead
   of the *oldest* one. This is the single most common correctness bug, and UORA's L1
   validator is built to catch it.
3. **Letting the book cross.** Adding a bid at 102 while an ask rests at 101 — they should
   have traded. A crossed book = a broken engine.
4. **Aggregating wrong.** Showing `order_count` as size, or summing `quantity` instead of
   `remaining_qty` after partial fills.

---

## 10. Exercises

Do these in a Python shell against the real `OrderBook`. Answers are in the reference
tests, but try first.

1. **Spread & mid.** Build a book with a resting bid at 99.50 (qty 10) and a resting ask at
   100.50 (qty 10). Compute the spread and mid-price using `get_best_bid()`/`get_best_ask()`.
2. **Partial fill.** Post a sell of 10 @ 100. Send a buy of 4 @ 100. What is the seller's
   `status` and `remaining_qty` afterward? Verify.
3. **Two-level sweep.** Post sells: 5 @ 100.00, then 5 @ 100.25. Send one buy of 8 @ 100.50.
   How many fills do you get, and at what prices? (Predict, then run.)
4. **Cancel.** Post a sell of 10 @ 101. Cancel it with `cancel_order("S1")`. What does
   `get_best_ask()` return now? What does `cancel_order` return the second time you call it?
5. **Stretch.** Without running it, sketch on paper how you'd change `self.asks` from a plain
   `dict` to keep best-ask lookup O(1). What would you give up? (Hint: §8 caveat.)

---

## 11. 📚 Resources to go deeper

Curated, not a link dump. Start with the first item in each tier.

**Watch / read (gentle):**
- *TED-Ed — "How does the stock market work?"* (5 min). The mental model in one sitting.
- Investopedia: *"Order Book"* and *"Bid-Ask Spread"*. Plain-English reference definitions.

**Read (the real thing):**
- **Robert Kissell, *The Science of Algorithmic Trading and Portfolio Management*** — Ch. 2–3
  on market microstructure. The standard practitioner intro.
- **Larry Harris, *Trading and Exchanges: Market Microstructure for Practitioners*** — the
  bible of how exchanges actually work. Dense but unmatched. Read the order-book chapters.

**Free & online:**
- *QuantStart* — "Limit Order Book" articles (free, code-oriented).
- *Jane Street Tech Talks* on YouTube — "Building an Exchange" style talks; you'll now follow them.

**See real data:**
- The **LOBSTER** project (lobsterdata.com) publishes real reconstructed order books for
  NASDAQ stocks. We use its format in [Module 04](module-04-market-data.md).

---

## What's next

You can now read a book, find the spread, and explain price-time priority. But real engines
handle four different **order types**, each with its own rules and nasty edge cases — and
getting any of them wrong means UORA flags the engine as broken.

**→ [Module 02 — The Matching Engine](module-02-matching-engine.md)**
