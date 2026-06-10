<div align="center">
  <h1>UORA</h1>
  <h3>Unified Orderbook Resilience Architecture</h3>
  <p>
    A distributed, production-grade benchmarking platform that rigorously evaluates
    High-Frequency Trading (HFT) matching engines using deterministic LOBSTER data
    replay, four-level mathematical correctness validation, and ML anomaly detection.
  </p>
  <p>
    <b>IICPC 2026</b> — All four required components implemented and verified.
  </p>
</div>

---

## Architecture

UORA is decoupled into four independently-deployable layers.

| Layer | Components | Purpose |
|---|---|---|
| **Submission & Sandbox** | FastAPI + BuildKit + gVisor + seccomp-bpf | Secure code upload, compilation, isolation |
| **Benchmark & Validation** | asyncio Bot Fleet + Reference LOB + Diff Engine | LOBSTER replay, L1–L4 correctness, GED |
| **Telemetry & Scoring** | Envoy + TimescaleDB + Scoring Engine + Isolation Forest | Latency, composite score, anomaly detection |
| **Real-Time Leaderboard** | Next.js 16 + ECharts + Redis Pub/Sub + SSE | Live rankings, charts, submission panel |

---

## Quick Start

```bash
# 1. Install Python package and frontend dependencies
pip install -e ".[dev]"

# 2. Start core infrastructure
docker-compose up -d timescaledb redis minio buildkitd registry

# 3. Start backend services
docker-compose up -d submission builder benchmarker envoy

# 4. Start the Next.js leaderboard (demo mode — no backend required)
cd uora/leaderboard && npm install && npm run dev
# Open http://localhost:3000

# 5. Run the full test suite (40 tests)
make test

# 6. Run a load benchmark
make benchmark
```

---

## Scoring Formula

```
                throughput × correctness_rate × success_rate
score = ─────────────────────────────────────────────────────────
             p99_latency_ms + resource_penalty²

                            ⌊ denominator floored at 1.0 ⌋
```

`correctness_rate` and `success_rate` are multiplicative gates — a 50%-correct engine has its entire score halved, not merely docked. `resource_penalty` is squared so wasted CPU/memory is penalised convexly. The denominator floor prevents sub-millisecond engines from scoring infinitely.

See [`docs/quant/module-09-scoring.md`](docs/quant/module-09-scoring.md) for the full derivation and worked examples.

---

## Validation (L1–L4)

The reference LOB replays every action and diffs the contestant's responses.

| Level | Check | What triggers it |
|---|---|---|
| **L1** | Fill count, price, quantity | Price-time priority violation |
| **L2** | Order status vs. reference | Wrong status string (e.g. "pending" when should be "filled") |
| **L3** | Contestant's implied book not crossed | Engine fails to match a valid aggressor |
| **L4** | State-graph similarity | Non-deterministic output across identical inputs |

Each violation reduces `correctness_rate` by `1/total_actions`.

---

## ML Anomaly Detection

An Isolation Forest model trained on eight engineered features flags suspicious submissions:

| Feature | What it detects |
|---|---|
| `latency_entropy` | Near-zero variance → crash/restart or faked clock |
| `pattern_correlation` | >0.95 → hardcoded responses to known test patterns |
| `volume_conservation_delta` | Missing orders → dropped requests |
| `state_transition_ged` | Graph edit distance → non-deterministic state machine |
| `latency_trend_slope` | Rising trend → memory leak |
| `throughput_variance` | Extreme variance → unstable engine |
| `error_rate` | >10% 4xx/5xx → overloaded or broken engine |
| `p99_to_p50_ratio` | >10× → severe tail latency |

---

## Dashboard

The Void Terminal design system (`#0A1525` background, Plasma Cyan `#00D4FF` accent):

| Panel | Description |
|---|---|
| **Live Leaderboard** | SSE-powered real-time rankings with animated rank changes |
| **Latency Profile** | p50/p90/p99 time-series with gradient fills |
| **Throughput** | Orders-per-second bar chart, colour-coded by peak |
| **Score Breakdown** | Radar chart across 5 dimensions (top 3 engines) |
| **Historical Performance** | Score progression per team across benchmark runs |
| **Latency Distribution** | Colour-coded histogram (normal/elevated/high-tail) |
| **Validation Panel** | Live orderbook depth + violation counts |
| **Submission Panel** | Drag-and-drop C++/Rust/Go upload with pipeline tracker |

All ECharts panels use a `ResizeObserver` wrapper so charts never render blank on resize or section transition.

---

## Project Structure

