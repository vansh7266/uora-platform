"""
UORA Contestant SDK — Reference Implementation
A complete, correct FastAPI server implementing the Contestant API contract.
Contestants can run this locally to test their clients.
"""

from __future__ import annotations

import time
import uuid
from typing import Optional

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
import uvicorn

app = FastAPI(title="UORA Reference Contestant Engine", version="1.0.0")

# In-memory state (resets on restart)
orders = {}  # order_id -> Order
orderbook = {"bids": {}, "asks": {}}  # price -> list of Order
sequence = 0


# ─── Pydantic Models ─────────────────────────────────────────────────────────

class OrderRequest(BaseModel):
    id: str
    side: str = Field(..., pattern="^(buy|sell)$")
    type: str = Field(..., pattern="^(limit|market|ioc|fok)$")
    price: Optional[str] = None
    quantity: int = Field(..., gt=0, le=1000000)
    timestamp: int
    participant_id: Optional[str] = "default"


class FillDetail(BaseModel):
    fill_id: str
    resting_order_id: str
    price: str
    quantity: int
    timestamp: int


class OrderResponse(BaseModel):
    order_id: str
    status: str  # accepted, partial_fill, filled, cancelled, rejected
    filled_qty: int
    remaining_qty: int
    avg_price: Optional[str] = None
    fills: list[FillDetail] = []


class CancelResponse(BaseModel):
    order_id: str
    status: str  # cancelled, already_filled, not_found
    cancelled_qty: int


class PriceLevel(BaseModel):
    price: str
    quantity: int
    order_count: int


class OrderBookSnapshot(BaseModel):
    bids: list[PriceLevel]
    asks: list[PriceLevel]
    timestamp: int
    sequence: int


# ─── Order State Machine ───────────────────────────────────────────────────

class Order:
    def __init__(self, req: OrderRequest):
        self.id = req.id
        self.side = req.side
        self.type = req.type
        self.price = float(req.price) if req.price else None
        self.quantity = req.quantity
        self.timestamp = req.timestamp
        self.participant_id = req.participant_id or "default"
        self.filled_qty = 0
        self.remaining_qty = req.quantity
        self.status = "pending"
        self.fills: list[FillDetail] = []

    def to_response(self) -> OrderResponse:
        avg = None
        if self.fills:
            total_value = sum(float(f.price) * f.quantity for f in self.fills)
            total_qty = sum(f.quantity for f in self.fills)
            avg = f"{total_value / total_qty:.2f}" if total_qty > 0 else None

        return OrderResponse(
            order_id=self.id,
            status=self.status,
            filled_qty=self.filled_qty,
            remaining_qty=self.remaining_qty,
            avg_price=avg,
            fills=self.fills,
        )


# ─── Matching Engine (Simplified FIFO) ──────────────────────────────────────

def match_order(new_order: Order) -> None:
    """Simple FIFO matching for reference implementation."""
    global sequence

    if new_order.type == "limit":
        # Try to match immediately
        if new_order.side == "buy":
            match_buy_limit(new_order)
        else:
            match_sell_limit(new_order)

        # Rest remaining in book
        if new_order.remaining_qty > 0:
            book = orderbook["bids"] if new_order.side == "buy" else orderbook["asks"]
            price_key = f"{new_order.price:.2f}" if new_order.price else "0.00"
            if price_key not in book:
                book[price_key] = []
            book[price_key].append(new_order)
            new_order.status = "pending" if new_order.filled_qty == 0 else "partial_fill"
        else:
            new_order.status = "filled"

    elif new_order.type == "market":
        if new_order.side == "buy":
            match_buy_market(new_order)
        else:
            match_sell_market(new_order)
        new_order.status = "filled" if new_order.remaining_qty == 0 else "cancelled"

    elif new_order.type == "ioc":
        if new_order.side == "buy":
            match_buy_limit(new_order)
        else:
            match_sell_limit(new_order)
        new_order.status = "cancelled" if new_order.remaining_qty > 0 else "filled"

    elif new_order.type == "fok":
        # Check if full fill possible
        available = calculate_available(new_order)
        if available < new_order.quantity:
            new_order.status = "cancelled"
            return

        if new_order.side == "buy":
            match_buy_limit(new_order)
        else:
            match_sell_limit(new_order)
        new_order.status = "filled"


