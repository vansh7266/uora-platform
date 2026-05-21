#include <arpa/inet.h>
#include <csignal>
#include <cstring>
#include <iostream>
#include <netinet/in.h>
#include <sstream>
#include <string>
#include <sys/socket.h>
#include <unistd.h>

namespace {

volatile std::sig_atomic_t running = 1;

void handle_signal(int) {
  running = 0;
}

std::string response(const std::string &status, const std::string &body) {
  std::ostringstream out;
  out << "HTTP/1.1 " << status << "\r\n";
  out << "Content-Type: application/json\r\n";
  out << "Connection: close\r\n";
  out << "Content-Length: " << body.size() << "\r\n\r\n";
  out << body;
  return out.str();
}

std::string route(const std::string &request) {
  if (request.rfind("GET /health ", 0) == 0) {
    return response("200 OK", R"({"status":"ok","engine":"uora-dummy-cpp"})");
  }

  if (request.rfind("POST /api/v1/order ", 0) == 0 ||
      request.rfind("POST /api/v1/orders ", 0) == 0) {
    return response(
      "200 OK",
      R"({"status":"accepted","order_id":"dummy-ack","filled_qty":0,"remaining_qty":1})"
    );
  }

  if (request.rfind("DELETE /api/v1/order", 0) == 0 ||
      request.rfind("POST /api/v1/cancel ", 0) == 0) {
    return response("200 OK", R"({"status":"cancelled","order_id":"dummy-ack"})");
  }

  return response("404 Not Found", R"({"error":"route_not_found"})");
}

}  // namespace

int main() {
  std::signal(SIGINT, handle_signal);
  std::signal(SIGTERM, handle_signal);

  int server_fd = socket(AF_INET, SOCK_STREAM, 0);
  if (server_fd < 0) {
    std::cerr << "socket failed\n";
    return 1;
  }

  int opt = 1;
  setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));

  sockaddr_in address {};
  address.sin_family = AF_INET;
  address.sin_addr.s_addr = INADDR_ANY;
  address.sin_port = htons(8080);

  if (bind(server_fd, reinterpret_cast<sockaddr *>(&address), sizeof(address)) < 0) {
    std::cerr << "bind failed\n";
    close(server_fd);
    return 1;
  }

  if (listen(server_fd, 256) < 0) {
    std::cerr << "listen failed\n";
    close(server_fd);
    return 1;
  }

  while (running) {
    sockaddr_in client {};
    socklen_t client_len = sizeof(client);
    int client_fd = accept(server_fd, reinterpret_cast<sockaddr *>(&client), &client_len);
    if (client_fd < 0) {
      if (running) {
        std::cerr << "accept failed\n";
      }
      continue;
    }

    char buffer[8192];
    std::memset(buffer, 0, sizeof(buffer));
    const ssize_t bytes = recv(client_fd, buffer, sizeof(buffer) - 1, 0);
    if (bytes > 0) {
      const std::string reply = route(std::string(buffer, static_cast<size_t>(bytes)));
      send(client_fd, reply.data(), reply.size(), 0);
    }
    close(client_fd);
  }

  close(server_fd);
  return 0;
}

