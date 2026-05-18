# UORA Quant Module 02: The Matching Engine

> **Prerequisite:** Module 01 (LOB mechanics, price-time priority, basic FIFO matching)
> **Goal:** Understand advanced order types, edge cases, and state machines your validator must handle.

---

## 1. Why This Matters for UORA

In Module 01 you built a basic orderbook. Real contestant engines handle 4 order types. Your **correctness validator** must know the rules for each — if you validate wrong, you'll flag correct engines as broken. That's a false positive that kills your platform's credibility.

---

## 2. Order Types

### 2.1 Limit Order (recap)
> "Buy/sell X units at price P **or better**. Stay in the book if not filled."

```
BUY LIMIT 100 @ 50.00 → sits in book waiting for a seller willing to sell ≤ 50.00
```

### 2.2 Market Order
> "Buy/sell X units at **whatever price is available right now**. No price constraint."

```python
def match_market_order(self, order: Order) -> list[dict]:
    """Market order: sweep the book until filled or book is empty."""
    fills = []
    book = self.asks if order.side == 'buy' else self.bids

    while order.quantity > 0 and book:
        best_price_key = book.peekitem(0)[0]
        queue = book[best_price_key]
        resting = queue[0]

        fill_qty = min(order.quantity, resting.quantity)
        actual_price = abs(best_price_key)  # bids stored negative

        fills.append({
            'aggressor_id': order.id,
            'resting_id':   resting.id,
            'price':        actual_price,
            'quantity':     fill_qty
        })

        order.quantity   -= fill_qty
        resting.quantity -= fill_qty

        if resting.quantity == 0:
            queue.popleft()
            del self.orders[resting.id]
            if not queue:
                del book[best_price_key]

    # CRITICAL: if book is empty and order still has quantity,
    # remaining quantity is CANCELLED (not added to book)
    if order.quantity > 0:
        pass  # discard — market orders never rest in the book

    return fills
```

**Key rule:** Market orders **never** sit in the book. Any unfilled remainder is discarded.

---

### 2.3 IOC — Immediate-or-Cancel
> "Fill as much as possible **right now** at my price limit. Cancel the rest immediately."

IOC = Limit order that cannot rest in the book.

```python
def match_ioc_order(self, order: Order) -> list[dict]:
    """IOC: match with price constraint, cancel unfilled remainder."""
    # Temporarily mark as IOC so add_limit_order knows not to rest it
    fills = self._match_with_price_constraint(order)

    # Whatever is left → cancelled. Do NOT add to book.
    if order.quantity > 0:
        order.status = 'CANCELLED'  # partial fill → then cancelled
    
    return fills
```

**Timeline:**
```
IOC 100 @ 50.00 arrives
├── book has 60 lots @ 49.50 → fill 60
├── book has 30 lots @ 49.80 → fill 30  
├── book has 20 lots @ 50.10 → STOP (price > limit)
└── remaining 10 lots → CANCELLED instantly
Final: PARTIAL_FILL (90 filled) + CANCEL (10 remaining)
```

---

### 2.4 FOK — Fill-or-Kill
> "Fill the **entire** quantity immediately or cancel the **entire** order. No partials."

```python
def match_fok_order(self, order: Order) -> list[dict]:
    """FOK: check if full fill is possible BEFORE executing anything."""
    available = self._calculate_available_quantity(order)
    
    if available < order.quantity:
        # Kill the entire order — execute NOTHING
        order.status = 'CANCELLED'
        return []
    
    # Full fill is possible — execute normally
    return self._match_with_price_constraint(order)

def _calculate_available_quantity(self, order: Order) -> int:
    """Dry-run: how much can we fill at our price limit?"""
    book = self.asks if order.side == 'buy' else self.bids
    available = 0
    
    for price_key, queue in book.items():
        actual_price = abs(price_key)
        # Check price constraint
        if order.side == 'buy'  and actual_price > order.price: break
        if order.side == 'sell' and actual_price < order.price: break
        available += sum(o.quantity for o in queue)
        if available >= order.quantity:
            break
    
    return available
```