```
uora-platform/
├── uora/
│   ├── sandbox/          # Build worker (Redis Stream consumer, BuildKit, K8s deploy)
│   ├── scoring/          # Composite scoring + resource_penalty metering
│   ├── telemetry/        # Envoy log ingester + TimescaleDB schema
│   ├── validator/        # Reference LOB + Diff Engine (L1-L4, GED, L3 contestant book)
│   ├── submission/       # FastAPI upload service (Google OAuth2, rate limiting)
│   ├── leaderboard/      # Next.js 16 dashboard (ECharts, Framer Motion, Zustand)
│   ├── bot_fleet/        # asyncio coordinator + LOBSTER parser
│   └── ml_detector/      # Isolation Forest (8-feature, real-time detection)
├── contestant_sdk/
│   ├── README.md         # ← Contestant guide: API contract, scoring, pitfalls
│   └── python/           # reference_server.py (canonical LOB) + mock_contestant.py
├── tests/
│   ├── test_scoring_composite.py      # 10 tests: formula, resource_penalty, GED
│   ├── test_validator_l3l4_resources.py  # 20 tests: L3/L4 bugs, resource metering
│   ├── test_hardened_features.py      # 5 tests: telemetry, coordinator, builder
│   ├── test_production_pipeline_contract.py  # 5 tests: pipeline, scoring
│   ├── integration/test_bot.py        # Bot fleet integration test
│   ├── integration/test_pipeline.py   # Full pipeline integration test
│   └── load/stress_test.py            # 1000-bot stress test
├── docs/
│   ├── quant/            # 13-module Quant Handbook (zero → intermediate)
│   ├── architecture-blueprint.md
│   ├── api/openapi-3.0.yaml
│   └── demo-script.md
├── examples/
│   ├── dummy_engine.py      # Python stdlib-only engine — minimal valid submission
│   ├── working_engine.cpp   # C++ engine skeleton with HTTP contract
│   └── httplib.h            # Bundled single-header HTTP lib for the C++ skeleton
├── infra/
│   ├── envoy/            # Envoy proxy with nanosecond timing filter
│   ├── k8s/              # gVisor RuntimeClass + RBAC manifests
│   ├── security/         # seccomp-bpf deny-by-default profile
│   └── terraform/        # AWS VPC + EC2 skeleton
├── docker-compose.yml    # Full stack with BuildKit, network isolation, health checks
├── pyproject.toml        # Python package + dev dependencies
└── Makefile              # up / down / test / test-integration / benchmark / fmt
```

---

## Tech Stack

| Component | Technology | Purpose |
|---|---|---|
| **Sandbox** | BuildKit + gVisor + seccomp-bpf | Rootless builds, userspace kernel, syscall deny list |
| **Message Queue** | Redis 7 Streams (XREADGROUP/XACK) | Build queue, benchmark queue, consumer groups |
| **Realtime** | Redis Pub/Sub + SSE | Leaderboard updates, submission status |
| **Telemetry DB** | TimescaleDB (pg15) | Hypertables, continuous aggregates, percentile_cont |
| **Validation** | NetworkX + SequenceMatcher | L4 GED with node+edge similarity (no NP-Hard exact GED) |
| **ML** | scikit-learn Isolation Forest | 8-feature anomaly detection, synthetic normal baseline |
| **Frontend** | Next.js 16.2.6 (Turbopack) | SSR-off ECharts, Zustand persist, Framer Motion |
| **Object Storage** | MinIO (S3-compatible) | Source archive storage, presigned URLs |
| **Bot Fleet** | Python asyncio | Deterministic LOBSTER replay, 1000-concurrent workers |

---

## Test Coverage

```
$ make test
40 passed in ~7s
```

| Test file | Coverage |
|---|---|
| `test_scoring_composite.py` | Composite formula, resource_penalty live, GED inversion regression |
| `test_validator_l3l4_resources.py` | L3 crossed-book detection, L4 status divergence, resource metering |
| `test_hardened_features.py` | Telemetry ingester, coordinator resilience, K8s optional fallback |
| `test_production_pipeline_contract.py` | Benchmark contracts, latency summary, build→benchmark pipeline |
| `uora/validator/reference_lob.py` (doctests) | 9 LOB unit tests |
| `uora/validator/diff_engine.py` (doctests) | 4 validator unit tests |
| `uora/ml_detector/detector.py` (doctests) | 4 ML detector unit tests |

---

## Contestant SDK

→ **[contestant_sdk/README.md](contestant_sdk/README.md)** — Full API contract, request/response schemas, scoring guide, and common pitfalls.

---

## Quant Handbook

→ **[docs/quant/README.md](docs/quant/README.md)** — 13-module curriculum from LOB mechanics to system architecture, with every code example verified against the real API.

---

## Team

**Vansh** (Solo Developer) — Architecture, backend systems, ML pipeline, frontend dashboard, security hardening, quant curriculum. Built for IICPC 2026.

---

## License

MIT — see [LICENSE](LICENSE).
