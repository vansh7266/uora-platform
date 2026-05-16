import { NextResponse } from "next/server";
import Redis from "ioredis";
import { Pool } from "pg";

export const dynamic = "force-dynamic";

export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let isMockFallback = false;
      let redisClient: Redis | null = null;
      let pgPool: Pool | null = null;
      let pgInterval: NodeJS.Timeout | null = null;
      let mockInterval: NodeJS.Timeout | null = null;

      try {
        // 1. Setup Redis Connection
        redisClient = new Redis("redis://localhost:6379/0", {
          maxRetriesPerRequest: 1,
          retryStrategy(times) {
            if (times > 3) {
              console.warn("Redis connection failed. Falling back to mock data.");
              isMockFallback = true;
              return null; // Stop retrying
            }
            return Math.min(times * 50, 2000);
          },
        });

        redisClient.on("error", (err) => {
          // Errors are handled by retry strategy fallback
        });

        await redisClient.subscribe("uora:leaderboard:updates");
        redisClient.on("message", (channel, message) => {
          if (!isMockFallback && channel === "uora:leaderboard:updates") {
            try {
              const data = JSON.parse(message);
              // Expected formats: {"type": "metrics", ...} or {"type": "leaderboard", "entries": [...]}
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
            } catch (e) {
              console.error("Failed to parse Redis message:", message);
            }
          }
        });

        // 2. Setup TimescaleDB Connection
        pgPool = new Pool({
          connectionString: process.env.DATABASE_URL || "postgresql://uora:uora12345@localhost:5432/uora_metrics",
          connectionTimeoutMillis: 2000,
        });

        pgInterval = setInterval(async () => {
          if (isMockFallback) return;
          try {
            const { rows } = await pgPool!.query(`
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
                p99_latency_ms: r.p99_latency_ns / 1000000.0,
                throughput: r.throughput,
                correctness_rate: parseFloat(r.correctness_rate),
                status: "completed"
              }));
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "leaderboard", entries })}\n\n`));
            }
          } catch (e) {
            console.error("PG query failed:", e);
          }
        }, 5000);

        // 3. Fallback Mock Data Generator
        mockInterval = setInterval(() => {
          if (isMockFallback) {
            const mockLeaderboard = {
              type: "leaderboard",
              entries: [
                {
                  rank: 1, team: "Fallback Alpha", submission_id: "fb-1", composite_score: 95.2,
                  p99_latency_ms: 0.5, throughput: 45000, correctness_rate: 0.999, status: "completed"
                }
              ]
            };
            const mockMetrics = {
              type: "metrics",
              timestamp: Date.now(),
              p50: 0.5 + Math.random() * 0.1,
              p90: 0.8 + Math.random() * 0.2,
              p99: 1.2 + Math.random() * 0.3,
              throughput: 40000 + Math.random() * 5000
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(mockLeaderboard)}\n\n`));
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(mockMetrics)}\n\n`));
          }
        }, 2000);

        // Heartbeat
        controller.enqueue(encoder.encode(`: heartbeat\n\n`));

      } catch (err) {
        console.error("Error setting up connections:", err);
      }

      controller.close = () => {
        if (redisClient) redisClient.quit();
        if (pgPool) pgPool.end();
        if (pgInterval) clearInterval(pgInterval);
        if (mockInterval) clearInterval(mockInterval);
      };
    },
    cancel() {
      console.log("Client disconnected");
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
