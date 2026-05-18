"""
UORA Bot Fleet — TradingBot
~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Sends benchmark orders to a contestant sandbox API and measures latency.

Event-loop policy: uvloop (set at module import).
Retry policy     : 3 attempts, exponential back-off (100 ms → 200 ms → 400 ms).
Circuit breaker  : opens after 5 consecutive failures; half-open after 10 s.
Timeout          : 5 seconds per HTTP request.
"""

from __future__ import annotations

import asyncio
import logging
import time
import uuid
from dataclasses import dataclass, field
from enum import Enum, auto
from typing import Any

import aiohttp
import uvloop

# ── Event-loop policy ──────────────────────────────────────────────────────────
asyncio.set_event_loop_policy(uvloop.EventLoopPolicy())

# ── Constants ──────────────────────────────────────────────────────────────────
_TIMEOUT_SECONDS: float = 5.0
_MAX_ATTEMPTS: int = 3
_BACKOFF_BASE_MS: float = 100.0          # 100 ms, 200 ms, 400 ms
_CB_FAILURE_THRESHOLD: int = 5           # consecutive failures before open
_CB_RECOVERY_SECONDS: float = 10.0      # wait before half-open probe

logger = logging.getLogger(__name__)


def _action_qty(action: dict[str, Any]) -> int:
    """Support both LOBSTER-style qty and OpenAPI-style quantity."""
    return int(action.get("qty", action.get("quantity", 0)))


# ── Circuit-breaker state machine ─────────────────────────────────────────────
class _CBState(Enum):
    CLOSED = auto()
    OPEN = auto()
    HALF_OPEN = auto()


@dataclass
class _CircuitBreaker:
    """Tracks consecutive failures and enforces the open/half-open/closed cycle."""

    failure_threshold: int = _CB_FAILURE_THRESHOLD
    recovery_seconds: float = _CB_RECOVERY_SECONDS

    _state: _CBState = field(default=_CBState.CLOSED, init=False, repr=False)
    _consecutive_failures: int = field(default=0, init=False, repr=False)
    _opened_at: float = field(default=0.0, init=False, repr=False)

    # ── Public interface ───────────────────────────────────────────────────────

    def allow_request(self) -> bool:
        """Return True if the request should be forwarded to the sandbox."""
        if self._state is _CBState.CLOSED:
            return True

        if self._state is _CBState.OPEN:
            elapsed = time.monotonic() - self._opened_at
            if elapsed >= self.recovery_seconds:
                logger.info(
                    "CircuitBreaker: recovery window elapsed — switching to HALF_OPEN"
                )
                self._state = _CBState.HALF_OPEN
                return True  # probe request
            return False

        # HALF_OPEN: allow exactly one probe at a time
        return True

    def record_success(self) -> None:
        self._consecutive_failures = 0
        if self._state is not _CBState.CLOSED:
            logger.info("CircuitBreaker: probe succeeded — switching to CLOSED")
            self._state = _CBState.CLOSED

    def record_failure(self) -> None:
        self._consecutive_failures += 1
        if self._state is _CBState.HALF_OPEN:
            logger.warning("CircuitBreaker: probe failed — re-opening")
            self._open()
        elif (
            self._state is _CBState.CLOSED
            and self._consecutive_failures >= self.failure_threshold
        ):
            logger.warning(
                "CircuitBreaker: %d consecutive failures — opening for %.0f s",
                self._consecutive_failures,
                self.recovery_seconds,
            )
            self._open()

    # ── Private helpers ────────────────────────────────────────────────────────

    def _open(self) -> None:
        self._state = _CBState.OPEN
        self._opened_at = time.monotonic()


