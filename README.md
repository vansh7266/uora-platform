# 🌌 UORA: Unified Orderbook Resilience Architecture

**IICPC Summer Hackathon 2026 Submission**

UORA is a distributed benchmarking platform designed to stress-test high-frequency trading (HFT) systems. It provides a secure, sandboxed environment where contestants can submit their orderbook and matching engine implementations to be evaluated against real-world market conditions.

---

## 🚀 Overview

Contestants submit code (C++, Rust, or Go), which UORA then:
1.  **Containerizes**: Using BuildKit for secure, network-isolated builds.
2.  **Sandboxes**: Deploying to gVisor (runsc) to prevent syscall-level escapes.
3.  **Bombards**: Subjecting the implementation to a "Bot Fleet" that replays LOBSTER market data.
4.  **Scores**: Evaluating performance on microsecond-level latency, throughput, and execution correctness.

## 🏗️ Architecture

UORA is built on a 4-layer stack designed for maximum observability and isolation:

- **Layer 1: Execution & Sandboxing**  
  *FastAPI, gVisor, BuildKit.* Handles submission intake and secure execution of untrusted binaries.
- **Layer 2: Market Simulation**  
  *Python Asyncio, LOBSTER data.* Simulates high-velocity order traffic to stress-test matching engines.
- **Layer 3: Telemetry & Observability**  
  *Envoy Proxy, TimescaleDB, Redis.* Captures wire-level latency using sidecars and stores high-resolution metrics.
- **Layer 4: Intelligence & UI**  
  *Next.js, Polars, Isolation Forest.* Visualizes performance and detects "cheating" patterns or stability outliers using ML.

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

## ⚡ Quick Start (Local Development)

Ensure you have [Docker](https://www.docker.com/) and `make` installed.

```bash
# Clone the repository
git clone https://github.com/vansh7266/uora-platform.git
cd uora-platform

# Spin up the infrastructure (MinIO, TimescaleDB, Redis, Envoy)
make up

# Run test submission
make test
```

## 📂 Project Structure

```text
.
├── docs/               # Documentation & ADRs
├── infra/              # Infrastructure-as-code (Envoy, Docker)
├── platform/
│   ├── submission/     # Submission intake service
│   ├── validator/      # Reference LOB & scoring logic
│   └── telemetry/      # Database schemas & metrics
├── Makefile            # Automation commands
└── docker-compose.yml  # Local dev environment
```

## 📈 Status

**Current Phase**: Day 1 Scaffold  
- ✅ Submission API (FastAPI)
- ✅ Object Storage (MinIO)
- ✅ Metric Storage (TimescaleDB)
- ✅ Sidecar Observability (Envoy)
- 🚧 Bot Fleet Simulation (In Progress)
- 🚧 gVisor Runtime Integration (In Progress)

---

Developed with ❤️ for the **IICPC Summer Hackathon 2026**.