#!/usr/bin/env python3
"""
UORA — Dummy Python Matching Engine
====================================
A minimal, self-contained matching engine that implements the UORA HTTP API
contract using only the Python stdlib. Drop this into the platform's submission
flow and watch it run through the full benchmark → validate → score pipeline.

Implements:
  • Price-time priority matching for limit and market orders
  • Self-trade prevention by participant_id
  • /api/v1/order, /api/v1/cancel, /api/v1/orderbook, /health

Not implemented (intentionally — left for contestants to optimize):
  • IOC/FOK semantics (they're routed through the limit path here)
  • Concurrency: single-threaded with a global lock; real engines should
    shard by symbol or use lock-free price levels.

Run:  python3 dummy_engine.py        # listens on 0.0.0.0:8080 (or $PORT)
"""

from __future__ import annotations

import json
import os
import threading
import uuid
from collections import defaultdict
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Optional


# ─── Order book — price-time priority, sorted by price level ────────────────

class OrderBook:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._bids: dict[float, list[dict]] = defaultdict(list)  # price → FIFO orders
        self._asks: dict[float, list[dict]] = defaultdict(list)
        self._orders: dict[str, dict] = {}  # id → order (for cancels + STP)
        self._seen_ids: set[str] = set()
        self._seq = 0

    def _next_seq(self) -> int:
        self._seq += 1
        return self._seq

    def _best_bid(self) -> Optional[float]:
        return max(self._bids) if self._bids else None

    def _best_ask(self) -> Optional[float]:
        return min(self._asks) if self._asks else None

    def submit(self, req: dict) -> dict:
        with self._lock:
            if req["id"] in self._seen_ids:
                return {"error": "Duplicate order ID"}
            self._seen_ids.add(req["id"])

            side = req["side"]
            is_market = req["type"] == "market"
            price = None if is_market else float(req["price"])
            remaining = int(req["quantity"])
            participant = req.get("participant_id") or "default"

            fills: list[dict] = []
            # ── Crossing: aggressors eat from the opposite side ──
            opp = self._asks if side == "buy" else self._bids
            opp_prices = sorted(opp) if side == "buy" else sorted(opp, reverse=True)

            for opp_price in opp_prices:
                if remaining == 0:
                    break
                if not is_market:
                    if side == "buy" and opp_price > price:
                        break
                    if side == "sell" and opp_price < price:
                        break
                level = opp[opp_price]
                i = 0
                while i < len(level) and remaining > 0:
                    resting = level[i]
                    # Self-trade prevention: skip resting orders from same participant.
                    if resting["participant_id"] == participant:
                        i += 1
                        continue
                    trade_qty = min(remaining, resting["remaining"])
                    fills.append({
                        "fill_id": str(uuid.uuid4()),
                        "resting_order_id": resting["id"],
                        "price": f"{opp_price:.2f}",
                        "quantity": trade_qty,
                        "timestamp": req["timestamp"],
                    })
                    resting["remaining"] -= trade_qty
                    remaining -= trade_qty
                    if resting["remaining"] == 0:
                        resting["status"] = "filled"
                        self._orders.pop(resting["id"], None)
                        level.pop(i)
                    else:
                        resting["status"] = "partial_fill"
                        i += 1
                if not level:
                    opp.pop(opp_price, None)

            # ── Resting remainder: limit orders only ──
            if remaining > 0 and not is_market:
                order = {
                    "id": req["id"], "side": side, "price": price,
                    "remaining": remaining, "participant_id": participant,
                    "status": "partial_fill" if fills else "accepted",
                }
                book = self._bids if side == "buy" else self._asks
                book[price].append(order)
                self._orders[req["id"]] = order

            # ── Compute response ──
            filled_qty = int(req["quantity"]) - remaining
            if filled_qty == 0:
                status = "accepted" if not is_market else "rejected"
            elif remaining == 0:
                status = "filled"
            else:
                status = "partial_fill"

            avg_price = None
            if fills:
                total_value = sum(float(f["price"]) * f["quantity"] for f in fills)
                total_qty = sum(f["quantity"] for f in fills)
                avg_price = f"{total_value / total_qty:.2f}"

            return {
                "order_id": req["id"],
                "status": status,
                "filled_qty": filled_qty,
                "remaining_qty": remaining,
                "avg_price": avg_price,
                "fills": fills,
            }

    def cancel(self, order_id: str) -> dict:
        with self._lock:
            order = self._orders.get(order_id)
            if not order:
                return {"order_id": order_id, "status": "not_found", "cancelled_qty": 0}
            book = self._bids if order["side"] == "buy" else self._asks
            level = book.get(order["price"], [])
            if order in level:
                level.remove(order)
                if not level:
                    book.pop(order["price"], None)
            cancelled_qty = order["remaining"]
            order["status"] = "cancelled"
            self._orders.pop(order_id, None)
            return {"order_id": order_id, "status": "cancelled", "cancelled_qty": cancelled_qty}

    def snapshot(self, depth: int = 10) -> dict:
        with self._lock:
            def agg(book: dict, descending: bool) -> list[dict]:
                prices = sorted(book, reverse=descending)[:depth]
                return [
                    {
                        "price": f"{p:.2f}",
                        "quantity": sum(o["remaining"] for o in book[p]),
                        "order_count": len(book[p]),
                    }
                    for p in prices
                ]

            return {
                "bids": agg(self._bids, descending=True),
                "asks": agg(self._asks, descending=False),
                "timestamp": 0,
                "sequence": self._next_seq(),
            }


# ─── HTTP handler ────────────────────────────────────────────────────────────

LOB = OrderBook()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args) -> None:
        return  # silence per-request logging — bench output gets noisy

    def _send_json(self, status: int, body: dict) -> None:
        payload = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def _read_json(self) -> dict:
        length = int(self.headers.get("Content-Length", 0))
        return json.loads(self.rfile.read(length)) if length else {}

    def do_GET(self) -> None:
        if self.path == "/health":
            self._send_json(200, {"status": "ok", "engine": "dummy_python", "version": "1.0.0"})
            return
        if self.path.startswith("/api/v1/orderbook"):
            self._send_json(200, LOB.snapshot())
            return
        self._send_json(404, {"error": "not found"})

    def do_POST(self) -> None:
        try:
            body = self._read_json()
        except Exception as e:
            self._send_json(400, {"error": f"bad JSON: {e}"})
            return

        if self.path == "/api/v1/order":
            if body.get("type") in ("limit", "ioc", "fok") and not body.get("price"):
                self._send_json(400, {"error": "Price required for limit/ioc/fok orders"})
                return
            result = LOB.submit(body)
            if "error" in result:
                self._send_json(400, result)
            else:
                self._send_json(200, result)
            return

        if self.path == "/api/v1/cancel":
            self._send_json(200, LOB.cancel(body.get("order_id", "")))
            return

        self._send_json(404, {"error": "not found"})


def main() -> None:
    port = int(os.environ.get("PORT", "8080"))
    server = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print(f"[dummy_engine] listening on 0.0.0.0:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.shutdown()


if __name__ == "__main__":
    main()
