UORA -- Unified Orderbook Resilience Architecture

IICPC Summer Hackathon 2026 Submission
A distributed benchmarking platform for high-frequency trading systems. Contestants submit orderbook/matching engine code; UORA containerizes, sandboxes, bombards with simulated market bots, and scores on latency, throughput, and correctness.

Quick Start (Local)
make up
make test

Architecture
Layer 1: Submission + Sandboxing (FastAPI, gVisor, BuildKit)
Layer 2: Bot Fleet (asyncio, LOBSTER replay)
Layer 3: Telemetry + Validation (Envoy, TimescaleDB, Redis)
Layer 4: Leaderboard + ML (Next.js, Polars, Isolation Forest)
Status

Day 1 scaffold -- WIP