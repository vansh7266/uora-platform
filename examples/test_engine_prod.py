"""
UORA Production Test Engine — strict spec-compliance.
Implements the same order/cancel/orderbook contract as dummy_engine.py,
which is the platform's reference spec.
"""
from __future__ import annotations
import json
import sys
import threading
import time
import uuid
from collections import defaultdict
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import urlparse


# ─── Order book ──────────────────────────────────────────────────────────────

class OrderBook:
    def __init__(self) -> None:
        self._bids: dict[float, list[dict]] = defaultdict(list)
        self._asks: dict[float, list[dict]] = defaultdict(list)
        self._orders: dict[str, dict] = {}
        self._seen_ids: set[str] = set()
        self._seq = 0
        self._lock = threading.Lock()

    def _next_seq(self) -> int:
        self._seq += 1
        return self._seq

    def submit(self, req: dict) -> dict:
        with self._lock:
            if req["id"] in self._seen_ids:
                return {"error": "Duplicate order ID"}
            self._seen_ids.add(req["id"])

            side        = req["side"]
            is_market   = req.get("type") == "market"
            price       = None if is_market else float(req["price"])
            remaining   = int(req["quantity"])
            participant = req.get("participant_id") or "default"

            fills: list[dict] = []
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
                    # Self-trade prevention
                    if resting["participant_id"] == participant:
                        i += 1
                        continue
                    trade_qty = min(remaining, resting["remaining"])
                    fills.append({
                        "fill_id": str(uuid.uuid4()),
                        "resting_order_id": resting["id"],
                        "price": f"{opp_price:.2f}",
                        "quantity": trade_qty,
                        "timestamp": req.get("timestamp", time.time_ns()),
                    })
                    resting["remaining"] -= trade_qty
                    remaining            -= trade_qty
                    if resting["remaining"] == 0:
                        resting["status"] = "filled"
                        self._orders.pop(resting["id"], None)
                        level.pop(i)
                    else:
                        resting["status"] = "partial_fill"
                        i += 1
                if not level:
                    opp.pop(opp_price, None)

            # Rest remainder for limit orders
            if remaining > 0 and not is_market:
                order = {
                    "id": req["id"], "side": side, "price": price,
                    "remaining": remaining, "participant_id": participant,
                    "status": "partial_fill" if fills else "accepted",
                }
                book = self._bids if side == "buy" else self._asks
                book[price].append(order)
                self._orders[req["id"]] = order

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
                total_qty   = sum(f["quantity"] for f in fills)
                avg_price   = f"{total_value / total_qty:.2f}"

            return {
                "order_id":      req["id"],
                "status":        status,
                "filled_qty":    filled_qty,
                "remaining_qty": remaining,
                "avg_price":     avg_price,
                "fills":         fills,
            }

    def cancel(self, order_id: str) -> dict:
        with self._lock:
            order = self._orders.get(order_id)
            if not order:
                return {"order_id": order_id, "status": "not_found", "cancelled_qty": 0}
            book  = self._bids if order["side"] == "buy" else self._asks
            level = book.get(order["price"], [])
            if order in level:
                level.remove(order)
                if not level:
                    book.pop(order["price"], None)
            cancelled_qty   = order["remaining"]
            order["status"] = "cancelled"
            self._orders.pop(order_id, None)
            return {"order_id": order_id, "status": "cancelled", "cancelled_qty": cancelled_qty}

    def snapshot(self, depth: int = 10) -> dict:
        with self._lock:
            def agg(book: dict, descending: bool) -> list[dict]:
                prices = sorted(book, reverse=descending)[:depth]
                return [
                    {
                        "price":       f"{p:.2f}",
                        "quantity":    sum(o["remaining"] for o in book[p]),
                        "order_count": len(book[p]),
                    }
                    for p in prices
                ]
            return {
                "bids":      agg(self._bids,  descending=True),
                "asks":      agg(self._asks,  descending=False),
                "timestamp": 0,
                "sequence":  self._next_seq(),
            }


# ─── HTTP server ─────────────────────────────────────────────────────────────

LOB = OrderBook()


class Handler(BaseHTTPRequestHandler):
    server_version = "TestEnginePROD/1.0"

    def log_message(self, *_args: Any) -> None:
        return  # silence default logs

    def _send_json(self, status: int, body: dict) -> None:
        payload = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def _read_json(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        raw    = self.rfile.read(length) if length else b"{}"
        return json.loads(raw or b"{}")

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/health":
            return self._send_json(200, {"status": "ok"})
        if path.startswith("/api/v1/orderbook"):
            return self._send_json(200, LOB.snapshot())
        self._send_json(404, {"error": "not found"})

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        try:
            req = self._read_json()
        except Exception as exc:
            return self._send_json(400, {"error": f"bad json: {exc}"})

        if path == "/api/v1/order":
            return self._send_json(200, LOB.submit(req))
        if path == "/api/v1/cancel":
            return self._send_json(200, LOB.cancel(req.get("order_id", "")))
        self._send_json(404, {"error": "not found"})

    def do_DELETE(self) -> None:
        prefix = "/api/v1/order/"
        if self.path.startswith(prefix):
            oid = self.path[len(prefix):]
            return self._send_json(200, LOB.cancel(oid))
        self._send_json(404, {"error": "not found"})


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    server = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print(f"test-engine-prod listening on 0.0.0.0:{port}", flush=True)
    server.serve_forever()
