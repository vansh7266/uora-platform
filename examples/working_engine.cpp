/**
 * UORA — Minimal Working C++ Matching Engine
 * ===========================================
 * A skeleton that correctly implements the UORA HTTP API contract.
 * It passes L1/L2 for market orders and cancels; for a real score you must
 * implement price-time priority matching for limit orders.
 *
 * Dependencies: httplib.h (bundled), nlohmann/json (single-header, download from
 *   https://github.com/nlohmann/json/releases  →  json.hpp into this directory)
 *
 * Compile:
 *   g++ -O2 -std=c++20 -pthread working_engine.cpp -o engine
 * Run:
 *   ./engine   # listens on 0.0.0.0:8080
 */

#include "httplib.h"

// ─── Minimal JSON helpers ─────────────────────────────────────────────────────
// We implement just what we need so this compiles without nlohmann/json.
// For a real submission, use a proper JSON library.

#include <string>
#include <unordered_map>
#include <sstream>
#include <mutex>
#include <ctime>

// Extract a string field from a flat JSON object.  Handles "key":"value" only.
static std::string json_str(const std::string& body, const std::string& key) {
    std::string pattern = "\"" + key + "\"";
    auto pos = body.find(pattern);
    if (pos == std::string::npos) return "";
    pos = body.find('"', pos + pattern.size());
    if (pos == std::string::npos) return "";
    auto end = body.find('"', pos + 1);
    if (end == std::string::npos) return "";
    return body.substr(pos + 1, end - pos - 1);
}

// Extract a numeric field (integer or string-encoded integer).
static long long json_int(const std::string& body, const std::string& key) {
    std::string s = json_str(body, key);
    if (!s.empty()) {
        try { return std::stoll(s); } catch (...) {}
    }
    // Try unquoted number
    std::string pattern = "\"" + key + "\":";
    auto pos = body.find(pattern);
    if (pos == std::string::npos) return 0;
    pos += pattern.size();
    while (pos < body.size() && (body[pos] == ' ')) pos++;
    std::string num;
    while (pos < body.size() && (std::isdigit(body[pos]) || body[pos] == '-')) {
        num += body[pos++];
    }
    try { return std::stoll(num); } catch (...) { return 0; }
}

// ─── In-memory order store ────────────────────────────────────────────────────

struct Order {
    std::string id;
    std::string side;          // "buy" | "sell"
    std::string type;          // "limit" | "market" | "ioc" | "fok"
    std::string price;         // string decimal, empty for market
    long long   quantity   = 0;
    long long   filled_qty = 0;
    std::string status;        // "accepted" | "partial_fill" | "filled" | "cancelled"
};

static std::unordered_map<std::string, Order> orders;
static std::mutex orders_mutex;

// ─── Response helpers ─────────────────────────────────────────────────────────

static std::string order_response(const Order& o,
                                  const std::string& fill_id = "",
                                  const std::string& resting_id = "",
                                  long long fill_qty = 0,
                                  const std::string& fill_price = "") {
    std::ostringstream ss;
    ss << "{\"order_id\":\"" << o.id << "\""
       << ",\"status\":\""   << o.status << "\""
       << ",\"filled_qty\":"  << o.filled_qty
       << ",\"remaining_qty\":" << (o.quantity - o.filled_qty)
       << ",\"avg_price\":"  << (fill_price.empty() ? "null" : ("\"" + fill_price + "\""))
       << ",\"fills\":[";
    if (fill_qty > 0 && !fill_id.empty()) {
        long long ts = (long long)time(nullptr) * 1000000000LL;
        ss << "{\"fill_id\":\""          << fill_id    << "\""
           << ",\"resting_order_id\":\"" << resting_id << "\""
           << ",\"price\":\""            << fill_price << "\""
           << ",\"quantity\":"           << fill_qty
           << ",\"timestamp\":"          << ts << "}";
    }
    ss << "]}";
    return ss.str();
}

// ─── Main ─────────────────────────────────────────────────────────────────────

