# 🌌 UORA: Unified Orderbook Resilience Architecture

**IICPC Summer Hackathon 2026 Submission**

UORA is a distributed benchmarking platform designed to stress-test high-frequency trading (HFT) systems. It provides a secure, sandboxed environment where contestants can submit their orderbook and matching engine implementations to be evaluated against real-world market conditions.

---

## 🚀 Overview

Contestants submit code (C++, Rust, or Go), which UORA then containerizes, sandboxes using gVisor, and bombards with simulated market traffic to score on latency, throughput, and correctness.

## 🏗️ Architecture

```text
┌─────────────────────────────────────────────────────────────────┐
│              Layer 4: Intelligence & UI (Next.js)               │
│        (Performance Visualization & Anomaly Detection)          │
└───────────────────────────────┬─────────────────────────────────┘
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│           Layer 3: Telemetry & Observability (Envoy)            │
│        (Latency Sidecars, TimescaleDB, Redis Metrics)           │
└───────────────────────────────┬─────────────────────────────────┘
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│             Layer 2: Bot Fleet (Market Simulation)              │
│          (High-Velocity LOBSTER Market Data Replay)             │
└───────────────────────────────┬─────────────────────────────────┘
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│          Layer 1: Execution & Sandboxing (gVisor)               │
│        (Isolated Contestant Binaries, BuildKit API)             │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🛠️ Technology Stack

| Component | Technology |
| :--- | :--- |
| **API / Backend** | Python 3.11, FastAPI |
| **Database** | TimescaleDB (PostgreSQL), Redis |
| **Proxy / Sidecar** | Envoy Proxy (v1.29) |
| **Sandboxing** | gVisor (runsc) |
| **Storage** | MinIO (S3 Compatible) |
| **Frontend** | Next.js, TailwindCSS |

---

## ⚡ Quick Start

Ensure you have [Docker](https://www.docker.com/) and `make` installed.

```bash
# Spin up the infrastructure
make up

# Verify API health
curl http://localhost:8000/health
```

## 📈 Roadmap (21-Day Timeline)

- [x] **Day 1: Scaffold** - Submission service, Docker infra, Envoy sidecar.
- [ ] **Day 2-5: Sandboxing** - Full gVisor integration & resource pinning.
- [ ] **Day 6-10: Bot Fleet** - Replay engine for LOBSTER datasets.
- [ ] **Day 11-15: Analytics** - Implementation of scoring algorithms & ML anomaly detection.
- [ ] **Day 16-21: UI & Polish** - Next.js Dashboard & Final Stress Testing.

## 📂 Project Structure

```text
.
├── docs/               # Documentation & ADRs
├── infra/              # Infrastructure-as-code (Envoy, Docker)
├── platform/
│   ├── submission/     # Submission intake service
│   ├── validator/      # Reference LOB & scoring logic
│   └── telemetry/      # TimescaleDB schema & metrics
├── Makefile            # Automation commands
└── docker-compose.yml  # Local dev environment
```

## ⚖️ License

Distributed under the MIT License. See `LICENSE` for more information.

---

Developed for the **IICPC Summer Hackathon 2026**.