def match_buy_limit(order: Order) -> None:
    """Match buy limit against asks."""
    asks = orderbook["asks"]
    if not asks:
        return

    # Sort ask prices ascending
    sorted_prices = sorted(asks.keys(), key=lambda x: float(x))

    for price_key in sorted_prices:
        price = float(price_key)
        if order.price and price > order.price:
            break

        queue = asks[price_key]
        for resting in queue[:]:
            if order.remaining_qty <= 0:
                break

            fill_qty = min(order.remaining_qty, resting.remaining_qty)

            # Create fill
            fill = FillDetail(
                fill_id=f"fill-{uuid.uuid4()}",
                resting_order_id=resting.id,
                price=price_key,
                quantity=fill_qty,
                timestamp=time.time_ns(),
            )
            order.fills.append(fill)
            resting.fills.append(fill)

            order.filled_qty += fill_qty
            order.remaining_qty -= fill_qty
            resting.filled_qty += fill_qty
            resting.remaining_qty -= fill_qty

            if resting.remaining_qty == 0:
                resting.status = "filled"
                queue.remove(resting)

        if not queue:
            del asks[price_key]

        if order.remaining_qty <= 0:
            break


def match_sell_limit(order: Order) -> None:
    """Match sell limit against bids."""
    bids = orderbook["bids"]
    if not bids:
        return

    # Sort bid prices descending
    sorted_prices = sorted(bids.keys(), key=lambda x: float(x), reverse=True)

    for price_key in sorted_prices:
        price = float(price_key)
        if order.price and price < order.price:
            break

        queue = bids[price_key]
        for resting in queue[:]:
            if order.remaining_qty <= 0:
                break

            fill_qty = min(order.remaining_qty, resting.remaining_qty)

            fill = FillDetail(
                fill_id=f"fill-{uuid.uuid4()}",
                resting_order_id=resting.id,
                price=price_key,
                quantity=fill_qty,
                timestamp=time.time_ns(),
            )
            order.fills.append(fill)
            resting.fills.append(fill)

            order.filled_qty += fill_qty
            order.remaining_qty -= fill_qty
            resting.filled_qty += fill_qty
            resting.remaining_qty -= fill_qty

            if resting.remaining_qty == 0:
                resting.status = "filled"
                queue.remove(resting)

        if not queue:
            del bids[price_key]

        if order.remaining_qty <= 0:
            break


def match_buy_market(order: Order) -> None:
    """Market buy: fill at any price."""
    asks = orderbook["asks"]
    if not asks:
        return

    sorted_prices = sorted(asks.keys(), key=lambda x: float(x))
    for price_key in sorted_prices:
        queue = asks[price_key]
        for resting in queue[:]:
            if order.remaining_qty <= 0:
                break
            fill_qty = min(order.remaining_qty, resting.remaining_qty)
            fill = FillDetail(
                fill_id=f"fill-{uuid.uuid4()}",
                resting_order_id=resting.id,
                price=price_key,
                quantity=fill_qty,
                timestamp=time.time_ns(),
            )
            order.fills.append(fill)
            order.filled_qty += fill_qty
            order.remaining_qty -= fill_qty
            resting.filled_qty += fill_qty
            resting.remaining_qty -= fill_qty
            if resting.remaining_qty == 0:
                resting.status = "filled"
                queue.remove(resting)
        if not queue:
            del asks[price_key]
        if order.remaining_qty <= 0:
            break


def match_sell_market(order: Order) -> None:
    """Market sell: fill at any price."""
    bids = orderbook["bids"]
    if not bids:
        return

    sorted_prices = sorted(bids.keys(), key=lambda x: float(x), reverse=True)
    for price_key in sorted_prices:
        queue = bids[price_key]
        for resting in queue[:]:
            if order.remaining_qty <= 0:
                break
            fill_qty = min(order.remaining_qty, resting.remaining_qty)
            fill = FillDetail(
                fill_id=f"fill-{uuid.uuid4()}",
                resting_order_id=resting.id,
                price=price_key,
                quantity=fill_qty,
                timestamp=time.time_ns(),
            )
            order.fills.append(fill)
            order.filled_qty += fill_qty
            order.remaining_qty -= fill_qty
            resting.filled_qty += fill_qty
            resting.remaining_qty -= fill_qty
            if resting.remaining_qty == 0:
                resting.status = "filled"
                queue.remove(resting)
        if not queue:
            del bids[price_key]
        if order.remaining_qty <= 0:
            break


