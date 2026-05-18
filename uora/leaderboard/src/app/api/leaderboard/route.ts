import { NextResponse } from "next/server";
import Redis from "ioredis";
import { Pool } from "pg";

export const dynamic = "force-dynamic";

// ── Shared singletons (module-level) ────────────────────────────────────────
// Prevents connection exhaustion under high client counts (30k+ concurrent users).

const REDIS_URL = process.env.REDIS_URL || "redis://:uora12345@redis:6379/0";

let sharedRedis: Redis | null = null;
let sharedPgPool: Pool | null = null;

function getSharedRedis(): Redis {
  if (!sharedRedis || sharedRedis.status === "end") {
    sharedRedis = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 5) {
          console.warn("[SSE] Redis retries exhausted. Will attempt reconnect on next request.");
          return null; // stop retrying; next request recreates
        }
        return Math.min(times * 100, 3000);
      },
      lazyConnect: true,
    });
    sharedRedis.on("error", (err) => {
      console.error("[SSE] Redis connection error:", err.message);
    });
  }
  return sharedRedis;
}

function getSharedPgPool(): Pool {
  if (!sharedPgPool || sharedPgPool.ended) {
    sharedPgPool = new Pool({
      connectionString:
        process.env.DATABASE_URL ||
        "postgresql://uora:uora12345@timescaledb:5432/uora_metrics",
      max: 10, // pool size
      connectionTimeoutMillis: 3000,
      idleTimeoutMillis: 30_000,
    });
    sharedPgPool.on("error", (err) => {
      console.error("[SSE] PG pool idle error:", err.message);
    });
  }
  return sharedPgPool;
}

// ── SSE Route ────────────────────────────────────────────────────────────────

export async function GET() {
  const encoder = new TextEncoder();
  let isMockFallback = false;
  let pgInterval: ReturnType<typeof setInterval> | null = null;
  let mockInterval: ReturnType<typeof setInterval> | null = null;
  let subscriberClient: Redis | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (payload: string) => {
        try {
          controller.enqueue(encoder.encode(payload));
        } catch {
          // Stream already closed — ignore
        }
      };

      try {
        // ── 1. Redis Pub/Sub subscription ──────────────────────────────────
        const redis = getSharedRedis();

        try {
          await redis.connect(); // no-op if already connected (lazyConnect)
        } catch {
          console.warn("[SSE] Redis connect failed — falling back to mock data.");
          isMockFallback = true;
        }

        if (!isMockFallback) {
          // Dedicated subscriber client (ioredis requires a separate connection for subscribe mode)
          subscriberClient = new Redis(REDIS_URL, {
            maxRetriesPerRequest: 3,
            retryStrategy(times) {
              if (times > 5) return null;
              return Math.min(times * 100, 3000);
            },
            lazyConnect: true,
          });

          subscriberClient.on("error", () => {
            // handled by retry strategy
          });

          try {
            await subscriberClient.connect();
            // Subscribe to the unified channel (all publishers use this single channel)
            await subscriberClient.subscribe("uora:leaderboard:updates");

            subscriberClient.on("message", (channel, message) => {
              if (isMockFallback) return;
              try {
                const data = JSON.parse(message);
                // Unified channel carries both metrics and leaderboard events
                // Each message includes a `type` field: "metrics" or "leaderboard"
                if (data.type === "metrics") {
                  enqueue(`data: ${JSON.stringify({ type: "metrics", ...data })}\n\n`);
                } else if (data.type === "leaderboard") {
                  enqueue(`data: ${JSON.stringify({ type: "leaderboard", entries: data.entries ?? data })}\n\n`);
                }
              } catch {
                console.error("[SSE] Failed to parse Redis message on channel:", channel);
              }
            });
          } catch {
            console.warn("[SSE] Redis subscribe failed — falling back to mock data.");
            isMockFallback = true;
            if (subscriberClient) {
              try { await subscriberClient.quit(); } catch { /* ignore */ }
              subscriberClient = null;
            }
          }
        }

        // ── 2. TimescaleDB polling fallback (every 5s) ────────────────────
        if (!isMockFallback) {
          const pg = getSharedPgPool();
          pgInterval = setInterval(async () => {
            try {
              const { rows } = await pg.query(`
                SELECT submission_id as team, composite_score, p99_latency_ns, throughput, correctness_rate
                FROM benchmark_scores
                ORDER BY composite_score DESC
                LIMIT 50
              `);
              if (rows.length > 0) {
                const entries = rows.map((r, i) => ({
                  rank: i + 1,
                  submission_id: r.team,
                  team: r.team,
                  composite_score: parseFloat(r.composite_score),
                  p50_latency_ms: (r.p99_latency_ns / 1_000_000.0) * 0.4,
                  p99_latency_ms: r.p99_latency_ns / 1_000_000.0,
                  throughput: r.throughput,
                  correctness_rate: parseFloat(r.correctness_rate),
                  status: "completed" as const,
                }));
                enqueue(`data: ${JSON.stringify({ type: "leaderboard", entries })}\n\n`);
              }
            } catch (e) {
              console.error("[SSE] PG query failed:", (e as Error).message);
            }
          }, 5000);
        }

        // ── 3. Mock data fallback ──────────────────────────────────────────
        mockInterval = setInterval(() => {
          if (!isMockFallback) return;
          const mockLeaderboard = {
            type: "leaderboard" as const,
            entries: [
              {
                rank: 1,
                team: "Fallback Alpha",
                submission_id: "fb-1",
                composite_score: 95.2,
                p99_latency_ms: 0.5,
                throughput: 45000,
                correctness_rate: 0.999,
                status: "completed" as const,
              },
            ],
          };
          const mockMetrics = {
            type: "metrics" as const,
            timestamp: Date.now(),
            p50: 0.5 + Math.random() * 0.1,
            p90: 0.8 + Math.random() * 0.2,
            p99: 1.2 + Math.random() * 0.3,
            throughput: 40000 + Math.random() * 5000,
          };
          enqueue(`data: ${JSON.stringify(mockLeaderboard)}\n\n`);
          enqueue(`data: ${JSON.stringify(mockMetrics)}\n\n`);
        }, 2000);

        // Heartbeat
        enqueue(`: heartbeat\n\n`);
      } catch (err) {
        console.error("[SSE] Error setting up connections:", (err as Error).message);
        isMockFallback = true;
      }
    },

    // ── Proper cleanup on client disconnect ──────────────────────────────────
    cancel() {
      console.log("[SSE] Client disconnected — cleaning up");

      if (pgInterval) {
        clearInterval(pgInterval);
        pgInterval = null;
      }
      if (mockInterval) {
        clearInterval(mockInterval);
        mockInterval = null;
      }
      if (subscriberClient) {

        subscriberClient
          .quit()
          .catch(() => {
            try { subscriberClient?.disconnect(); } catch { /* ignore */ }
          });
        subscriberClient = null;
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