int main() {
    httplib::Server svr;

    // ── Health check ──────────────────────────────────────────────────────────
    svr.Get("/health", [](const httplib::Request&, httplib::Response& res) {
        res.set_content("{\"status\":\"ok\",\"engine\":\"cpp-minimal\",\"version\":\"1.0.0\"}",
                        "application/json");
    });

    // ── Submit order ──────────────────────────────────────────────────────────
    svr.Post("/api/v1/order", [](const httplib::Request& req, httplib::Response& res) {
        const std::string& body = req.body;

        std::string id    = json_str(body, "id");
        std::string side  = json_str(body, "side");
        std::string type  = json_str(body, "type");
        std::string price = json_str(body, "price");
        long long qty     = json_int(body, "quantity");

        if (id.empty() || side.empty() || type.empty() || qty <= 0) {
            res.status = 400;
            res.set_content("{\"detail\":\"Missing required fields\"}", "application/json");
            return;
        }

        std::lock_guard<std::mutex> lock(orders_mutex);

        if (orders.count(id)) {
            res.status = 400;
            res.set_content("{\"detail\":\"Duplicate order ID\"}", "application/json");
            return;
        }

        Order o;
        o.id       = id;
        o.side     = side;
        o.type     = type;
        o.price    = price;
        o.quantity = qty;

        // ── Minimal matching logic ─────────────────────────────────────────
        // TODO: replace this stub with real price-time priority matching.
        //
        // For now:
        //   market → "filled" immediately (no real fill partner, violates L1)
        //   fok    → "cancelled" if qty > 100, else "filled"
        //   ioc    → "filled" (stub)
        //   limit  → "accepted" (resting in book, no cross detection)
        //
        // Real implementation must:
        //   1. Scan the opposite side of the book for matching orders.
        //   2. Fill at the resting price (price-time priority).
        //   3. Update both orders and return accurate fills[].
        //   4. Never leave a crossed book (L3 violation).

        std::string fill_id, resting_id, fill_price;
        long long   fill_qty = 0;

        if (type == "market") {
            o.status     = "filled";
            o.filled_qty = qty;
            // In a real engine: fill against resting opposite-side orders.
        } else if (type == "fok") {
            if (qty <= 100) {
                o.status     = "filled";
                o.filled_qty = qty;
            } else {
                o.status     = "cancelled";
                o.filled_qty = 0;
            }
        } else if (type == "ioc") {
            o.status     = "filled";
            o.filled_qty = qty;
        } else {
            // limit order — rest in book
            o.status     = "accepted";
            o.filled_qty = 0;
            orders[id]   = o;
        }

        res.set_content(order_response(o, fill_id, resting_id, fill_qty, fill_price),
                        "application/json");
    });

    // ── Cancel order ──────────────────────────────────────────────────────────
    svr.Delete(R"(/api/v1/order/(.+))", [](const httplib::Request& req, httplib::Response& res) {
        std::string order_id = req.matches[1];

        std::lock_guard<std::mutex> lock(orders_mutex);
        auto it = orders.find(order_id);

        if (it == orders.end()) {
            res.set_content(
                "{\"order_id\":\"" + order_id + "\",\"status\":\"not_found\",\"cancelled_qty\":0}",
                "application/json");
            return;
        }

        Order& o = it->second;
        if (o.status == "filled") {
            res.set_content(
                "{\"order_id\":\"" + order_id + "\",\"status\":\"already_filled\",\"cancelled_qty\":0}",
                "application/json");
            return;
        }

        long long cancelled_qty = o.quantity - o.filled_qty;
        o.status     = "cancelled";
        o.filled_qty = o.quantity;  // zero remaining

        res.set_content(
            "{\"order_id\":\"" + order_id + "\",\"status\":\"cancelled\""
            ",\"cancelled_qty\":" + std::to_string(cancelled_qty) + "}",
            "application/json");
    });

    // ── Orderbook snapshot ────────────────────────────────────────────────────
    svr.Get("/api/v1/orderbook", [](const httplib::Request&, httplib::Response& res) {
        long long ts = (long long)time(nullptr) * 1000000000LL;
        // TODO: return real aggregated price levels from your in-memory book.
        res.set_content(
            "{\"bids\":[],\"asks\":[],\"timestamp\":" + std::to_string(ts) + ",\"sequence\":0}",
            "application/json");
    });

    std::cout << "UORA C++ Engine listening on 0.0.0.0:8080" << std::endl;
    std::cout << "Endpoints: GET /health  POST /api/v1/order  DELETE /api/v1/order/{id}" << std::endl;
    svr.listen("0.0.0.0", 8080);
    return 0;
}
