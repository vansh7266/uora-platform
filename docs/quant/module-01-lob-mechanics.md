# Quant Module 01: Limit Order Book (LOB) Mechanics

## Learning Objective
By the end of this module, you will build a toy orderbook in Python that handles limit orders, market orders, and cancellations with correct price-time priority.

## 1. What is an Order Book?
An order book is a real-time list of buy (bid) and sell (ask) orders for an asset, organized by price level.

### Key Concepts
- **Bid**: An order to BUY at a specific price or lower
- **Ask**: An order to SELL at a specific price or higher
- **Spread**: Ask price - Bid price (must be >= 0)
- **Price-Time Priority**: At each price level, orders are matched in FIFO order (earliest first)

## 2. Order Types

| Type | Behavior |
| :--- | :--- |
| Limit | Buy/sell at specified price or better. Remains in book if unfilled. |
| Market | Buy/sell immediately at best available price. |
| IOC (Immediate-or-Cancel) | Fill immediately; cancel any unfilled portion. |
| FOK (Fill-or-Kill) | Fill completely immediately or cancel entirely. |
| Cancel | Remove pending order from book. |

## 3. Matching Logic (Price-Time Priority)

Example: **Incoming BUY order @ 100.50**
1. Check asks sorted by price (lowest first)
2. Best ask = 100.25? Yes, 100.25 <= 100.50 -> MATCH
3. At price 100.25, orders sorted by time (oldest first)
4. Fill against earliest sell order until quantity exhausted
5. If incoming order still has quantity, add to bid side @ 100.50

## 4. Your Exercise
Implement the reference orderbook in `platform/validator/reference_lob.py`.

**Requirements:**
- Use `sortedcontainers.SortedDict` for price levels
- Use `collections.deque` for FIFO queues at each level
- Track all orders in a dict for O(1) cancellation
- Handle partial fills correctly
- Maintain `best_bid` and `best_ask` at all times

## 5. Validation Checklist
- [ ] Buy limit order below best ask rests in book
- [ ] Buy limit order crossing spread fills against best ask
- [ ] Multiple orders at same price fill in time order
- [ ] Cancel removes order from book and updates best price if needed
- [ ] Market order fills immediately or rejects if no liquidity
- [ ] Partial fills update remaining quantity correctly

## 6. Test Cases
```python
lob = OrderBook()

# Test 1: Basic add
lob.add_limit_order(Order("A", "sell", 101.0, 10))
assert lob.best_ask() == 101.0

# Test 2: Cross spread
fills = lob.add_limit_order(Order("B", "buy", 101.0, 5))
assert len(fills) == 1
assert fills[0]["price"] == 101.0
assert fills[0]["quantity"] == 5

# Test 3: Price-time priority
lob.add_limit_order(Order("C", "sell", 100.0, 5))  # Earlier
lob.add_limit_order(Order("D", "sell", 100.0, 5))  # Later
fills = lob.add_limit_order(Order("E", "buy", 100.0, 5))
assert fills[0]["sell_id"] == "C"  # C was first
```

## Next Module
**Module 02: Matching Engine Deep Dive** -- IOC, FOK, and partial fill edge cases.
