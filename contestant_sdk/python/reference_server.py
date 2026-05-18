"""
UORA Contestant SDK — Reference Implementation
A complete, correct FastAPI server implementing the Contestant API contract.
Contestants can run this locally to test their clients.

Uses the canonical reference_lob.OrderBook for deterministic matching,
ensuring parity between the validator and the SDK.
"""

from __future__ import annotations

import asyncio
import sys
import time
import uuid
from typing import Optional

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
import uvicorn

# ─── Import the canonical OrderBook from the validator ─────────────────────
try:
    from uora.validator.reference_lob import OrderBook, Order as LobOrder, Fill as LobFill
except ImportError:
    # Fallback: add project root to path for direct execution
    sys.path.insert(0, "/app")
    try:
        from uora.validator.reference_lob import OrderBook, Order as LobOrder, Fill as LobFill
    except ImportError:
        # If running standalone outside the project tree, we cannot proceed
        print("ERROR: Cannot import reference_lob.OrderBook. Ensure uora package is on PYTHONPATH.")
        sys.exit(1)

app = FastAPI(title="UORA Reference Contestant Engine", version="2.0.0")

# Singleton orderbook — the single source of truth for matching
lob = OrderBook()
seen_order_ids: set[str] = set()


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


# ─── Helper: Convert reference_lob.Fill → API FillDetail ────────────────────

def _fill_to_detail(fill: LobFill, new_order_id: str) -> FillDetail:
    """Convert a reference_lob.Fill into the API-facing FillDetail model."""
    # The resting order is the one that is NOT the new order
    resting_id = fill.buy_order_id if fill.buy_order_id != new_order_id else fill.sell_order_id
    if resting_id == new_order_id:
        resting_id = fill.sell_order_id if fill.buy_order_id == new_order_id else fill.buy_order_id

    return FillDetail(
        fill_id=fill.fill_id,
        resting_order_id=resting_id,
        price=f"{fill.price:.2f}",
        quantity=fill.quantity,
        timestamp=fill.timestamp,
    )


def _api_order_status(status: str) -> str:
    """Translate internal LOB states to the public OpenAPI response contract."""
    return "accepted" if status == "pending" else status


# ─── API Endpoints ───────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "engine": "reference_lob", "version": "2.0.0"}


@app.post("/api/v1/order", response_model=OrderResponse)
async def submit_order(req: OrderRequest):
    # Validate
    if req.type in ("limit", "ioc", "fok") and not req.price:
        raise HTTPException(400, detail="Price required for limit/ioc/fok orders")

    if req.id in seen_order_ids:
        raise HTTPException(400, detail="Duplicate order ID")
    seen_order_ids.add(req.id)

    # Convert API request → canonical reference_lob.Order
    order = LobOrder(
        id=req.id,
        side=req.side,
        order_type=req.type,
        price=float(req.price) if req.price else None,
        quantity=req.quantity,
        timestamp=req.timestamp,
        participant_id=req.participant_id or "default",
    )

    # Delegate to the canonical matching engine
    fills, updated = lob.submit_order(order)

    # Build API response from the matched order
    fill_details = [_fill_to_detail(f, req.id) for f in fills]

    avg = None
    if fill_details:
        total_value = sum(float(f.price) * f.quantity for f in fill_details)
        total_qty = sum(f.quantity for f in fill_details)
        avg = f"{total_value / total_qty:.2f}" if total_qty > 0 else None

    return OrderResponse(
        order_id=updated.id,
        status=_api_order_status(updated.status),
        filled_qty=updated.filled_qty,
        remaining_qty=updated.remaining_qty,
        avg_price=avg,
        fills=fill_details,
    )


@app.delete("/api/v1/order/{order_id}", response_model=CancelResponse)
async def cancel_order(order_id: str):
    success, order = lob.cancel_order(order_id)

    if success and order is not None:
        return CancelResponse(
            order_id=order_id,
            status="cancelled",
            cancelled_qty=order.remaining_qty,
        )

    if not success and order is None:
        return CancelResponse(order_id=order_id, status="not_found", cancelled_qty=0)

    if order and order.status == "filled":
        return CancelResponse(order_id=order_id, status="already_filled", cancelled_qty=0)

    return CancelResponse(order_id=order_id, status="not_found", cancelled_qty=0)


@app.get("/api/v1/orderbook")
async def get_orderbook(depth: int = 10):
    state = lob.get_orderbook_state(depth=depth)

    bids = [PriceLevel(price=b["price"], quantity=b["quantity"], order_count=b["order_count"]) for b in state["bids"]]
    asks = [PriceLevel(price=a["price"], quantity=a["quantity"], order_count=a["order_count"]) for a in state["asks"]]

    return OrderBookSnapshot(
        bids=bids,
        asks=asks,
        timestamp=state["timestamp"],
        sequence=state["sequence"],
    )


@app.websocket("/api/v1/stream")
async def stream(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
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
