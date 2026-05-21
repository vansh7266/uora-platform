"""
UORA Minimal FIX Protocol Adapter
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Provides parsing and building of standard Financial Information eXchange (FIX) 
messages to satisfy IICPC 2026 hackathon compliance.

Transforms standard FIX 4.2 messages into UORA's internal JSON-based
action schema, and vice versa.
"""

from __future__ import annotations

import time
import uuid
from typing import Any


# SOH (Start of Heading) character used as the standard FIX delimiter.
# In log files it is often represented as '|' or '^A'.
SOH = "\x01"


class FIXAdapter:
    """Minimal FIX 4.2 adapter for New Order Single (D) and Cancel (F) messages."""

    # ─── FIX to JSON (Ingress) ───────────────────────────────────────────────

    @classmethod
    def parse_message(cls, fix_string: str, delimiter: str = SOH) -> dict[str, Any]:
        """Parse a FIX message string into a UORA action dictionary."""
        # Allow pipe character for easier testing/debugging
        if delimiter not in fix_string and "|" in fix_string:
            delimiter = "|"
            
        pairs = fix_string.strip(delimiter).split(delimiter)
        tags = {}
        for pair in pairs:
            if "=" in pair:
                k, v = pair.split("=", 1)
                tags[k] = v

        msg_type = tags.get("35")
        if not msg_type:
            raise ValueError("Invalid FIX message: missing MsgType (35)")

        if msg_type == "D":  # New Order Single
            return cls._parse_new_order(tags)
        elif msg_type == "F":  # Order Cancel Request
            return cls._parse_cancel(tags)
        elif msg_type == "8":  # Execution Report
            return cls._parse_execution_report(tags)
        elif msg_type == "9":  # Order Cancel Reject
            return cls._parse_cancel_reject(tags)
        else:
            raise NotImplementedError(f"Unsupported FIX MsgType: {msg_type}")

    @classmethod
    def _parse_new_order(cls, tags: dict[str, str]) -> dict[str, Any]:
        """Convert FIX New Order Single (35=D) to UORA order dict."""
        # Side (54): 1 = Buy, 2 = Sell
        side_val = tags.get("54")
        side = "buy" if side_val == "1" else "sell" if side_val == "2" else "unknown"

        # OrdType (40): 1 = Market, 2 = Limit
        ord_type_val = tags.get("40")
        
        # TimeInForce (59): 0 = Day, 1 = GTC, 3 = IOC, 4 = FOK
        tif_val = tags.get("59", "0")

        # Map FIX types to UORA semantics
        action_type = "limit"
        if ord_type_val == "1":
            action_type = "market"
        elif tif_val == "3":
            action_type = "ioc"
        elif tif_val == "4":
            action_type = "fok"

        action = {
            "type": action_type,
            "order_id": tags.get("11", str(uuid.uuid4())),
            "side": side,
            "quantity": int(tags.get("38", 0)),
        }

        # Price is optional for Market orders
        if "44" in tags:
            action["price"] = float(tags["44"])

        return action

    @classmethod
    def _parse_cancel(cls, tags: dict[str, str]) -> dict[str, Any]:
        """Convert FIX Order Cancel Request (35=F) to UORA cancel dict."""
        return {
            "type": "cancel",
            "order_id": tags.get("41", ""),  # OrigClOrdID
        }

    @classmethod
    def _parse_execution_report(cls, tags: dict[str, str]) -> dict[str, Any]:
        """Convert FIX ExecutionReport (35=8) to the UORA response shape."""
        status_map = {
            "0": "pending",
            "1": "partial_fill",
            "2": "filled",
            "4": "cancelled",
            "8": "rejected",
        }
        status = status_map.get(tags.get("39", ""), "unknown")
        last_qty = int(float(tags.get("32", "0") or 0))
        last_price = float(tags.get("31", "0") or 0)

        fills = []
        if last_qty > 0:
            fills.append({
                "fill_id": tags.get("17", ""),
                "price": last_price,
                "quantity": last_qty,
            })

        return {
            "type": "execution_report",
            "order_id": tags.get("11", tags.get("37", "")),
            "status": status,
            "filled_qty": int(float(tags.get("14", "0") or 0)),
            "remaining_qty": int(float(tags.get("151", "0") or 0)),
            "fills": fills,
        }

    @classmethod
    def _parse_cancel_reject(cls, tags: dict[str, str]) -> dict[str, Any]:
        """Convert FIX OrderCancelReject (35=9) to a failed cancel response."""
        return {
            "type": "cancel",
            "order_id": tags.get("41", ""),
            "status": "rejected",
            "success": False,
            "error": tags.get("58", "Cancel rejected"),
        }

    # ─── JSON to FIX (Egress) ────────────────────────────────────────────────

    @classmethod
    def build_message(cls, action: dict[str, Any], sender_comp_id: str = "UORA_BOT", target_comp_id: str = "CONTESTANT", seq_num: int = 1) -> str:
        """Convert a UORA action dictionary into a raw FIX 4.2 string."""
        action_type = action.get("type", "limit").lower()
        
        if action_type == "cancel":
            tags = cls._build_cancel(action)
        else:
            tags = cls._build_new_order(action, action_type)

        # Standard header tags
        header = {
            "8": "FIX.4.2",
            "35": tags.pop("35"),  # MsgType must be third
            "49": sender_comp_id,
            "56": target_comp_id,
            "34": str(seq_num),
            "52": time.strftime("%Y%m%d-%H:%M:%S.000", time.gmtime()),
        }

        # Compile body
        body_str = "".join(f"{k}={v}{SOH}" for k, v in tags.items())
        
        # Compile header (without BodyLength 9)
        header_str = f"35={header['35']}{SOH}49={header['49']}{SOH}56={header['56']}{SOH}34={header['34']}{SOH}52={header['52']}{SOH}"
        
        # Calculate BodyLength (MsgType onwards, until CheckSum)
        body_length = len(header_str) + len(body_str)
        
        # Assemble message before checksum
        msg_core = f"8=FIX.4.2{SOH}9={body_length}{SOH}{header_str}{body_str}"
        
        # Calculate CheckSum (modulo 256 of ASCII values)
        checksum = sum(ord(c) for c in msg_core) % 256
        
        return f"{msg_core}10={checksum:03d}{SOH}"

    @classmethod
    def _build_new_order(cls, action: dict[str, Any], action_type: str) -> dict[str, str]:
        tags = {
            "35": "D",  # New Order Single
            "11": action.get("order_id", action.get("id", str(uuid.uuid4()))),
            "54": "1" if action.get("side") == "buy" else "2",
            "38": str(action.get("quantity", action.get("qty", 0))),
            "40": "2",  # Default to Limit
        }

        if action_type == "market":
            tags["40"] = "1"
        elif action_type == "ioc":
            tags["59"] = "3"
        elif action_type == "fok":
            tags["59"] = "4"

        if "price" in action:
            tags["44"] = str(action["price"])

        return tags

    @classmethod
    def _build_cancel(cls, action: dict[str, Any]) -> dict[str, str]:
        return {
            "35": "F",  # Order Cancel Request
            "11": str(uuid.uuid4()),  # New ID for the cancel request itself
            "41": action.get("order_id", ""),  # OrigClOrdID (ID of order to cancel)
        }
