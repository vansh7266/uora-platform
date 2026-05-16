<div align="center">
  <img src="https://img.shields.io/badge/IICPC%202026-Project-blue?style=for-the-badge&logo=google" alt="IICPC 2026 Badge"/>
  <h1>UORA</h1>
  <h3>Unified Orderbook Resilience Architecture</h3>
  <p>A distributed, production-grade benchmarking platform that rigorously evaluates High-Frequency Trading (HFT) matching engines using deterministic LOBSTER data replay, mathematical state validation, and ML anomaly detection.</p>
  <br />
</div>

## 🏆 Why UORA Wins

1. 🛡️ **Absolute Security Sandbox**: Uses `gVisor (runsc)`, rootless BuildKit, and rigorous `seccomp-bpf` profiles to strictly isolate untrusted contestant binaries. No escaping to the host kernel.
2. ⚡ **Hyper-Scale Throughput**: Demonstrated **69,348 orders/sec** via a vertically scaled `asyncio` Bot Fleet orchestrator.
3. 📉 **ML Anomaly Detection**: Employs an Isolation Forest model tracking 8 distinct entropy and latency features to instantly flag hardcoded cheating, memory leaks, or erratic engine crashes.
4. 🧮 **Mathematical Correctness**: Real-time cross-validation against a shadow reference Limit Order Book (LOB) using Graph Edit Distance (GED) on L3 states to guarantee strict Price-Time priority.
5. 📊 **Real-time Telemetry & Scoring**: Async metrics streaming directly into TimescaleDB and pushed to a Next.js live leaderboard via Redis Pub/Sub, culminating in a beautiful, automated PDF contestant scorecard.

---

## 🏗️ Architecture Blueprint

UORA is decoupled into four primary layers built for horizontal scalability.

![Architecture Placeholder](/docs/assets/architecture.png)
*(For a deep-dive systems analysis, trade-offs, and security modeling, read the full [Architecture Blueprint](docs/architecture-blueprint.md))*

## 🚀 Quick Start

Launch the entire UORA suite locally in 3 commands:

```bash
# 1. Start the core data & telemetry layer
docker-compose up -d timescaledb redis minio

# 2. Start the contestant submission API
docker-compose up -d submission envoy

# 3. Trigger a live benchmark stress-test
source venv/bin/activate
python test_integration.py
```

---

## 📈 Visualizations

### The Live Leaderboard
![Leaderboard Screenshot](/docs/assets/leaderboard.png)

### Contestant PDF Scorecard
![Report Screenshot](/docs/assets/report.png)

---

## 🛠️ Tech Stack

| Component | Technology | Version | Purpose |
| --- | --- | --- | --- |
| **Sandbox** | gVisor | `latest` | Userspace kernel isolation |
| **Telemetry DB** | TimescaleDB | `pg15` | Fast continuous aggregates |
| **Message Broker** | Redis | `7-alpine` | Async pub/sub for UI streaming |
| **Data Layer** | Polars | `0.20+` | Rust-backed dataframe scoring |
| **Bot Fleet** | Python `asyncio` | `3.11` | Parallel LOBSTER replaying |
| **Dashboard** | Next.js + Tailwind | `14` | Live streaming leaderboard |
| **Infrastructure** | Terraform / K8s | `1.5+` | Production AWS deployment |

---

## 👨‍💻 Team

**Vansh** (Solo Developer)
- **Architecture**: Designed the 4-layer distributed microservice architecture.
- **Backend/Systems**: Implemented the Asyncio Bot Fleet, Envoy proxy config, and PostgreSQL/Redis integrations.
- **Machine Learning**: Built the Isolation Forest anomaly detector.
- **Frontend**: Developed the real-time Next.js live streaming dashboard.

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
