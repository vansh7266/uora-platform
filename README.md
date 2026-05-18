<div align="center">
  <h1>UORA</h1>
  <h3>Unified Orderbook Resilience Architecture</h3>
  <p>A distributed, production-grade benchmarking platform that rigorously evaluates High-Frequency Trading (HFT) matching engines using deterministic LOBSTER data replay, mathematical state validation, and ML anomaly detection.</p>
  <br />
</div>

## Core Architecture

1. **Absolute Security Sandbox**: Uses `gVisor (runsc)`, rootless BuildKit, and `seccomp-bpf` deny-by-default profiles to strictly isolate untrusted submitted binaries. No escaping to the host kernel.
2. **Hyper-Scale Throughput**: Demonstrated **69,348 orders/sec** via a vertically scaled `asyncio` Bot Fleet orchestrator.
3. **ML Anomaly Detection**: Employs an Isolation Forest model tracking 8 distinct entropy and latency features to instantly flag hardcoded cheating, memory leaks, or erratic engine crashes.
4. **Mathematical Correctness**: Real-time cross-validation against a shadow reference Limit Order Book (LOB) using Graph Edit Distance (GED) on L3 states to guarantee strict Price-Time priority.
5. **Real-time Telemetry & Scoring**: Async metrics streaming directly into TimescaleDB and pushed to a Next.js live leaderboard via Redis Pub/Sub, culminating in an automated PDF scorecard.

---

## Architecture Blueprint

UORA is decoupled into four primary layers built for horizontal scalability.

| Layer | Components | Purpose |
| --- | --- | --- |
| **Submission & Sandbox** | FastAPI + BuildKit + gVisor + seccomp | Secure code upload, compilation, and isolated execution |
| **Benchmark & Validation** | Bot Fleet + Reference LOB + Diff Engine | LOBSTER replay, correctness validation (L1-L4), GED |
| **Telemetry & Scoring** | Envoy + TimescaleDB + Scoring Engine + ML Detector | Latency measurement, composite scoring, anomaly detection |
| **Leaderboard & UI** | Next.js + ECharts + Redis Pub/Sub + SSE | Real-time dashboard, submission panel, live rankings |

*(For a deep-dive systems analysis, read the [Architecture Blueprint](docs/architecture-blueprint.md))*

---

## Quick Start

```bash
# 1. Install Python package
pip install -e ".[dev]"

# 2. Start the core infrastructure
docker-compose up -d timescaledb redis minio buildkitd registry

# 3. Start services
docker-compose up -d submission builder envoy

# 4. Start the reference server (for testing)
python contestant_sdk/python/reference_server.py &

# 5. Start the leaderboard mock publisher
python uora/leaderboard/mock_publisher.py &

# 6. Start the Next.js leaderboard
cd uora/leaderboard && npm install && npm run dev

# 7. Run the full test suite
make test

# 8. Run a benchmark
make benchmark
```

---

## Dashboard Features

- **Live Leaderboard** — Real-time SSE-powered rankings with animated rank changes
- **Latency Charts** — ECharts p50/p90/p99 line charts with gradient fills and SLA markers
- **Throughput Charts** — Animated bar charts color-coded by language (C++/Rust/Go)
- **Anomaly Pulse Detector** — Radar chart that pulses red when Isolation Forest detects anomalies (score > 0.7)
- **Market Replay Theatre** — Interactive orderbook visualization with play/pause and speed controls
- **Submission Panel** — Upload C++/Rust/Go code with real-time build status tracking
- **Google OAuth** — Sign in with Google account for submission access
- **Dark Mode** — Professional trading-terminal aesthetic with purposeful animations

---

## Tech Stack

| Component | Technology | Version | Purpose |
| --- | --- | --- | --- |
| **Sandbox** | gVisor | `latest` | Userspace kernel isolation |
| **Build Worker** | BuildKit | `latest` | Rootless containerized builds |
| **Telemetry DB** | TimescaleDB | `pg15` | Fast continuous aggregates with percentile_cont |
| **Message Broker** | Redis | `7-alpine` | Async pub/sub for UI streaming |
| **Data Layer** | Polars | `0.20+` | Rust-backed dataframe scoring |
| **ML Detector** | scikit-learn | `1.4+` | Isolation Forest anomaly detection |
| **Validation** | NetworkX | `3.2+` | Graph Edit Distance for L4 determinism |
| **Bot Fleet** | Python asyncio | `3.11` | Parallel LOBSTER replay |
| **Dashboard** | Next.js + Tailwind + ECharts | `14` | Real-time streaming leaderboard |
| **Infrastructure** | Terraform / K8s | `1.5+` | Production AWS deployment |

---

## Project Structure

```
uora-platform/
├── uora/
│   ├── sandbox/          # Build worker (Redis Stream consumer, Docker/K8s deploy)
│   ├── scoring/          # Composite scoring engine + ML anomaly integration
│   ├── telemetry/        # Envoy log ingester + TimescaleDB schema
│   ├── validator/        # Reference LOB + Diff Engine (L1-L4 + GED)
│   ├── submission/       # FastAPI upload service (Google OAuth + rate limiting)
│   ├── leaderboard/      # Next.js 14 dashboard (ECharts, Framer Motion, Zustand)
│   ├── bot_fleet/        # asyncio bot orchestrator + LOBSTER parser + chaos injector
│   └── ml_detector/      # Isolation Forest anomaly detector (8 features)
├── contestant_sdk/       # Python SDK + reference server
├── infra/
│   ├── envoy/            # Envoy proxy with Lua ns-timing filter
│   ├── k8s/              # K8s manifests with gVisor RuntimeClass + RBAC
│   ├── security/         # seccomp-bpf deny-by-default profile
│   ├── helm/             # Helm chart skeleton
│   └── terraform/        # AWS VPC + EC2 (restricted ingress)
├── docker-compose.yml    # BuildKit + network isolation + .env support
├── pyproject.toml        # Python package metadata
├── Makefile              # Build, test, benchmark, setup targets
└── .env.example          # All environment variables documented
```

---

## Team

**Vansh** (Solo Developer)
- **Architecture**: Designed the 4-layer distributed microservice architecture.
- **Backend/Systems**: Implemented the Asyncio Bot Fleet, Envoy proxy config, and PostgreSQL/Redis integrations.
- **Machine Learning**: Built the Isolation Forest anomaly detector with 8 engineered features.
- **Frontend**: Developed the real-time Next.js dashboard with ECharts, Framer Motion animations, and Google OAuth.
- **Security**: Hardened seccomp-bpf profiles, gVisor sandboxing, rootless BuildKit, network isolation.

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
