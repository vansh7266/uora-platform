# Unified Orderbook Resilience Architecture (UORA)

**Executive Summary**
UORA is a distributed, high-throughput benchmarking platform designed to rigorously evaluate contestant-submitted High-Frequency Trading (HFT) matching engines. For proprietary trading firms and quantitative hedge funds, microsecond-level latency variance and absolute algorithmic correctness under extreme load are not "nice-to-haves" — they are the foundational requirements of survival. UORA replicates the chaotic, high-volume environment of modern electronic exchanges using real-world Level 3 LOBSTER data, subjecting contestant binaries to intense stress-testing while measuring P99 latencies, deterministic correctness, and system resilience.

---

## 1. Problem Decomposition
UORA is structured into four distinct, loosely coupled layers:

1. **Submission & Sandbox Layer (gVisor/K8s)**
   Contestant engines are executed in highly isolated environments to prevent malicious system calls while guaranteeing a level playing field.
2. **Telemetry & Ingestion Layer (Envoy + Redis + TimescaleDB)**
   Every order dispatched triggers a telemetry event. Envoy sidecars intercept traffic, funneling logs to a Redis queue, which are then asynchronously batch-inserted into TimescaleDB continuous aggregates.
3. **Bot Fleet & Load Generation (Asyncio/Aiohttp)**
   A scalable orchestrator spawns thousands of stateful bot actors. These bots replay LOBSTER data scenarios with jitter and realistic network delay, simulating a highly active market.
4. **Validation & Scoring Engine (Polars + ML Isolation Forest)**
   The correctness validator checks contestant L3 states against a reference engine. The ML layer detects cheating (e.g., hardcoded responses) and engine crashes using an Isolation Forest model trained on expected entropy profiles.

---

## 2. Technology Decisions & Trade-Offs

- **TimescaleDB over InfluxDB/Prometheus**: While Prometheus is standard for metrics, we required relational joins between granular request logs and correctness violations. TimescaleDB provides PostgreSQL's robustness with hypertable partitioning for time-series ingestion.
- **Redis Queue vs. Kafka**: Kafka was evaluated for the telemetry bus but rejected due to operational complexity for a hackathon environment. Redis lists/PubSub provide sufficient throughput (100k+ ops/sec) with significantly lower latency overhead.
- **Python Asyncio vs. Go/Rust (Load Gen)**: We chose Python for the Bot Fleet to leverage the rich ecosystem of ML data processing (Polars, Sklearn) in the same language. While Go could yield higher raw throughput per core, `asyncio` with `uvloop` easily saturates our 50k TPS requirement.

---

## 3. Correctness Validation
The core of UORA's integrity lies in the `CorrectnessValidator`. High-frequency matching engines must adhere to strict Price-Time Priority rules. 
UORA maintains a shadow **Reference Limit Order Book**. For every scenario executed, the same deterministic stream of orders is fed to the reference engine. The contestant's output stream (Fills, Cancels, Rejects) is zipped and compared via a Graph Edit Distance algorithm against the reference state machine. A single missed fill or out-of-order execution immediately flags the run.

---

## 4. Performance Characteristics
During Day 7 Integration Testing, UORA demonstrated the following capabilities on standard cloud compute (c6i.2xlarge):
- **Peak Throughput**: >65,000 orders/sec injected and validated.
- **Telemetry Latency**: P50 < 1.5ms, P99 < 3ms.
- **Scoring Pipeline**: Sub-second aggregation using Polars over TimescaleDB 1-minute materialized views.

---

## 5. Security Model
Contestant code is inherently untrusted. UORA's production deployment targets Kubernetes using **gVisor (`runsc`)** as the runtime class. By intercepting system calls in user-space, gVisor prevents container escapes and network snooping. Envoy proxies enforce strict egress policies, ensuring submissions can only communicate with the UORA event bus.

---

## 6. ML Anomaly Detection
To prevent "gaming" the benchmark (e.g., returning pre-computed responses without executing logic), UORA utilizes an **Isolation Forest**.
We extract 8 key features per run:
1. `latency_entropy` (Variance collapse indicates hardcoding or crashes)
2. `pattern_correlation`
3. `volume_conservation_delta`
4. `state_transition_ged`
5. `latency_trend_slope` (Detects memory leaks)
6. `throughput_variance`
7. `error_rate`
8. `p99_to_p50_ratio`

Contamination is set to 1%, actively flagging deviations from reference engine behavior with high precision.

---

## 7. Chaos Engineering
UORA goes beyond happy-path testing. The platform actively injects:
- **Network Partitions**: Simulating exchange gateway drops.
- **Thundering Herds**: 10x traffic spikes within a 10ms window.
- **Malformed Packets**: Fuzzing integer bounds and sequence numbers.
A contestant's composite score is heavily penalized if their engine panics or corrupts state during these events.

---

## 8. Scaling Path
UORA evolved rapidly:
1. **MVP (Local)**: Bare-metal Python scripts.
2. **Current (Docker Compose)**: Multi-container orchestration, suitable for local validation.
3. **Production (AWS EKS)**: Terraform-managed infrastructure, scaling the Bot Fleet horizontally as Kubernetes Jobs to simulate millions of simultaneous connections.

---

## 9. Lessons Learned
1. **The Cost of I/O**: Initial telemetry designs wrote directly to Postgres per request. This bottlenecked at 4k TPS. Introducing Redis as an asynchronous buffer allowed us to scale 15x.
2. **Asyncio Pitfalls**: We discovered that instantiating multiple `asyncio.run()` calls in our test scripts destroyed event loops, leading to unclosed `aiohttp` sessions. Refactoring to a unified lifecycle loop solved our memory leaks.
3. **Precision Matters**: Moving from standard Python floating-point prices to integer cents was necessary to prevent floating-point drift between contestant and reference engines.

*Generated by UORA Core Team — IICPC 2026*
