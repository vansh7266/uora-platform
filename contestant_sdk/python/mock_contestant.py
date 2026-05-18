"""
UORA Mock Contestant Engine
A minimal FastAPI server that implements the Contestant API contract.
Used to test the bot fleet before real submissions arrive.
"""

import time
import uuid
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
import uvicorn

app = FastAPI(title="UORA Mock Contestant Engine", version="1.0.0")

# In-memory order book (resets on restart)
orders = {}  # order_id -> order dict
orderbook = {"bids": {}, "asks": {}}  # price -> total qty
sequence = 0


# ─── Pydantic Models ─────────────────────────────────────────────────────────

class OrderRequest(BaseModel):
    id: str
    side: str = Field(..., pattern="^(buy|sell)$")
    type: str = Field(..., pattern="^(limit|market|ioc|fok)$")
    price: Optional[str] = None
    quantity: int = Field(..., gt=0, le=1000000)
    timestamp: int
    participant_id: Optional[str] = "mock"


class OrderResponse(BaseModel):
    order_id: str
    status: str
    filled_qty: int
    remaining_qty: int
    avg_price: Optional[str] = None
    fills: list = []


class CancelResponse(BaseModel):
    order_id: str
    status: str
    cancelled_qty: int


# ─── Endpoints ───────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "engine": "mock", "version": "1.0.0"}


@app.post("/api/v1/order", response_model=OrderResponse)
async def submit_order(req: OrderRequest):
    global sequence
    sequence += 1

    # Simple mock logic: accept everything, simulate partial fills
    if req.type == "market":
        # Market orders: fill 100% immediately
        status = "filled"
        filled = req.quantity
        remaining = 0
        avg_price = "100.50"  # Mock price
    elif req.type == "fok":
        # FOK: simulate 50% chance of full fill
        if req.quantity <= 100:
            status = "filled"
            filled = req.quantity
            remaining = 0
            avg_price = req.price or "100.50"
        else:
            status = "cancelled"
            filled = 0
            remaining = req.quantity
            avg_price = None
    elif req.type == "ioc":
        # IOC: fill 70%, cancel rest
        filled = int(req.quantity * 0.7)
        remaining = req.quantity - filled
        status = "cancelled" if remaining > 0 else "filled"
        avg_price = req.price or "100.50"
    else:
        # Limit: accept to book
        status = "accepted"
        filled = 0
        remaining = req.quantity
        avg_price = None

        # Update orderbook
        side_book = orderbook["bids"] if req.side == "buy" else orderbook["asks"]
        price = req.price or "100.00"
        if price not in side_book:
            side_book[price] = 0
        side_book[price] += req.quantity

    # Store order
    orders[req.id] = {
        "id": req.id,
        "side": req.side,
        "type": req.type,
        "status": status,
        "filled_qty": filled,
        "remaining_qty": remaining,
        "price": req.price
    }

    return OrderResponse(
        order_id=req.id,
        status=status,
        filled_qty=filled,
        remaining_qty=remaining,
        avg_price=avg_price,
        fills=[{
            "fill_id": f"fill-{uuid.uuid4()}",
            "resting_order_id": f"rest-{uuid.uuid4()}",
            "price": avg_price or "0.00",
            "quantity": filled,
            "timestamp": time.time_ns()
        }] if filled > 0 else []
    )


@app.delete("/api/v1/order/{order_id}", response_model=CancelResponse)
async def cancel_order(order_id: str):
    if order_id not in orders:
        return CancelResponse(order_id=order_id, status="not_found", cancelled_qty=0)

    order = orders[order_id]
    if order["status"] == "filled":
        return CancelResponse(order_id=order_id, status="already_filled", cancelled_qty=0)

    # Cancel it
    cancelled_qty = order["remaining_qty"]
    order["status"] = "cancelled"
    order["remaining_qty"] = 0

    # Update orderbook
    side_book = orderbook["bids"] if order["side"] == "buy" else orderbook["asks"]
    price = order.get("price", "100.00")
    if price in side_book:
        side_book[price] -= cancelled_qty
        if side_book[price] <= 0:
            del side_book[price]

    return CancelResponse(order_id=order_id, status="cancelled", cancelled_qty=cancelled_qty)


@app.get("/api/v1/orderbook")
async def get_orderbook(depth: int = 10):
    bids = [
        {"price": p, "quantity": q, "order_count": 1}
        for p, q in sorted(orderbook["bids"].items(), reverse=True)[:depth]
    ]
    asks = [
        {"price": p, "quantity": q, "order_count": 1}
        for p, q in sorted(orderbook["asks"].items())[:depth]
    ]

    return {
        "bids": bids,
        "asks": asks,
        "timestamp": time.time_ns(),
        "sequence": sequence
    }


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8080, loop="uvloop")