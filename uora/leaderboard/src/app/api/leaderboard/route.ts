import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// ── Mock Data (realistic teams for demo/presentation) ────────────────────────

const MOCK_TEAMS = [
  { team: "NanoTrade Alpha", language: "C++", base_score: 96.4, base_p99: 0.38, base_throughput: 68200, correctness: 0.9997 },
  { team: "RustBolt Engine", language: "Rust", base_score: 94.1, base_p99: 0.42, base_throughput: 65100, correctness: 0.9994 },
  { team: "GoFast Systems", language: "Go", base_score: 91.7, base_p99: 0.55, base_throughput: 59800, correctness: 0.9991 },
  { team: "HyperMatch Labs", language: "C++", base_score: 89.3, base_p99: 0.61, base_throughput: 57200, correctness: 0.9988 },
  { team: "Quantum Orderflow", language: "Rust", base_score: 86.8, base_p99: 0.78, base_throughput: 52100, correctness: 0.9982 },
  { team: "LightningLOB", language: "C++", base_score: 84.2, base_p99: 0.89, base_throughput: 48900, correctness: 0.9975 },
  { team: "ByteForge Capital", language: "Go", base_score: 79.6, base_p99: 1.12, base_throughput: 43200, correctness: 0.9961 },
  { team: "Sigma Matching", language: "Rust", base_score: 76.1, base_p99: 1.35, base_throughput: 39800, correctness: 0.9948 },
  { team: "DeepTick Research", language: "C++", base_score: 72.5, base_p99: 1.68, base_throughput: 35600, correctness: 0.9932 },
  { team: "Velocity Trading", language: "Go", base_score: 68.9, base_p99: 2.01, base_throughput: 31200, correctness: 0.9918 },
];

function jitter(base: number, pct: number): number {
  return base * (1 + (Math.random() - 0.5) * 2 * pct);
}

function generateLeaderboardData() {
  const entries = MOCK_TEAMS.map((t, i) => ({
    rank: i + 1,
    submission_id: `sub-${t.team.toLowerCase().replace(/\s+/g, "-")}`,
    team: t.team,
    language: t.language,
    composite_score: Math.round(jitter(t.base_score, 0.015) * 100) / 100,
    p99_latency_ms: Math.round(jitter(t.base_p99, 0.08) * 1000) / 1000,
    p50_latency_ms: Math.round(jitter(t.base_p99 * 0.4, 0.1) * 1000) / 1000,
    throughput: Math.round(jitter(t.base_throughput, 0.05)),
    correctness_rate: t.correctness,
    status: "completed" as const,
    anomaly_score: Math.random() < 0.15 ? Math.round(Math.random() * 0.4 * 100) / 100 : 0,
  }));

  // Re-sort by composite score (jitter may reorder slightly)
  entries.sort((a, b) => b.composite_score - a.composite_score);
  entries.forEach((e, i) => (e.rank = i + 1));

  return entries;
}

function generateMetricsData() {
  return {
    type: "metrics" as const,
    timestamp: Date.now(),
    p50: Math.round((0.35 + Math.random() * 0.15) * 1000) / 1000,
    p90: Math.round((0.65 + Math.random() * 0.25) * 1000) / 1000,
    p99: Math.round((0.90 + Math.random() * 0.40) * 1000) / 1000,
    throughput: Math.round(55000 + Math.random() * 15000),
  };
}

// Note: Real-time data comes from the Python backend via Redis pub/sub.
// This SSE route serves realistic demo data for the frontend dashboard.
// In production, the frontend connects directly to the backend SSE endpoint.

// ── SSE Route ────────────────────────────────────────────────────────────────

export async function GET() {
  const encoder = new TextEncoder();
  let interval: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (payload: string) => {
        try {
          controller.enqueue(encoder.encode(payload));
        } catch {
          // Stream closed
        }
      };

      // Send initial heartbeat
      enqueue(`: heartbeat\n\n`);

      // Send initial leaderboard immediately
      const initialEntries = generateLeaderboardData();
      enqueue(`data: ${JSON.stringify({ type: "leaderboard", entries: initialEntries })}\n\n`);

      // Send metrics + updated leaderboard every 3 seconds
      let tick = 0;
      interval = setInterval(() => {
        tick++;

        // Metrics every tick
        const metrics = generateMetricsData();
        enqueue(`data: ${JSON.stringify(metrics)}\n\n`);

        // Leaderboard every 2 ticks (6 seconds)
        if (tick % 2 === 0) {
          const entries = generateLeaderboardData();
          enqueue(`data: ${JSON.stringify({ type: "leaderboard", entries })}\n\n`);
        }

        // Occasional anomaly events
        if (Math.random() < 0.08) {
          const team = MOCK_TEAMS[Math.floor(Math.random() * MOCK_TEAMS.length)];
          enqueue(`data: ${JSON.stringify({
            type: "anomaly",
            timestamp: Date.now(),
            score: Math.round((0.6 + Math.random() * 0.35) * 100) / 100,
            anomaly_type: ["latency_spike", "throughput_drop", "entropy_collapse"][Math.floor(Math.random() * 3)],
            team: team.team,
          })}\n\n`);
        }
      }, 3000);
    },

    cancel() {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