**Critical difference from IOC:**

| | IOC | FOK |
|---|---|---|
| 80 available, order = 100 | Fill 80, cancel 20 | Cancel entire order |
| 120 available, order = 100 | Fill 100 | Fill 100 |

---

## 3. Partial Fill Edge Cases

This is where naive implementations break.

### 3.1 Order Hits Multiple Price Levels

```
Sell book:
  50.00 → [Order X: 30 lots]
  50.25 → [Order Y: 40 lots]
  50.50 → [Order Z: 50 lots]

Incoming: BUY LIMIT 100 @ 50.50
```

Expected behavior:
```
Step 1: Hit 50.00 level → fill 30 from X. X is fully filled → remove from book.
Step 2: Hit 50.25 level → fill 40 from Y. Y is fully filled → remove from book.
Step 3: Hit 50.50 level → need 30 more. Fill 30 from Z. Z has 20 remaining → stays in book.

Fills: [(X, 30@50.00), (Y, 40@50.25), (Z, 30@50.50)]
Book after: 50.50 → [Order Z: 20 lots]
```

**What naive engines get wrong:**
- Fill everything at the best price (wrong — each fill is at the resting order's price)
- Remove Z from book even though 20 lots remain (wrong — partial fill, Z stays)

### 3.2 Fill Price = Resting Order's Price, NOT Aggressor's Price

```
Resting sell: 50.00 for 100 lots
Incoming buy: limit 51.00 for 50 lots

Correct fill price: 50.00  ← resting order's price (passive price priority)
Wrong fill price:   51.00  ← aggressor's price
```

This is **price-time priority**: the passive (resting) order sets the fill price.

---

## 4. Order State Machine

Every order must transition through exactly these states:

```
                    ┌─────────────────────────────────────┐
                    │              PENDING                │
                    │   (order accepted, in book or       │
                    │    awaiting matching)               │
                    └──────────┬──────────────────────────┘
                               │
              ┌────────────────┼────────────────────┐
              │                │                    │
              ▼                ▼                    ▼
        PARTIAL_FILL      CANCELLED              FILLED
        (some qty          (cancel req,         (all qty
         filled,            IOC expire,          matched)
         rest in book)      FOK fail)
              │
              │ (rest of quantity filled)
              ▼
           FILLED
```

**Legal transitions:**
```
PENDING      → PARTIAL_FILL  (first partial match)
PENDING      → FILLED        (full match in one step)
PENDING      → CANCELLED     (cancel request, IOC/FOK)
PARTIAL_FILL → FILLED        (remaining quantity matched)
PARTIAL_FILL → CANCELLED     (cancel request while partial)
```

**Illegal transitions (your validator must flag these):**
```
FILLED    → CANCELLED   # "zombie cancel" — order already done
FILLED    → FILLED      # double-fill — same order filled twice
CANCELLED → FILLED      # ghost fill — filling a cancelled order
CANCELLED → PARTIAL_FILL
```

---

## 5. Self-Trade Prevention (STP)

Self-trade = the same firm/participant is on both sides of a trade. In real markets this is illegal (wash trading).

```python
def _check_self_trade(self, aggressor: Order, resting: Order) -> str:
    """
    Returns STP action: 'cancel_aggressor', 'cancel_resting', or 'allow'
    """
    if aggressor.participant_id == resting.participant_id:
        # Most common STP mode: cancel the aggressor
        return 'cancel_aggressor'
    return 'allow'

# In your matching loop:
for resting in queue:
    stp_action = self._check_self_trade(incoming, resting)
    if stp_action == 'cancel_aggressor':
        incoming.status = 'CANCELLED'
        return fills  # stop matching
    elif stp_action == 'cancel_resting':
        # remove resting from book, continue matching
        queue.remove(resting)
        continue
    # else: 'allow' — proceed with fill
```

For UORA: implement STP as optional (contestant can disable it). Flag in anomaly detector if self-trades are high — possible sign of gaming.

---

## 6. Five Test Cases That Break Naive Implementations

Copy these into `platform/validator/test_matching.py` and run against your reference engine.

```python
from sortedcontainers import SortedDict
from collections import deque
# Import your OrderBook and Order from Module 01

def test_ioc_partial_fill():
    """IOC should partially fill then cancel remainder — NOT rest in book."""
    lob = OrderBook()
    lob.add_limit_order(Order("S1", "sell", 100.0, 30))
    
    # IOC buy for 50 lots — only 30 available
    ioc = Order("B1", "buy", 100.0, 50, order_type="ioc")
    fills = lob.match_ioc_order(ioc)
    
    assert len(fills) == 1,          "Should have exactly 1 fill"
    assert fills[0]['quantity'] == 30, "Should fill 30, not 50"
    assert ioc.status == 'CANCELLED', "Remainder must be cancelled"
    assert ioc.quantity == 20,        "20 lots remain (unfilled)"
    assert "B1" not in lob.orders,    "IOC must NOT rest in book"

def test_fok_full_kill():
    """FOK must cancel entire order if full fill impossible."""
    lob = OrderBook()
    lob.add_limit_order(Order("S1", "sell", 100.0, 80))
    
    fok = Order("B1", "buy", 100.0, 100, order_type="fok")
    fills = lob.match_fok_order(fok)
    
    assert fills == [],               "FOK must execute ZERO fills"
    assert fok.status == 'CANCELLED', "Entire order cancelled"
    # CRITICAL: resting order S1 must be untouched
    assert lob.orders["S1"].quantity == 80, "Resting order must be unchanged"

def test_multi_level_partial_fill_price():
    """Fill price must be the resting order's price at each level."""
    lob = OrderBook()
    lob.add_limit_order(Order("S1", "sell", 50.00, 30))
    lob.add_limit_order(Order("S2", "sell", 50.25, 40))
    
    fills = lob.add_limit_order(Order("B1", "buy", 50.50, 60))
    
    assert len(fills) == 2
    assert fills[0]['price'] == 50.00, "First fill at resting price 50.00"
    assert fills[1]['price'] == 50.25, "Second fill at resting price 50.25"
    assert fills[0]['quantity'] == 30
    assert fills[1]['quantity'] == 30  # only 30 of S2's 40 filled

def test_zombie_cancel_prevention():
    """Cancelling a fully filled order must return not_found, not corrupt state."""
    lob = OrderBook()
    lob.add_limit_order(Order("S1", "sell", 100.0, 50))
    lob.add_limit_order(Order("B1", "buy", 100.0, 50))  # fully fills S1
    
    # Now try to cancel the already-filled S1
    result = lob.cancel_order("S1")
    
    assert result == False, "Cancel of filled order must return False"
    # State must be unchanged — no exception, no crash
    assert lob.best_ask() is None, "Book must be empty (S1 was filled)"

def test_self_trade_prevention():
    """Same participant must not trade against themselves."""
    lob = OrderBook()
    lob.add_limit_order(Order("S1", "sell", 100.0, 50, participant_id="firm_A"))
    
    # firm_A tries to buy against their own sell
    buy = Order("B1", "buy", 100.0, 50, participant_id="firm_A")
    fills = lob.add_limit_order(buy)
    
    assert fills == [],              "Self-trade must be prevented"
    assert buy.status == 'CANCELLED', "Aggressor cancelled by STP"
    assert lob.orders["S1"].quantity == 50, "Resting order untouched"
```

---

## 7. Summary Cheatsheet

| Order Type | Price Constraint | Can Rest in Book? | Partial Fill Allowed? |
|---|---|---|---|
| Limit | Yes | ✅ Yes | ✅ Yes |
| Market | None | ❌ No | ✅ Yes |
| IOC | Yes | ❌ No | ✅ Yes |
| FOK | Yes | ❌ No | ❌ No |

---

## 8. What's Next

**Module 03:** Latency metrics — why p99 matters more than average, PTP vs NTP, and how to measure order acknowledgment time correctly in your telemetry ingester.