def calculate_available(order: Order) -> int:
    """Calculate available liquidity for FOK check."""
    if order.side == "buy":
        book = orderbook["asks"]
        sorted_prices = sorted(book.keys(), key=lambda x: float(x))
        available = 0
        for price_key in sorted_prices:
            price = float(price_key)
            if order.price and price > order.price:
                break
            available += sum(o.remaining_qty for o in book[price_key])
            if available >= order.quantity:
                break
        return available
    else:
        book = orderbook["bids"]
        sorted_prices = sorted(book.keys(), key=lambda x: float(x), reverse=True)
        available = 0
        for price_key in sorted_prices:
            price = float(price_key)
            if order.price and price < order.price:
                break
            available += sum(o.remaining_qty for o in book[price_key])
            if available >= order.quantity:
                break
        return available


# ─── API Endpoints ───────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "engine": "reference", "version": "1.0.0"}


@app.post("/api/v1/order", response_model=OrderResponse)
async def submit_order(req: OrderRequest):
    global sequence
    sequence += 1

    # Validate
    if req.type in ("limit", "ioc", "fok") and not req.price:
        raise HTTPException(400, detail="Price required for limit/ioc/fok orders")

    if req.id in orders:
        raise HTTPException(400, detail="Duplicate order ID")

    # Create and match
    order = Order(req)
    match_order(order)
    orders[req.id] = order

    return order.to_response()


@app.delete("/api/v1/order/{order_id}", response_model=CancelResponse)
async def cancel_order(order_id: str):
    if order_id not in orders:
        return CancelResponse(order_id=order_id, status="not_found", cancelled_qty=0)

    order = orders[order_id]

    if order.status == "filled":
        return CancelResponse(order_id=order_id, status="already_filled", cancelled_qty=0)

    if order.status == "cancelled":
        return CancelResponse(order_id=order_id, status="not_found", cancelled_qty=0)

    # Cancel remaining
    cancelled_qty = order.remaining_qty
    order.status = "cancelled"
    order.remaining_qty = 0

    # Remove from book
    book = orderbook["bids"] if order.side == "buy" else orderbook["asks"]
    price_key = f"{order.price:.2f}" if order.price else "0.00"
    if price_key in book and order in book[price_key]:
        book[price_key].remove(order)
        if not book[price_key]:
            del book[price_key]

    return CancelResponse(order_id=order_id, status="cancelled", cancelled_qty=cancelled_qty)


@app.get("/api/v1/orderbook")
async def get_orderbook(depth: int = 10):
    bids = []
    for price_key in sorted(orderbook["bids"].keys(), key=lambda x: float(x), reverse=True)[:depth]:
        queue = orderbook["bids"][price_key]
        total_qty = sum(o.remaining_qty for o in queue)
        bids.append(PriceLevel(price=price_key, quantity=total_qty, order_count=len(queue)))

    asks = []
    for price_key in sorted(orderbook["asks"].keys(), key=lambda x: float(x))[:depth]:
        queue = orderbook["asks"][price_key]
        total_qty = sum(o.remaining_qty for o in queue)
        asks.append(PriceLevel(price=price_key, quantity=total_qty, order_count=len(queue)))

    return OrderBookSnapshot(
        bids=bids,
        asks=asks,
        timestamp=time.time_ns(),
        sequence=sequence,
    )


@app.websocket("/api/v1/stream")
async def stream(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            # Send heartbeat every second
            await websocket.send_json({
                "type": "heartbeat",
                "timestamp": time.time_ns(),
            })
            await asyncio.sleep(1)
    except WebSocketDisconnect:
        pass


# ─── Main ────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import asyncio
    uvicorn.run(app, host="0.0.0.0", port=8080, loop="uvloop")