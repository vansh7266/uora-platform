# Module 10 — Systems for Quant

> **Prerequisite:** Modules 01–09. This is the capstone — it connects everything.
> **Goal:** Understand the *systems* that make UORA run safely and at scale: sandboxing
> untrusted code, message queues, object storage, the time-series database, and real-time
> streaming — and how they map to the four IICPC requirements.
> **Time:** ~50 minutes. Conceptual; the "run it" parts need the Docker stack up.

---

## 1. Why systems are half the job

A correct, fast matching engine is worthless if the platform around it can't **run strangers'
code without getting hacked**, **survive load**, **store millions of telemetry events**, and
**show results live**. In quant infrastructure, the systems engineering *is* the product as
much as the algorithms. This module is the architecture that turns the previous nine modules
into a running platform.

UORA's stack (from `docker-compose.yml`) is eleven services:

| Service | Image | Role |
|---------|-------|------|
| `submission` | FastAPI app | Auth, upload, the SSE leaderboard API |
| `minio` | minio/minio | S3-compatible **object storage** for submitted code |
| `redis` | redis:7 | **Streams** (job queues) + **Pub/Sub** (live updates) |
| `buildkitd` | moby/buildkit | Isolated **build daemon** |
| `builder` | UORA worker | Downloads source, builds, **sandboxes & deploys** the engine |
| `registry` | registry:2 | Private container image registry |
| `benchmarker` | UORA worker | Runs the **bot fleet**, validates, scores |
| `envoy` | envoyproxy/envoy | **Sidecar proxy** in front of each engine; access logs = latency |
| `ingester` | UORA worker | Parses Envoy logs → **TimescaleDB** |
| `timescaledb` | timescale/timescaledb | **Time-series database** for telemetry |
| `telemetry-log-init` | alpine | Prepares the shared log volume |

---

## 2. The journey of a submission (the whole pipeline)

```
  contestant uploads engine.cpp
        │
        ▼
 ┌──────────────┐   stores code    ┌─────────┐
 │  submission  │ ───────────────▶ │  MinIO  │
 │   (FastAPI)  │                  └─────────┘
 └──────┬───────┘
        │ XADD build_queue  (Redis Stream)
        ▼
 ┌──────────────┐  buildctl   ┌───────────┐  push   ┌──────────┐
 │   builder    │ ──────────▶ │ buildkitd │ ──────▶ │ registry │
 │              │             └───────────┘         └──────────┘
 │  deploy hardened container (gVisor/seccomp), behind Envoy
 └──────┬───────┘
        │ XADD benchmark_queue
        ▼
 ┌──────────────┐  replays LOBSTER actions via bot fleet → contestant engine
 │ benchmarker  │ ─────────────────────────────────────────────┐
 │              │                                               ▼
 │  validate (L1–L4) → score → INSERT benchmark_scores    ┌──────────┐
 │              │                                          │  Envoy   │ access logs
 └──────┬───────┘                                          └────┬─────┘
        │ PUBLISH uora:leaderboard:updates                      │  ingester parses →
        ▼                                                        ▼
 ┌──────────────┐   SSE stream    ┌───────────┐          ┌──────────────┐
 │  dashboard   │ ◀────────────── │ submission│          │ TimescaleDB  │
 └──────────────┘                 └───────────┘          └──────────────┘
```

Each arrow is a real call in the codebase. Let's unpack the four hard parts.

---

## 3. Sandboxing untrusted code (IICPC: *Submission & Sandboxing*)

You are about to compile and run **code written by strangers**, some of whom are actively
trying to break out. This is the scariest part of the platform. UORA defends in layers
(*defense in depth*):

**At build time** (`sandbox/builder.py`):
- Builds run via **BuildKit** (`buildctl`), isolated from the host Docker daemon.
- Source archives are checked for **path traversal** (`../`, absolute paths, symlinks) before
  extraction.
- The final image is `FROM scratch` — a multi-stage build copies *only* the compiled binary,
  so the runtime image has **no shell, no package manager, nothing** to exploit.

**At run time** (the Kubernetes Pod manifest):
- **gVisor** (`runtimeClassName: gvisor`) — a user-space kernel that intercepts syscalls, so
  the container never talks directly to the host kernel.
- **seccomp** profile — whitelists only the syscalls the engine needs.
- `runAsNonRoot`, `readOnlyRootFilesystem`, `drop: [ALL]` capabilities,
  `automountServiceAccountToken: false`, and a memory-backed `emptyDir` with a size limit.

