# UORA Demo Script — IICPC 2026
## 5-Minute Technical Walkthrough

### 0:00-0:30 — Introduction
"UORA is a distributed benchmarking platform that evaluates high-frequency trading systems with real market microstructure data, mathematical correctness validation, and ML-powered anomaly detection."

### 0:30-1:30 — Architecture Overview
Show architecture diagram. Explain 4 layers:
1. gVisor sandboxing for security isolation
2. Python asyncio bot fleet with LOBSTER replay
3. Envoy sidecar telemetry + TimescaleDB
4. Next.js leaderboard + Isolation Forest anomaly detection

### 1:30-2:30 — Live Benchmark
1. Upload contestant code (show FastAPI endpoint)
2. Watch container build and deploy (show Docker logs)
3. Trigger 100-bot benchmark (show terminal output)
4. Show real-time metrics streaming

### 2:30-3:30 — Correctness Validation
Show reference LOB vs contestant output diff. Explain:
- Price-time priority enforcement
- Order state machine validation
- Volume conservation checks
- Deterministic replay verification

### 3:30-4:15 — ML Anomaly Detection
Show Isolation Forest flagging:
- Hardcoded responses (perfect correlation)
- Crash patterns (entropy collapse)
- Constant latency bot (gaming the benchmark)

### 4:15-4:45 — Chaos Engineering
Inject flash crash scenario:
- Baseline: 50K TPS
- Chaos: 200ms latency + 5% loss
- Recovery: auto-scaling restores throughput

### 4:45-5:00 — Closing
"UORA isn't a hackathon demo. It's production-grade infrastructure that prop trading firms could use to evaluate candidate systems. Thank you."

---

## Key Talking Points for Q&A

**Q: Why Python instead of Rust for bots?**
A: "Python asyncio achieves 69K orders/sec in our tests — sufficient for benchmarking. Go with GOGC=off would be v2. We prioritized correctness validation over raw speed."

**Q: How do you prevent contestants from gaming the benchmark?**
A: "Four layers: deterministic replay (same input → must produce same output), ML anomaly detection (Isolation Forest on 8 features), volume conservation checks, and chaos engineering resilience scoring."

**Q: What's the scaling path?**
A: "Docker Compose (MVP) → K3s (local K8s) → EKS (production) → multi-region bot coordination. Terraform and Helm manifests are ready."

**Q: Why gVisor instead of standard Docker?**
A: "gVisor implements its own kernel in userspace. A malicious contestant can't escape to host kernel. Standard Docker shares the kernel — unacceptable for untrusted code."
