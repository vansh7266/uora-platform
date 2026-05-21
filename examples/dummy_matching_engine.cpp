/**
 * UORA Dummy Matching Engine — C++17
 *
 * A minimal HTTP/1.1 matching engine that satisfies the UORA benchmark
 * protocol. Handles order submission, cancellation, and health probes.
 *
 * Endpoints expected by the benchmarker:
 *   GET  /health               → {"status":"ok"}
 *   POST /api/v1/order         → {"status":"accepted","order_id":"..."}
 *   POST /api/v1/orders        → same as above (alias)
 *   DELETE /api/v1/order/{id}  → {"status":"cancelled","order_id":"..."}
 *   POST /api/v1/cancel        → {"status":"cancelled","order_id":"..."}
 */

#include <arpa/inet.h>
#include <csignal>
#include <cstdint>
#include <cstring>
#include <iostream>
#include <netinet/in.h>
#include <sstream>
#include <string>
#include <sys/socket.h>
#include <unistd.h>

namespace {

volatile std::sig_atomic_t g_running = 1;

void handle_signal(int) { g_running = 0; }

// ── HTTP helpers ─────────────────────────────────────────────────────────────

std::string make_response(const std::string &status, const std::string &body) {
    std::ostringstream out;
    out << "HTTP/1.1 " << status << "\r\n"
        << "Content-Type: application/json\r\n"
        << "Connection: close\r\n"
        << "Content-Length: " << body.size() << "\r\n\r\n"
        << body;
    return out.str();
}

// Extract the first token (method) and second token (path) from a request line.
bool parse_request_line(const char *buf, std::string &method, std::string &path) {
    const char *p = buf;
    while (*p && *p != ' ') method += *p++;
    if (*p) ++p;
    while (*p && *p != ' ' && *p != '\r' && *p != '\n') path += *p++;
    return !method.empty() && !path.empty();
}

// ── Routing ──────────────────────────────────────────────────────────────────

std::string route(const char *buf, ssize_t len) {
    if (len <= 0) return make_response("400 Bad Request", R"({"error":"empty_request"})");

    std::string method, path;
    if (!parse_request_line(buf, method, path)) {
        return make_response("400 Bad Request", R"({"error":"malformed_request"})");
    }

    // Health probe
    if (method == "GET" && (path == "/health" || path == "/healthz")) {
        return make_response("200 OK",
            R"({"status":"ok","engine":"uora-dummy-cpp","version":"1.0.0"})");
    }

    // Order submission
    if (method == "POST" &&
        (path == "/api/v1/order" || path == "/api/v1/orders")) {
        static uint64_t order_seq = 1;
        char oid[32];
        std::snprintf(oid, sizeof(oid), "ORD-%08llu",
                      static_cast<unsigned long long>(order_seq++));
        std::string body = std::string(R"({"status":"accepted","order_id":")") +
                           oid + R"(","filled_qty":0,"remaining_qty":1})";
        return make_response("200 OK", body);
    }

    // Order cancellation (REST: DELETE /api/v1/order/{id})
    if (method == "DELETE" && path.rfind("/api/v1/order", 0) == 0) {
        std::string oid = path.size() > 14 ? path.substr(14) : "unknown";
        std::string body = R"({"status":"cancelled","order_id":")" + oid + R"("})";
        return make_response("200 OK", body);
    }

    // Order cancellation (POST /api/v1/cancel)
    if (method == "POST" && path == "/api/v1/cancel") {
        return make_response("200 OK",
            R"({"status":"cancelled","order_id":"dummy-ack"})");
    }

    // Orderbook snapshot
    if (method == "GET" && (path == "/api/v1/orderbook" ||
                             path.rfind("/api/v1/orderbook", 0) == 0)) {
        return make_response("200 OK",
            R"({"bids":[[99.5,100],[99.0,200]],"asks":[[100.5,100],[101.0,200]]})");
    }

    return make_response("404 Not Found", R"({"error":"route_not_found"})");
}

// ── Server loop ──────────────────────────────────────────────────────────────

constexpr int PORT = 8080;
constexpr int BACKLOG = 512;

}  // namespace

int main() {
    std::signal(SIGINT,  handle_signal);
    std::signal(SIGTERM, handle_signal);

    int server_fd = ::socket(AF_INET, SOCK_STREAM, 0);
    if (server_fd < 0) { std::cerr << "socket() failed\n"; return 1; }

    int opt = 1;
    ::setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));

    sockaddr_in addr{};
    addr.sin_family      = AF_INET;
    addr.sin_addr.s_addr = INADDR_ANY;
    addr.sin_port        = htons(PORT);

    if (::bind(server_fd, reinterpret_cast<sockaddr *>(&addr), sizeof(addr)) < 0) {
        std::cerr << "bind() failed on port " << PORT << "\n";
        ::close(server_fd);
        return 1;
    }

    if (::listen(server_fd, BACKLOG) < 0) {
        std::cerr << "listen() failed\n";
        ::close(server_fd);
        return 1;
    }

    std::cout << "UORA dummy engine listening on port " << PORT << "\n";
    std::cout.flush();

    while (g_running) {
        sockaddr_in client{};
        socklen_t   client_len = sizeof(client);
        int client_fd = ::accept(server_fd,
                                  reinterpret_cast<sockaddr *>(&client),
                                  &client_len);
        if (client_fd < 0) {
            if (g_running) std::cerr << "accept() failed\n";
            continue;
        }

        char buf[16384];
        std::memset(buf, 0, sizeof(buf));
        const ssize_t n = ::recv(client_fd, buf, sizeof(buf) - 1, 0);

        const std::string reply = route(buf, n);
        ::send(client_fd, reply.data(), reply.size(), MSG_NOSIGNAL);
        ::close(client_fd);
    }

    ::close(server_fd);
    std::cout << "Shutting down cleanly.\n";
    return 0;
}
