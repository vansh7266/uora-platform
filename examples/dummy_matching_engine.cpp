/*
 * UORA Contestant Submission — C++20 Matching Engine
 *
 * This implements a simple limit-order-book matching engine that
 * follows price-time priority. It reads JSON orders from stdin
 * and writes execution reports to stdout.
 *
 * Build: g++ -std=c++20 -O2 -o matching_engine matching_engine.cpp
 * Run:   ./matching_engine < orders.jsonl
 */

#include <algorithm>
#include <chrono>
#include <cstdint>
#include <iostream>
#include <map>
#include <sstream>
#include <string>

// --- Order Side ---
enum class Side { BUY, SELL };

// --- Order Structure ---
struct Order {
  uint64_t order_id;
  Side side;
  double price;
  uint32_t quantity;
  uint64_t timestamp_ns;
  uint32_t remaining_qty;
};

// --- Execution Report ---
struct Execution {
  uint64_t order_id;
  double price;
  uint32_t filled_qty;
  uint64_t counterparty_id;
  std::string action; // "fill" or "open" or "cancel"
};

// --- Limit Order Book ---
class OrderBook {
private:
  // Bids: sorted descending by price, then ascending by time
  std::map<double, std::vector<Order>, std::greater<double>> bids_;
  // Asks: sorted ascending by price, then ascending by time
  std::map<double, std::vector<Order>> asks_;

  std::vector<Execution> match_order(Order &incoming) {
    std::vector<Execution> execs;

    auto match_against_asks = [&](auto &book) {
      for (auto it = book.begin();
           it != book.end() && incoming.remaining_qty > 0;) {
        double best_price = it->first;

        // Check if price crosses
        if (incoming.side == Side::BUY && best_price > incoming.price)
          break;
        if (incoming.side == Side::SELL && best_price < incoming.price)
          break;

        auto &level = it->second;
        for (auto lit = level.begin();
             lit != level.end() && incoming.remaining_qty > 0;) {
          uint32_t fill_qty =
              std::min(incoming.remaining_qty, lit->remaining_qty);

          Execution exec;
          exec.order_id = incoming.order_id;
          exec.price = lit->price;
          exec.filled_qty = fill_qty;
          exec.counterparty_id = lit->order_id;
          exec.action = "fill";
          execs.push_back(exec);

          lit->remaining_qty -= fill_qty;
          incoming.remaining_qty -= fill_qty;

          if (lit->remaining_qty == 0) {
            lit = level.erase(lit);
          } else {
            ++lit;
          }
        }

        if (level.empty()) {
          it = book.erase(it);
        } else {
          ++it;
        }
      }
    };

    if (incoming.side == Side::BUY) {
      match_against_asks(asks_);
    } else {
      match_against_asks(bids_);
    }

    return execs;
  }

public:
  std::vector<Execution> process(Order order) {
    auto execs = match_order(order);

    // If remaining qty, add to book
    if (order.remaining_qty > 0) {
      Execution open_exec;
      open_exec.order_id = order.order_id;
      open_exec.price = order.price;
      open_exec.filled_qty = 0;
      open_exec.counterparty_id = 0;
      open_exec.action = "open";
      execs.push_back(open_exec);

      if (order.side == Side::BUY) {
        bids_[order.price].push_back(order);
      } else {
        asks_[order.price].push_back(order);
      }
    }

    return execs;
  }

  // Get best bid/ask
  double best_bid() const {
    if (bids_.empty())
      return 0.0;
    return bids_.begin()->first;
  }

  double best_ask() const {
    if (asks_.empty())
      return 0.0;
    return asks_.begin()->first;
  }

  uint32_t bid_depth() const {
    uint32_t total = 0;
    for (const auto &[_, orders] : bids_) {
      for (const auto &o : orders)
        total += o.remaining_qty;
    }
    return total;
  }

  uint32_t ask_depth() const {
    uint32_t total = 0;
    for (const auto &[_, orders] : asks_) {
      for (const auto &o : orders)
        total += o.remaining_qty;
    }
    return total;
  }
};

// --- Simple JSON parser for order input ---
Order parse_order(const std::string &line) {
  Order o;
  o.remaining_qty = 0;

  // Minimal JSON parsing — extracts values between quotes/colons
  auto extract = [&](const std::string &key) -> std::string {
    auto pos = line.find("\"" + key + "\"");
    if (pos == std::string::npos)
      return "";
    pos = line.find(":", pos + key.size() + 2);
    if (pos == std::string::npos)
      return "";
    pos++;
    while (pos < line.size() && (line[pos] == ' ' || line[pos] == '"'))
      pos++;
    std::string val;
    while (pos < line.size() && line[pos] != ',' && line[pos] != '}' &&
           line[pos] != '"') {
      val += line[pos++];
    }
    return val;
  };

  o.order_id = std::stoull(extract("order_id"));
  o.price = std::stod(extract("price"));
  o.quantity = std::stoul(extract("qty"));
  o.remaining_qty = o.quantity;
  o.timestamp_ns = std::stoull(extract("timestamp"));

  std::string side = extract("side");
  o.side = (side == "BUY" || side == "buy") ? Side::BUY : Side::SELL;

  return o;
}

int main() {
  OrderBook book;
  std::string line;

  // Process orders from stdin (JSONL format)
  while (std::getline(std::cin, line)) {
    if (line.empty() || line[0] == '#')
      continue;

    try {
      Order order = parse_order(line);
      auto execs = book.process(order);

      // Output execution reports as JSONL
      for (const auto &exec : execs) {
        std::cout << "{\"order_id\":" << exec.order_id
                  << ",\"price\":" << exec.price
                  << ",\"filled_qty\":" << exec.filled_qty
                  << ",\"counterparty\":" << exec.counterparty_id
                  << ",\"action\":\"" << exec.action << "\""
                  << ",\"best_bid\":" << book.best_bid()
                  << ",\"best_ask\":" << book.best_ask() << "}\n";
      }
    } catch (...) {
      std::cerr << "ERROR: Failed to parse order: " << line << "\n";
    }
  }

  // Final state report
  std::cout << "{\"status\":\"complete\""
            << ",\"best_bid\":" << book.best_bid()
            << ",\"best_ask\":" << book.best_ask()
            << ",\"bid_depth\":" << book.bid_depth()
            << ",\"ask_depth\":" << book.ask_depth() << "}\n";

  return 0;
}