> 📎 **In the codebase:** `_build_image()` (BuildKit), `_download_source()` (path-traversal
> checks), and `K8S_POD_TEMPLATE` (the hardening) in `sandbox/builder.py`. There's also a
> **local-Docker fallback** (`KUBERNETES_ENABLED=false`) that runs a plain container for dev —
> honest note: that fallback is *not* as hardened as the gVisor path, and is dev-only.

> 🧮 **Principle — least privilege:** give code the *minimum* it needs. No network during
> build (`--network=none` intent), no extra syscalls, no root, no writable disk. Every removed
> capability is an attack you've pre-empted.

---

## 4. Queues & workers (IICPC: the distributed pipeline)

Why not have the API build and benchmark the code directly? Because that would block, fail
under load, and couple everything. Instead UORA uses **Redis Streams** as durable job queues
that *decouple* the stages:

- `submission` does `XADD build_queue {…}` and returns immediately (the contestant gets an ID).
- `builder` consumes via a **consumer group** (`XREADGROUP GROUP builders …`), processes, then
  `XADD benchmark_queue` for the next stage.
- `benchmarker` consumes `benchmark_queue`, runs the fleet, scores, done.

This buys three things every distributed system wants:

1. **Decoupling** — stages fail and restart independently.
2. **Backpressure** — if builders are slow, jobs queue up instead of crashing the API.
3. **Horizontal scale** — run 10 builders; the consumer group splits work across them.

> 🧮 **Delivery semantics — at-least-once.** A worker reads a job, processes it, *then* `XACK`s
> it. If the worker dies mid-job, the job isn't acked, so another worker re-processes it. That
> means jobs can run **more than once**, so each stage must be **idempotent** (safe to repeat).
> "At-least-once + idempotent" is the standard, pragmatic alternative to the much harder
> "exactly-once."

> 📎 **In the codebase:** `enqueue_build()` in `submission/main.py`; the `_consume()` loops in
> `sandbox/builder.py` and `benchmark/worker.py` (note the `XACK` *after* processing).

---

## 5. Object storage: MinIO (S3)

Submitted code goes to **MinIO**, an S3-compatible object store — *not* into the database.

Why? Databases are for queryable, structured data; **blobs** (tarballs, binaries) belong in
object storage, which is cheap, scales infinitely, and streams large files efficiently. The
queue message carries only a small **`s3_key` pointer**; the builder fetches the bytes when it
needs them. (This pointer-in-queue, blob-in-store pattern is everywhere in real systems.)

> 📎 **In the codebase:** `submit_code()` streams the upload to MinIO; `_download_source()`
> pulls it back in the builder. Note the chunked size validation to avoid loading a 50 MB file
> into memory at once.

---

## 6. Time-series database: TimescaleDB (IICPC: *Telemetry Ingester*)

A single benchmark emits a flood of latency events — one per order, potentially millions.
That's **time-series data**, and it has a specialized home: **TimescaleDB** (PostgreSQL +
time-series superpowers).

- **Hypertables** — `latency_events` is auto-partitioned into time "chunks" (1-hour intervals),
  so inserts and time-range queries stay fast even with billions of rows.
- **Continuous aggregates** — `latency_1min` is a materialized, auto-refreshing 1-minute
  rollup (throughput, avg latency per submission). You query the cheap summary, not the raw
  firehose.
- Plain tables for the *results*: `benchmark_scores`, `correctness_violations`,
  `validation_results`, `build_events`.

**Where does the raw latency come from?** From **Envoy**. Each contestant engine sits behind an
Envoy sidecar proxy; Envoy logs every request (with timing) to a shared volume; the `ingester`
service tails those logs and inserts `latency_events`. This is the "telemetry ingester" — the
network proxy *is* the measurement point, which is more trustworthy than asking the engine to
self-report.

> 📎 **In the codebase:** `telemetry/schema.sql` (hypertable + continuous aggregate),
> `telemetry/ingester.py` (Envoy log → rows), and the `INSERT … latency_events` calls in
> `benchmark/worker.py`.

---

## 7. Real-time streaming (IICPC: *Real-Time Leaderboard*)

When a new score lands, the leaderboard must update **live**, with no refresh. UORA uses:

- **Redis Pub/Sub** internally: the benchmarker `PUBLISH`es to `uora:leaderboard:updates`.
- **Server-Sent Events (SSE)** to the browser: the `submission` service subscribes to that
  Redis channel and streams events down a long-lived HTTP connection to the dashboard.

