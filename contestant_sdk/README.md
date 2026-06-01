# UORA Contestant SDK

Everything you need to build, test, and submit a matching engine to the UORA platform.

---

## Table of Contents

1. [What You Need to Build](#1-what-you-need-to-build)
2. [HTTP API Contract](#2-http-api-contract)
3. [Order Lifecycle](#3-order-lifecycle)
4. [Request & Response Schemas](#4-request--response-schemas)
5. [Local Testing with the Reference Server](#5-local-testing-with-the-reference-server)
6. [How to Submit](#6-how-to-submit)
7. [Scoring Formula](#7-scoring-formula)
8. [Validation Levels (L1–L4)](#8-validation-levels-l1l4)
9. [Common Pitfalls](#9-common-pitfalls)

---

## 1. What You Need to Build

Your submission is a **matching engine** — an HTTP server that accepts order flow, maintains an in-memory limit order book, and returns the correct fill/status information.

The UORA bot fleet will send thousands of HTTP requests per second to your engine during the benchmark. The platform:

- Measures **latency** (p50/p90/p99) and **throughput** (orders/sec)
- Validates **correctness** by replaying the same order stream through a reference LOB and comparing fills, statuses, and prices
- Detects **cheating** using an ML anomaly detector (Isolation Forest on 8 features)
- Computes a **composite score** and ranks all submissions on the live leaderboard

Your engine must listen on **port 8080** and implement the three endpoints below.

---

## 2. HTTP API Contract

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check — must return `{"status": "ok"}` |
| `POST` | `/api/v1/order` | Submit a new order |
| `DELETE` | `/api/v1/order/{order_id}` | Cancel an existing order |

Your engine does **not** need to implement authentication — the platform handles that at the proxy layer.

---

## 3. Order Lifecycle

```
                    ┌───────────────────────────────────────┐
                    │           Order State Machine          │
                    └───────────────────────────────────────┘

              submit_order()
                    │
                    ▼
              ┌─────────┐
              │ pending │  ← resting in book (not yet matched)
              └────┬────┘
                   │
          ┌────────┴─────────┐
          │                  │
          ▼                  ▼
   ┌──────────────┐    ┌──────────┐
   │ partial_fill │    │  filled  │  ← terminal, no cancel possible
   └──────┬───────┘    └──────────┘
          │
     ┌────┴────┐
     │         │
     ▼         ▼
┌────────┐ ┌──────────┐
│ filled │ │cancelled │  ← terminal states
└────────┘ └──────────┘
```

**Public API aliases:**  
The platform accepts `"accepted"` as an alias for `"pending"` (some engines return `accepted` instead of `pending` on initial submission — both are treated identically by the validator).

---

## 4. Request & Response Schemas

### `POST /api/v1/order` — Submit Order

**Request body:**
```json
{
  "id":           "ord-uuid-001",
  "side":         "buy",
  "type":         "limit",
  "price":        "100.50",
  "quantity":     50,
  "timestamp":    1717200000000000000,
  "participant_id": "team-tachyon"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | ✓ | Unique order identifier |
| `side` | `"buy"` \| `"sell"` | ✓ | |
| `type` | `"limit"` \| `"market"` \| `"ioc"` \| `"fok"` | ✓ | |
| `price` | string (decimal) | Required for limit/ioc/fok | Omit for market orders |
| `quantity` | integer | ✓ | Positive, ≤ 1,000,000 |
| `timestamp` | integer | ✓ | Nanoseconds since epoch |
| `participant_id` | string | optional | |

**Response body:**
```json
{
  "order_id":     "ord-uuid-001",
  "status":       "accepted",
  "filled_qty":   0,
  "remaining_qty": 50,
  "avg_price":    null,
  "fills":        []
}
```

**Response with fills** (when a buy at 101 crosses a resting sell at 100):
```json
{
  "order_id":     "ord-uuid-002",
  "status":       "filled",
  "filled_qty":   50,
  "remaining_qty": 0,
  "avg_price":    "100.00",
  "fills": [
    {
      "fill_id":          "fill-abc",
      "resting_order_id": "ord-uuid-001",
      "price":            "100.00",
      "quantity":         50,
      "timestamp":        1717200000001000000
    }
  ]
}
```

| Field | Type | Notes |
|---|---|---|
| `order_id` | string | Echo of the request `id` |
| `status` | string | `pending` / `accepted` / `partial_fill` / `filled` / `cancelled` |
| `filled_qty` | integer | Total matched quantity |
| `remaining_qty` | integer | Quantity still in book |
| `avg_price` | string \| null | Average fill price if any fills occurred |
| `fills` | array | One entry per individual fill (see below) |

**Fill object:**

| Field | Type | Notes |
|---|---|---|
| `fill_id` | string | Unique fill identifier |
| `resting_order_id` | string | The order that was resting in the book |
| `price` | string | The price at which the fill occurred |
| `quantity` | integer | Matched quantity |
| `timestamp` | integer | Nanoseconds since epoch |

---

### `DELETE /api/v1/order/{order_id}` — Cancel Order

**No request body.**

**Response body:**
```json
{
  "order_id":     "ord-uuid-001",
  "status":       "cancelled",
  "cancelled_qty": 50
}
```

| Status | Meaning |
|---|---|
| `cancelled` | Successfully cancelled; `cancelled_qty` = remaining_qty before cancel |
| `already_filled` | Order was already fully filled; `cancelled_qty` = 0 |
| `not_found` | Unknown order ID; `cancelled_qty` = 0 |

---

### `GET /health`

```json
{ "status": "ok" }
```

---

## 5. Local Testing with the Reference Server

The `python/reference_server.py` is a complete, correct implementation of the API using the same reference LOB the platform uses for validation. Use it to:

- Verify your bot client sends the right request format
- Check your understanding of fill semantics
- Run the integration test suite

```bash
# Install dependencies
pip install -e ".[dev]"

# Start the reference server
python contestant_sdk/python/reference_server.py
# Listening on http://localhost:8080

# In another terminal — run the bot integration test
python tests/integration/test_bot.py
```

The reference server is 100% deterministic: the same sequence of orders always produces the same fills and statuses.

---

## 6. How to Submit

1. **Write your engine.** It must:
   - Listen on port `8080`
   - Implement `/health`, `POST /api/v1/order`, `DELETE /api/v1/order/{order_id}`
   - Return the JSON schemas above

2. **Package your code.**

   | Language | Accepted formats |
   |---|---|
   | C++20 | `.cpp`, `.cc`, `.cxx`, `source.tar.gz` (multi-file) |
   | Rust | `source.tar.gz` with `Cargo.toml` |
   | Go | `source.tar.gz` with `go.mod` |

3. **Upload via the dashboard.** Drag your file onto the Submission Panel. The platform will:
   - Compile it in a BuildKit sandbox
   - Deploy it in a gVisor-isolated container
   - Run the benchmark bot fleet against it
   - Validate fills and statuses against the reference LOB
   - Compute and publish your score

4. **Watch the leaderboard.** Results appear in real time.

**File size limit:** 50 MB  
**Submission rate limit:** 5 per hour per account

---

## 7. Scoring Formula

```
                throughput × correctness_rate × success_rate
score = ─────────────────────────────────────────────────────────
             p99_latency_ms + resource_penalty²

                            ⌊ denominator floored at 1.0 ⌋
```

| Term | What it is | Effect |
|---|---|---|
| `throughput` | Orders per second your engine handles | Higher = better |
| `correctness_rate` | Fraction of actions with fills/status matching reference | **Multiplicative gate** — 50% correct halves your score |
| `success_rate` | Fraction of HTTP 2xx responses | Another multiplicative gate |
| `p99_latency_ms` | 99th-percentile latency in milliseconds | Additive penalty in denominator |
| `resource_penalty²` | Container CPU/memory usage, squared | Convex penalty — waste is punished harder |

**To score well:** high throughput with correct fills, low tail latency, and lean resource usage.

**Floor:** the denominator is always ≥ 1.0, so a zero-latency engine can't score infinitely.

---

## 8. Validation Levels (L1–L4)

The platform runs four levels of validation. Each level can add violations that reduce your `correctness_rate`.

| Level | What is checked | Common fail |
|---|---|---|
| **L1** | Fill counts, fill prices, fill quantities | Price-time priority violation |
| **L2** | Order status matches reference (pending/partial_fill/filled/cancelled) | Reporting "filled" when reference says "pending" |
| **L3** | Contestant's implied book isn't crossed (no bid ≥ ask resting simultaneously) | Failing to match an aggressor order |
| **L4** | Order state-graph similarity vs. reference | Non-deterministic behaviour across identical inputs |

Each violation reduces `correctness_rate` by `1/total_actions`. Zero violations = `correctness_rate = 1.0`.

---

## 9. Common Pitfalls

**1. Returning wrong status string**  
Use `"pending"` (or `"accepted"`) for an order that rests in the book — not `"queued"`, `"open"`, or `"new"`.

**2. Missing fills when orders cross**  
If a buy at price 101 arrives and there's a resting sell at 100, both should be filled (or partially filled). Returning `"pending"` for the buy is an L3 violation.

**3. Wrong fill price**  
Fill price is the **resting order's price** (price-time priority). A buy at 101 crossing a sell at 100 fills at **100**, not 101.

**4. Responding 200 OK with an error body**  
HTTP status codes must match outcome. A rejected order should be `400`, not `200` with `"status": "error"`.

**5. Non-deterministic responses**  
The same order ID submitted twice should return the same result (or `400 Duplicate`). Random fill prices or non-reproducible fill sequences trigger L4 violations.

**6. Not parsing `order_id` correctly**  
Your cancel endpoint receives the order ID in the URL path (`/api/v1/order/{order_id}`), not in a request body.

**7. Ignoring the `participant_id` field**  
You don't need to do anything special with it, but don't reject requests that include it.