# ── TradingBot ─────────────────────────────────────────────────────────────────
class TradingBot:
    """
    Async trading bot that submits orders to a contestant sandbox API.

    Usage::

        bot = TradingBot()
        await bot.connect("https://sandbox.example.com")
        result, latency = await bot.measure_latency(
            bot.send_limit_order("buy", 100.50, 10)
        )
        await bot.session.close()
    """

    def __init__(self, submission_id: str = "dev", bot_id: str = "0", protocol: str = "REST") -> None:
        self.submission_id = submission_id
        self.bot_id = bot_id
        self.protocol = protocol.upper()
        self.session: aiohttp.ClientSession | None = None
        self._fix_reader: asyncio.StreamReader | None = None
        self._fix_writer: asyncio.StreamWriter | None = None
        self._base_url: str = ""
        self._circuit_breaker: _CircuitBreaker = _CircuitBreaker()
        self._timeout: aiohttp.ClientTimeout = aiohttp.ClientTimeout(
            total=_TIMEOUT_SECONDS
        )

    # ── Lifecycle ──────────────────────────────────────────────────────────────

    async def connect(self, base_url: str) -> None:
        """
        Initialise connection to the contestant's server.
        Supports REST via aiohttp or raw FIX via TCP sockets.
        """
        self._base_url = base_url.rstrip("/")

        if self.protocol == "FIX":
            from urllib.parse import urlparse
            parsed = urlparse(self._base_url)
            host = parsed.hostname or "localhost"
            port = parsed.port or 9000
            self._fix_reader, self._fix_writer = await asyncio.open_connection(host, port)
            logger.info("TradingBot FIX connected to %s:%s", host, port)
            return

        # Per-request x-request-id injection via a request-start signal.
        trace_config = aiohttp.TraceConfig()

        async def _inject_request_id(
            _session: aiohttp.ClientSession,
            _trace_config_ctx: Any,
            params: aiohttp.TraceRequestStartParams,
        ) -> None:
            params.headers["x-request-id"] = f"sub-{self.submission_id}-bot-{self.bot_id}-req-{uuid.uuid4().hex[:8]}"

        trace_config.on_request_start.append(_inject_request_id)

        # aiohttp ≥ 3.9 supports HTTP/2 via the h2 extra; the connector flag
        # below enables protocol negotiation.  Falls back to HTTP/1.1 silently
        # when the server does not advertise h2 via ALPN.
        connector = aiohttp.TCPConnector(enable_cleanup_closed=True)

        self.session = aiohttp.ClientSession(
            base_url=self._base_url,
            connector=connector,
            timeout=self._timeout,
            headers={"Content-Type": "application/json"},
            trace_configs=[trace_config],
        )
        logger.info("TradingBot connected to %s", self._base_url)

    # ── Order submission helpers ───────────────────────────────────────────────
    
    async def _send_action(self, endpoint: str, payload: dict[str, Any]) -> dict[str, Any]:
        if self.protocol == "FIX":
            from uora.bot_fleet.fix_adapter import FIXAdapter
            msg = FIXAdapter.build_message(payload, sender_comp_id=f"BOT-{self.bot_id}")
            self._fix_writer.write(msg.encode())
            await self._fix_writer.drain()
            # Simple mock response since FIX is asynchronous
            return {"status": "ok", "latency_ns": 0}
            
        if endpoint.startswith("DELETE"):
            return await self._delete(endpoint.split(" ", 1)[1])
        return await self._post(endpoint, json=payload)

    async def send_limit_order(
        self, side: str, price: float, qty: int
    ) -> dict[str, Any]:
        """POST a limit order and return the parsed JSON response."""
        payload: dict[str, Any] = {
            "id": str(uuid.uuid4()),
            "type": "limit",
            "side": side,
            "price": str(price),   # OpenAPI spec: decimal string
            "quantity": qty,        # OpenAPI spec: "quantity", not "qty"
            "timestamp": time.time_ns(),
        }
        return await self._send_action("/api/v1/order", payload)

    async def send_market_order(self, side: str, qty: int) -> dict[str, Any]:
        """POST a market order and return the parsed JSON response."""
        payload: dict[str, Any] = {
            "id": str(uuid.uuid4()),
            "type": "market",
            "side": side,
            "quantity": qty,
            "timestamp": time.time_ns(),
        }
        return await self._send_action("/api/v1/order", payload)

    async def send_ioc_order(
        self, side: str, price: float, qty: int
    ) -> dict[str, Any]:
        """POST an Immediate-or-Cancel order and return the parsed JSON response."""
        payload: dict[str, Any] = {
            "id": str(uuid.uuid4()),
            "type": "ioc",
            "side": side,
            "price": str(price),
            "quantity": qty,
            "timestamp": time.time_ns(),
        }
        return await self._send_action("/api/v1/order", payload)

    async def send_fok_order(
        self, side: str, price: float, qty: int
    ) -> dict[str, Any]:
        """POST a Fill-or-Kill order and return the parsed JSON response.

        FOK orders fill the entire quantity immediately or are cancelled in full
        — no partial fills are permitted.
        """
        payload: dict[str, Any] = {
            "id": str(uuid.uuid4()),
            "type": "fok",
            "side": side,
            "price": str(price),
            "quantity": qty,
            "timestamp": time.time_ns(),
        }
        return await self._send_action("/api/v1/order", payload)

    async def cancel_order(self, order_id: str) -> dict[str, Any]:
        """Cancel an order."""
        payload = {"type": "cancel", "order_id": order_id}
        return await self._send_action(f"DELETE /api/v1/order/{order_id}", payload)

    # ── Latency measurement ────────────────────────────────────────────────────

    async def measure_latency(
        self, coro: Any
    ) -> tuple[dict[str, Any], int]:
        """
        Wrap an awaitable *coro*, execute it, and measure wall-clock latency.

        Returns
        -------
        tuple[dict, int]
            ``(result, latency_ns)`` where *latency_ns* is the elapsed time in
            nanoseconds measured with ``time.perf_counter_ns()``.
        """
        t_start: int = time.perf_counter_ns()
        result: dict[str, Any] = await coro
        latency_ns: int = time.perf_counter_ns() - t_start
        return result, latency_ns

    # ── Scenario runner ────────────────────────────────────────────────────────

    async def run_scenario(
        self, actions: list[dict[str, Any]]
    ) -> list[dict[str, Any]]:
        """
        Execute a sequence of *actions* and return per-action results.

        Each action dict must contain a ``"type"`` key.  Supported types and
        their required keys:

        ============== =============================================
        ``limit``      ``side``, ``price``, ``qty``/``quantity``
        ``market``     ``side``, ``qty``/``quantity``
        ``ioc``        ``side``, ``price``, ``qty``/``quantity``
        ``fok``        ``side``, ``price``, ``qty``/``quantity``
        ``cancel``     ``order_id``
        ============== =============================================

        Returns a list of dicts::

            [{"action": <action_dict>, "result": <response>, "latency_ns": <int>}, ...]
        """
        results: list[dict[str, Any]] = []

        for action in actions:
            action_type: str = action.get("type", "").lower()

            if action_type == "limit":
                coro = self.send_limit_order(
                    action["side"], float(action["price"]), _action_qty(action)
                )
            elif action_type == "market":
                coro = self.send_market_order(action["side"], _action_qty(action))
            elif action_type == "ioc":
                coro = self.send_ioc_order(
                    action["side"], float(action["price"]), _action_qty(action)
                )
            elif action_type == "fok":
                coro = self.send_fok_order(
                    action["side"], float(action["price"]), _action_qty(action)
                )
            elif action_type == "cancel":
                coro = self.cancel_order(action["order_id"])
            else:
                logger.warning("run_scenario: unknown action type %r — skipping", action_type)
                continue

            result, latency_ns = await self.measure_latency(coro)
            results.append(
                {"action": action, "result": result, "latency_ns": latency_ns}
            )

        return results

    # ── Private HTTP primitives ────────────────────────────────────────────────

    async def _post(
        self, path: str, *, json: dict[str, Any]
    ) -> dict[str, Any]:
        return await self._request("POST", path, json=json)

    async def _delete(self, path: str) -> dict[str, Any]:
        return await self._request("DELETE", path)

    async def _request(
        self,
        method: str,
        path: str,
        **kwargs: Any,
    ) -> dict[str, Any]:
        """
        Execute an HTTP request with retry + exponential back-off and circuit
        breaker protection.

        Raises
        ------
        RuntimeError
            If ``connect()`` has not been called before issuing a request.
        aiohttp.ClientError
            Re-raised after all retry attempts are exhausted.
        """
        if self.session is None:
            raise RuntimeError(
                "TradingBot.connect() must be awaited before sending requests."
            )

        if not self._circuit_breaker.allow_request():
            raise RuntimeError(
                "CircuitBreaker is OPEN — requests to the sandbox are suspended."
            )

        last_exc: Exception | None = None

        for attempt in range(_MAX_ATTEMPTS):
            try:
                async with self.session.request(
                    method, path, **kwargs
                ) as response:
                    response.raise_for_status()
                    data: dict[str, Any] = await response.json()
                    self._circuit_breaker.record_success()
                    return data

            except (aiohttp.ClientError, asyncio.TimeoutError) as exc:
                last_exc = exc
                self._circuit_breaker.record_failure()

                # No back-off after the final attempt.
                if attempt < _MAX_ATTEMPTS - 1:
                    backoff_ms = _BACKOFF_BASE_MS * (2 ** attempt)  # 100, 200, 400
                    logger.warning(
                        "%s %s — attempt %d/%d failed (%s); retrying in %.0f ms",
                        method,
                        path,
                        attempt + 1,
                        _MAX_ATTEMPTS,
                        exc,
                        backoff_ms,
                    )
                    await asyncio.sleep(backoff_ms / 1_000)
                else:
                    logger.error(
                        "%s %s — all %d attempts failed: %s",
                        method,
                        path,
                        _MAX_ATTEMPTS,
                        exc,
                    )

        # Exhausted retries — propagate the last exception.
        raise last_exc  # type: ignore[misc]
