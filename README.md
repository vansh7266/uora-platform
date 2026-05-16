# 🌌 UORA: Unified Orderbook Resilience Architecture

**IICPC Summer Hackathon 2026 Submission**

UORA is a distributed benchmarking platform designed to stress-test high-frequency trading (HFT) systems. It provides a secure, sandboxed environment where contestants can submit their orderbook and matching engine implementations to be evaluated against real-world market conditions.

---

## 🚀 Overview

Contestants submit code (C++, Rust, or Go), which UORA then containerizes, sandboxes using gVisor, and bombards with simulated LOBSTER market traffic to score on latency, throughput, and correctness.

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
| **API / Backend** | Python 3.11, FastAPI, asyncio + uvloop |
| **Database** | TimescaleDB (PostgreSQL), Redis |
| **Proxy / Sidecar** | Envoy Proxy (v1.29) |
| **Sandboxing** | gVisor (runsc) |
| **Storage** | MinIO (S3 Compatible) |
| **Data Processing** | Polars, LOBSTER NASDAQ datasets |
| **Frontend** | Next.js, TailwindCSS |

---

## ⚡ Quick Start

Ensure you have [Docker](https://www.docker.com/) and `make` installed.

```bash
# Spin up the infrastructure
make up

# Verify API health
curl http://localhost:8000/health

# Run reference server (for local bot testing)
python contestant-sdk/python/reference_server.py

# Run bot fleet benchmark (10 workers × 5 seconds)
python test_bot.py
```

---

## 📈 Roadmap (21-Day Timeline)

- [x] **Day 1-2: Scaffold + Reference LOB** — Submission service, Docker infra, Envoy sidecar, deterministic FIFO matching engine (8/8 tests green).
- [x] **Day 3-5: Telemetry + Validator + Scoring + Contestant SDK** — Envoy log ingester, L1-L3 correctness validator, composite scoring engine, reference FastAPI server.
- [x] **Day 6-8: Bot Fleet + LOBSTER Replay** — TradingBot (circuit breaker, retry, HTTP/2), BotCoordinator (1000+ async workers), LOBSTER CSV parser, 7.5k orders/5s validated.
- [ ] **Day 9-12: ML Anomaly Detection + Chaos Engineering** — Isolation Forest on latency distributions, gVisor full integration, resource pinning.
- [ ] **Day 13-18: Next.js Leaderboard + Real-time Streaming** — Live leaderboard, WebSocket market data feed, TimescaleDB continuous aggregates.
- [ ] **Day 19-21: Polish + Documentation + Demo** — Final stress testing, ADR completion, demo video.

---

## 📂 Project Structure

```text
.
├── docs/                    # ADRs, Quant curriculum, API specs
├── uora/                    # Python package (was platform/)
│   ├── submission/          # FastAPI upload + build queue
│   ├── bot-fleet/           # TradingBot + Coordinator + LOBSTER parser
│   ├── validator/           # Reference LOB + Correctness diff engine
│   ├── telemetry/           # Envoy log ingester + TimescaleDB schema
│   └── scoring/             # Polars histograms + Composite score + ML detector
├── contestant-sdk/          # Reference FastAPI server for contestants
├── infra/                   # Envoy, K8s manifests, Terraform
├── data/lobster/            # NASDAQ market data samples
├── Makefile                 # Automation
└── docker-compose.yml       # Local dev stack
```

---

## ✅ What's Working Today

| Component | File | Status |
| :--- | :--- | :--- |
| Reference LOB Engine | `uora/validator/reference_lob.py` | ✅ 8/8 tests |
| Correctness Validator | `uora/validator/diff_engine.py` | ✅ L1-L3 checks |
| Trading Bot | `uora/bot-fleet/bot.py` | ✅ All order types |
| Bot Coordinator | `uora/bot-fleet/coordinator.py` | ✅ 7.5k orders/5s |
| LOBSTER Parser | `uora/bot-fleet/lobster_parser.py` | ✅ NASDAQ replay |
| Telemetry Ingester | `uora/telemetry/ingester.py` | ✅ Envoy log parsing |
| Scoring Engine | `uora/scoring/engine.py` | ✅ Composite formula |
| Reference Server | `contestant-sdk/python/reference_server.py` | ✅ Full API contract |
| OpenAPI Spec | `docs/api/openapi-3.0.yaml` | ✅ v1.0.0 |

---

## ⚖️ License

Distributed under the MIT License. See `LICENSE` for more information.

---

Developed for the **IICPC Summer Hackathon 2026**.