> **Why SSE, not WebSockets?** The leaderboard is **one-directional** (server → browser). SSE
> is simpler, runs over plain HTTP, and **auto-reconnects** — perfect for a live feed. WebSockets
> shine when the *client* also needs to push frequently; here it'd be overkill. Choosing the
> simpler tool that fits is an engineering virtue, not a shortcut.

> 📎 **In the codebase:** `stream_leaderboard()` in `submission/main.py` (the SSE generator,
> with a TimescaleDB fallback poll if Pub/Sub is quiet) and `useSSE.ts` on the frontend.

---

## 8. How it maps to the four IICPC requirements

| IICPC requirement | UORA implementation |
|-------------------|---------------------|
| **Submission & Sandboxing** | `submission` API + MinIO + `builder` (BuildKit, scratch images, gVisor/seccomp Pod) |
| **Distributed Bot Fleet** | `benchmarker` + `bot_fleet/` (async `BotCoordinator` + `TradingBot`, REST/FIX, LOBSTER replay) |
| **Telemetry & Validation Ingester** | Envoy sidecar → `ingester` → TimescaleDB hypertables; `validator/` L1–L4 |
| **Real-Time Leaderboard** | `scoring/` → Redis Pub/Sub → SSE → Next.js dashboard |

All four are present and wired. The honest gaps (Module 09 §5) are *refinements within*
components — real `resource_penalty`, the two zeroed anomaly features — not missing pieces.

---

## 9. Real-world caveats

- **Local fallback ≠ production.** `KUBERNETES_ENABLED=false` runs a plain Docker container
  without gVisor. Great for dev, *not* the security posture you'd demo as production.
- **Single points of failure.** One Redis, one TimescaleDB. Real deployments cluster/replicate
  them. Know where your SPOFs are.
- **At-least-once means duplicates.** If a stage isn't perfectly idempotent, a re-delivered job
  can double-insert. Worth auditing.
- **Resource metering is stubbed** (Module 09 §5): the sandbox limits CPU/memory but the
  *score* doesn't yet read real usage. The plumbing (`resources:{id}` in Redis) exists; the
  measurement doesn't.

---

## 10. Exercises

1. **Trace it.** Open `submission/main.py`, `sandbox/builder.py`, and `benchmark/worker.py`
   side by side and follow one submission_id from `XADD build_queue` to `PUBLISH
   uora:leaderboard:updates`. List every Redis key and stream it touches.
2. **Why scratch?** Explain to a teammate why `FROM scratch` for the runtime image is a
   security win. What can't an attacker do inside it?
3. **Idempotency hunt.** Pick one pipeline stage. What happens if it runs twice on the same
   job? Is it safe? If not, how would you make it idempotent?
4. **Run it (if you have Docker).** `docker compose up` the stack, submit `dummy_bot.cpp`, and
   watch the status transitions in Redis (`HGETALL submission:<id>`).
5. **Stretch.** Sketch how you'd add a *second* benchmarker for horizontal scale. What changes
   in the consumer-group code? (Hint: trick question — that's the point of consumer groups.)

---

## 11. 📚 Resources

- **gVisor** (gvisor.dev) — read "What is gVisor?" — the clearest intro to user-space kernel
  sandboxing.
- **Redis Streams** (redis.io/docs/data-types/streams) — consumer groups, `XREADGROUP`,
  `XACK`. The official guide is excellent.
- **TimescaleDB docs** — "Hypertables" and "Continuous Aggregates." See why a TSDB beats plain
  Postgres for telemetry.
- **Martin Kleppmann — *Designing Data-Intensive Applications*** — the single best book on
  queues, storage, replication, and delivery semantics. If you read one systems book, this.
- **Google SRE Book** (free, sre.google) — chapters on load, queues, and cascading failures.
- **MDN — "Using server-sent events"** — the SSE primer behind §7.

---

## 🎓 You've finished the handbook

Look back at what you can now do:

- Read an order book and explain price-time priority (01).
- Reason about every order type and edge case (02) and the order lifecycle (03).
- Understand real market data and replay it (04).
- Measure latency correctly and know why the average lies (05).
- Do the math: variance, regression, similarity, distance (06).
- Judge correctness and determinism (07).
- Catch cheaters and instability with ML (08).
- Derive and defend the scoring formula (09).
- Explain the whole distributed, sandboxed, real-time system (10).

That's the toolkit of a **quant developer**. Revisit the exercises, then read the appendices:

- **[Appendix A — Math Reference](appendix-a-math-reference.md)** — every formula, one page.
- **[Appendix B — Resources](appendix-b-resources.md)** — the curated path from here to expert.

Welcome to quant. Now go break (and build) things — safely.
