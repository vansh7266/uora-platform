"""
UORA Reference Limit Order Book Engine (v3.1 - Fixed)
Fixed STP infinite loop bug. Uses plain dict for maximum compatibility.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class Order:
    """Represents a single order in the book."""
    id: str
    side: str           # "buy" or "sell"
    order_type: str     # "limit", "market", "ioc", "fok"
    price: Optional[float]  # None for market orders
    quantity: int
    timestamp: int = 0
    participant_id: str = ""
    filled_qty: int = 0
    status: str = "pending"  # pending, partial_fill, filled, cancelled

    def __post_init__(self):
        if not self.participant_id:
            self.participant_id = self.id

    @property
    def remaining_qty(self) -> int:
        return self.quantity - self.filled_qty


@dataclass
class Fill:
    """Represents a single fill (trade) between two orders."""
    fill_id: str
    buy_order_id: str
    sell_order_id: str
    price: float
    quantity: int
    timestamp: int
    aggressor_side: str  # which side initiated the match


class OrderBook:
    """
    Deterministic FIFO matching engine with price-time priority.
    Uses plain dict for maximum compatibility across Python versions.
    """

    def __init__(self):
        # Bids: price -> deque[Order]
        self.bids = {}  # price -> deque[Order]
        # Asks: price -> deque[Order]
        self.asks = {}  # price -> deque[Order]
        # Fast lookup for cancellation
        self.orders = {}  # order_id -> Order
        # Sequence number for deterministic replay
        self.sequence = 0
        self.event_sequence = 0

    def _next_event_timestamp(self) -> int:
        """Deterministic logical timestamp for fills and snapshots."""
        self.event_sequence += 1
        return self.event_sequence

    # ─── Public API ──────────────────────────────────────────────────────────

    def submit_order(self, order: Order) -> tuple[list[Fill], Order]:
        """
        Main entry point. Routes to correct handler based on order type.
        Returns: (list of fills, updated order)
        """
        self.sequence += 1
        if not order.timestamp:
            order.timestamp = self._next_event_timestamp()

        if order.order_type == "market":
            return self._match_market(order)
        elif order.order_type == "ioc":
            return self._match_ioc(order)
        elif order.order_type == "fok":
            return self._match_fok(order)
        else:  # limit
            return self._match_limit(order)

    def cancel_order(self, order_id: str) -> tuple[bool, Optional[Order]]:
        """
        Cancel a resting order.
        Returns: (success, cancelled_order_or_none)
        """
        if order_id not in self.orders:
            return False, None

        order = self.orders[order_id]

        # Can only cancel pending or partial_fill orders
        if order.status not in ("pending", "partial_fill"):
            return False, order

        # Remove from book
        book = self.bids if order.side == "buy" else self.asks
        if order.price in book:
            queue = book[order.price]
            if order in queue:
                queue.remove(order)
                if not queue:
                    del book[order.price]

        order.status = "cancelled"
        del self.orders[order_id]

        return True, order

    def get_orderbook_state(self, depth: int = 10) -> dict:
        """Returns current LOB snapshot for /api/v1/orderbook endpoint."""
        # Sort bids descending by price
        bid_prices = sorted(self.bids.keys(), reverse=True)[:depth]
        bids = []
        for price in bid_prices:
            queue = self.bids[price]
            total_qty = sum(o.remaining_qty for o in queue)
            bids.append({
                "price": f"{price:.2f}",
                "quantity": total_qty,
                "order_count": len(queue)
            })

        # Sort asks ascending by price
        ask_prices = sorted(self.asks.keys())[:depth]
        asks = []
        for price in ask_prices:
            queue = self.asks[price]
            total_qty = sum(o.remaining_qty for o in queue)
            asks.append({
                "price": f"{price:.2f}",
                "quantity": total_qty,
                "order_count": len(queue)
            })

        return {
            "bids": bids,
            "asks": asks,
            "timestamp": self.event_sequence,
            "sequence": self.sequence
        }

    def get_best_bid(self) -> Optional[float]:
        return max(self.bids.keys()) if self.bids else None

    def get_best_ask(self) -> Optional[float]:
        return min(self.asks.keys()) if self.asks else None

    # ─── Matching Logic ──────────────────────────────────────────────────────

    def _match_limit(self, order: Order) -> tuple[list[Fill], Order]:
        """Limit order: fill what you can, rest remainder in book."""
        fills = self._match_order(order)

        # If not fully filled, add to book
        if order.remaining_qty > 0 and order.status != "cancelled":
            self._add_to_book(order)
            order.status = "pending" if order.filled_qty == 0 else "partial_fill"
        elif order.filled_qty > 0:
            order.status = "filled"
        else:
            order.status = "cancelled"

        return fills, order

    def _match_market(self, order: Order) -> tuple[list[Fill], Order]:
        """Market order: fill immediately, discard unfilled remainder."""
        fills = self._match_order(order)
        order.status = "filled" if order.filled_qty == order.quantity else "cancelled"
        return fills, order

    def _match_ioc(self, order: Order) -> tuple[list[Fill], Order]:
        """IOC: fill what you can, cancel remainder immediately."""
        fills = self._match_order(order)
        if order.remaining_qty > 0 or order.status == "cancelled":
            order.status = "cancelled"
        else:
            order.status = "filled"
        return fills, order

    def _match_fok(self, order: Order) -> tuple[list[Fill], Order]:
        """FOK: fill completely or cancel entirely."""
        # Check if full fill is possible BEFORE executing
        available = self._calculate_available(order)

        if available < order.quantity:
            order.status = "cancelled"
            return [], order

        # Full fill is possible — execute
        fills = self._match_order(order)
        order.status = "filled"
        return fills, order

    def _match_order(self, order: Order) -> list[Fill]:
        """
        Core matching logic. Matches order against opposite side of book.
        Returns list of fills. Modifies order.filled_qty in place.
        """
        fills = []

        if order.side == "buy":
            # Match against asks (lowest price first)
            while order.remaining_qty > 0 and self.asks:
                best_ask_price = min(self.asks.keys())

                # Price check for limit/ioc/fok
                if order.price is not None and best_ask_price > order.price:
                    break

                ask_queue = self.asks[best_ask_price]
                fills.extend(self._match_against_queue(order, ask_queue, best_ask_price, "buy"))

                # FIX: Break if STP cancelled the aggressor
                if order.status == "cancelled":
                    break

                # Clean up empty price level
                if not ask_queue:
                    del self.asks[best_ask_price]
        else:
            # Match against bids (highest price first)
            while order.remaining_qty > 0 and self.bids:
                best_bid_price = max(self.bids.keys())

                # Price check for limit/ioc/fok
                if order.price is not None and best_bid_price < order.price:
                    break

                bid_queue = self.bids[best_bid_price]
                fills.extend(self._match_against_queue(order, bid_queue, best_bid_price, "sell"))

                # FIX: Break if STP cancelled the aggressor
                if order.status == "cancelled":
                    break

                # Clean up empty price level
                if not bid_queue:
                    del self.bids[best_bid_price]

        return fills

    def _match_against_queue(self, aggressor: Order, queue: deque, 
                             price: float, aggressor_side: str) -> list[Fill]:
        """Match aggressor order against a FIFO queue at a single price level."""
        fills = []

        while aggressor.remaining_qty > 0 and queue:
            resting = queue[0]

            # Self-trade prevention
            if aggressor.participant_id == resting.participant_id:
                # Cancel aggressor (most common STP mode)
                aggressor.status = "cancelled"
                return fills

            fill_qty = min(aggressor.remaining_qty, resting.remaining_qty)

            # Create fill record
            fill = Fill(
                fill_id=f"fill-{aggressor.id}-{resting.id}",
                buy_order_id=aggressor.id if aggressor.side == "buy" else resting.id,
                sell_order_id=aggressor.id if aggressor.side == "sell" else resting.id,
                price=price,
                quantity=fill_qty,
                timestamp=self._next_event_timestamp(),
                aggressor_side=aggressor_side
            )
            fills.append(fill)

            # Update quantities
            aggressor.filled_qty += fill_qty
            resting.filled_qty += fill_qty

            # Remove fully filled resting orders
            if resting.remaining_qty == 0:
                queue.popleft()
                resting.status = "filled"
                if resting.id in self.orders:
                    del self.orders[resting.id]

            # If aggressor fully filled, stop
            if aggressor.remaining_qty == 0:
                break

        return fills

    def _add_to_book(self, order: Order) -> None:
        """Add remaining quantity to the appropriate side of the book."""
        if order.side == "buy":
            if order.price not in self.bids:
                self.bids[order.price] = deque()
            self.bids[order.price].append(order)
        else:
            if order.price not in self.asks:
                self.asks[order.price] = deque()
            self.asks[order.price].append(order)

        self.orders[order.id] = order

    def _calculate_available(self, order: Order) -> int:
        """Dry-run: calculate how much can be filled at current prices."""
        available = 0

        if order.side == "buy":
            for price in sorted(self.asks.keys()):
                if order.price is not None and price > order.price:
                    break
                available += sum(o.remaining_qty for o in self.asks[price])
                if available >= order.quantity:
                    break
        else:
            for price in sorted(self.bids.keys(), reverse=True):
                if order.price is not None and price < order.price:
                    break
                available += sum(o.remaining_qty for o in self.bids[price])
                if available >= order.quantity:
                    break

        return available


# ─── Test Suite ──────────────────────────────────────────────────────────────

def test_basic_limit():
    """Test 1: Basic limit order resting in book."""
    lob = OrderBook()
    order = Order("A", "sell", "limit", 101.0, 10)
    fills, updated = lob.submit_order(order)

    assert len(fills) == 0, "No fills for single order"
    assert updated.status == "pending"
    assert lob.get_best_ask() == 101.0
    assert lob.get_best_bid() is None
    print("✓ Test 1: Basic limit order")


def test_cross_spread():
    """Test 2: Buy crosses spread, fills against resting sell."""
    lob = OrderBook()
    lob.submit_order(Order("S1", "sell", "limit", 100.0, 5))

    fills, updated = lob.submit_order(Order("B1", "buy", "limit", 100.0, 8))

    assert len(fills) == 1, "Should have 1 fill"
    assert fills[0].price == 100.0, "Fill at resting price"
    assert fills[0].quantity == 5, "Fill 5 lots"
    assert updated.status == "partial_fill"
    assert updated.remaining_qty == 3
    print("✓ Test 2: Cross spread partial fill")


def test_price_time_priority():
    """Test 3: FIFO at same price level."""
    lob = OrderBook()
    lob.submit_order(Order("S1", "sell", "limit", 100.0, 5))  # First
    lob.submit_order(Order("S2", "sell", "limit", 100.0, 5))  # Second

    fills, _ = lob.submit_order(Order("B1", "buy", "limit", 100.0, 5))

    assert len(fills) == 1
    assert fills[0].sell_order_id == "S1", "Should fill against S1 first (FIFO)"
    print("✓ Test 3: Price-time priority FIFO")


def test_ioc_partial():
    """Test 4: IOC partial fill, remainder cancelled."""
    lob = OrderBook()
    lob.submit_order(Order("S1", "sell", "limit", 100.0, 3))

    fills, updated = lob.submit_order(Order("B1", "buy", "ioc", 100.0, 5))

    assert len(fills) == 1
    assert fills[0].quantity == 3
    assert updated.status == "cancelled"
    assert updated.remaining_qty == 2
    assert "B1" not in lob.orders, "IOC should not rest in book"
    print("✓ Test 4: IOC partial fill")


def test_fok_kill():
    """Test 5: FOK cancelled when full fill impossible."""
    lob = OrderBook()
    lob.submit_order(Order("S1", "sell", "limit", 100.0, 3))

    fills, updated = lob.submit_order(Order("B1", "buy", "fok", 100.0, 5))

    assert len(fills) == 0, "FOK should execute zero fills"
    assert updated.status == "cancelled"
    assert "S1" in lob.orders, "Resting order untouched"
    print("✓ Test 5: FOK full kill")


def test_multi_level_fill():
    """Test 6: Order hits multiple price levels."""
    lob = OrderBook()
    lob.submit_order(Order("S1", "sell", "limit", 50.0, 30))
    lob.submit_order(Order("S2", "sell", "limit", 50.25, 40))

    fills, _ = lob.submit_order(Order("B1", "buy", "limit", 50.5, 60))

    assert len(fills) == 2
    assert fills[0].price == 50.0
    assert fills[1].price == 50.25
    assert fills[0].quantity == 30
    assert fills[1].quantity == 30
    print("✓ Test 6: Multi-level fill")


def test_cancel():
    """Test 7: Cancel resting order."""
    lob = OrderBook()
    lob.submit_order(Order("S1", "sell", "limit", 100.0, 5))

    success, _ = lob.cancel_order("S1")
    assert success is True
    assert lob.get_best_ask() is None
    print("✓ Test 7: Cancel order")


def test_market_order():
    """Test 8: Market order fills immediately, no resting."""
    lob = OrderBook()
    lob.submit_order(Order("S1", "sell", "limit", 100.0, 5))

    fills, updated = lob.submit_order(Order("B1", "buy", "market", None, 3))

    assert len(fills) == 1
    assert updated.status == "filled"
    assert updated.remaining_qty == 0
    print("✓ Test 8: Market order")


def test_deterministic_replay_timestamps():
    """Test 9: Identical order streams produce identical fills and snapshots."""
    def run_once():
        lob = OrderBook()
        lob.submit_order(Order("S1", "sell", "limit", 100.0, 5))
        fills, _ = lob.submit_order(Order("B1", "buy", "limit", 100.0, 5))
        return [fill.__dict__ for fill in fills], lob.get_orderbook_state()

    fills_a, state_a = run_once()
    fills_b, state_b = run_once()

    assert fills_a == fills_b
    assert state_a == state_b
    print("✓ Test 9: Deterministic replay timestamps")


if __name__ == "__main__":
    print("Running UORA Reference LOB Tests (v3.1 - STP fix)...\n")
    test_basic_limit()
    test_cross_spread()
    test_price_time_priority()
    test_ioc_partial()
    test_fok_kill()
    test_multi_level_fill()
    test_cancel()
    test_market_order()
    test_deterministic_replay_timestamps()
    print("\n✅ All tests passed. Reference LOB is correct.")
