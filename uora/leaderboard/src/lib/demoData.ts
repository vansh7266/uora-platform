/**
 * UORA Demo Mode — Seeded realistic data for the demo account.
 *
 * When a user logs in with demo@uora.io / DemoUORA2024,
 * all dashboard panels read from this module instead of the live backend.
 */

import type { LeaderboardEntry, MetricUpdate, AnomalyEvent, Submission } from "@/stores/useLeaderboardStore";

export const DEMO_EMAIL = "demo@uora.io";
export const DEMO_PASSWORD = "DemoUORA2024";
export const DEMO_USER = {
  id: "demo-0000-0000-0001",
  name: "Demo Analyst",
  email: DEMO_EMAIL,
  avatar: "",
  team: "UORA Demo Desk",
};

// ── Leaderboard entries ───────────────────────────────────────────────────────

export const DEMO_ENTRIES: LeaderboardEntry[] = [
  {
    rank: 1,
    prevRank: 2,
    submission_id: "ae3f1b2c-0001-0001-0001-000000000001",
    team: "Tachyon Labs",
    language: "cpp",
    composite_score: 97.4,
    p50_latency_ms: 0.18,
    p90_latency_ms: 0.31,
    p99_latency_ms: 0.52,
    throughput: 1_240_000,
    max_tps: 1_410_000,
    success_rate: 0.9998,
    error_rate: 0.0002,
    correctness_rate: 0.9997,
    anomaly_score: 0.012,
    status: "scored",
  },
  {
    rank: 2,
    prevRank: 1,
    submission_id: "ae3f1b2c-0002-0002-0002-000000000002",
    team: "Nanosecond Collective",
    language: "rust",
    composite_score: 94.1,
    p50_latency_ms: 0.22,
    p90_latency_ms: 0.38,
    p99_latency_ms: 0.71,
    throughput: 1_080_000,
    max_tps: 1_190_000,
    success_rate: 0.9994,
    error_rate: 0.0006,
    correctness_rate: 0.9989,
    anomaly_score: 0.031,
    status: "scored",
  },
  {
    rank: 3,
    prevRank: 3,
    submission_id: "ae3f1b2c-0003-0003-0003-000000000003",
    team: "Lattice Systems",
    language: "cpp",
    composite_score: 91.8,
    p50_latency_ms: 0.29,
    p90_latency_ms: 0.47,
    p99_latency_ms: 0.89,
    throughput: 985_000,
    max_tps: 1_050_000,
    success_rate: 0.9991,
    error_rate: 0.0009,
    correctness_rate: 0.9985,
    anomaly_score: 0.044,
    status: "scored",
  },
  {
    rank: 4,
    prevRank: 5,
    submission_id: "ae3f1b2c-0004-0004-0004-000000000004",
    team: "UORA Demo Desk",
    language: "cpp",
    composite_score: 88.3,
    p50_latency_ms: 0.34,
    p90_latency_ms: 0.58,
    p99_latency_ms: 1.12,
    throughput: 870_000,
    max_tps: 920_000,
    success_rate: 0.9988,
    error_rate: 0.0012,
    correctness_rate: 0.9981,
    anomaly_score: 0.067,
    status: "scored",
  },
  {
    rank: 5,
    prevRank: 4,
    submission_id: "ae3f1b2c-0005-0005-0005-000000000005",
    team: "Photon Markets",
    language: "go",
    composite_score: 82.6,
    p50_latency_ms: 0.41,
    p90_latency_ms: 0.69,
    p99_latency_ms: 1.44,
    throughput: 740_000,
    max_tps: 810_000,
    success_rate: 0.9981,
    error_rate: 0.0019,
    correctness_rate: 0.9974,
    anomaly_score: 0.098,
    status: "scored",
  },
  {
    rank: 6,
    prevRank: 7,
    submission_id: "ae3f1b2c-0006-0006-0006-000000000006",
    team: "Coldpath Engine",
    language: "rust",
    composite_score: 78.9,
    p50_latency_ms: 0.49,
    p90_latency_ms: 0.81,
    p99_latency_ms: 1.73,
    throughput: 680_000,
    max_tps: 730_000,
    success_rate: 0.9977,
    error_rate: 0.0023,
    correctness_rate: 0.9969,
    anomaly_score: 0.124,
    status: "scored",
  },
  {
    rank: 7,
    prevRank: 6,
    submission_id: "ae3f1b2c-0007-0007-0007-000000000007",
    team: "Orderflow Labs",
    language: "cpp",
    composite_score: 74.2,
    p50_latency_ms: 0.57,
    p90_latency_ms: 0.94,
    p99_latency_ms: 2.01,
    throughput: 610_000,
    max_tps: 660_000,
    success_rate: 0.9972,
    error_rate: 0.0028,
    correctness_rate: 0.9963,
    anomaly_score: 0.151,
    status: "scored",
  },
  {
    rank: 8,
    prevRank: 8,
    submission_id: "ae3f1b2c-0008-0008-0008-000000000008",
    team: "Zerocopy Crew",
    language: "go",
    composite_score: 69.7,
    p50_latency_ms: 0.68,
    p90_latency_ms: 1.14,
    p99_latency_ms: 2.48,
    throughput: 540_000,
    max_tps: 590_000,
    success_rate: 0.9965,
    error_rate: 0.0035,
    correctness_rate: 0.9956,
    anomaly_score: 0.188,
    status: "scored",
  },
];

// ── Latency time-series metrics ───────────────────────────────────────────────

function makeMetrics(): MetricUpdate[] {
  const now = Date.now();
  const points: MetricUpdate[] = [];
  for (let i = 59; i >= 0; i--) {
    const t = now - i * 2000;
    const noise = () => (Math.random() - 0.5) * 0.08;
    points.push({
      timestamp: t,
      p50: +(0.34 + noise()).toFixed(3),
      p90: +(0.58 + noise() * 1.5).toFixed(3),
      p99: +(1.12 + noise() * 2.5).toFixed(3),
      throughput: Math.round(870_000 + (Math.random() - 0.5) * 40_000),
    });
  }
  return points;
}

export const DEMO_METRICS: MetricUpdate[] = makeMetrics();

// ── Anomaly events ────────────────────────────────────────────────────────────

export const DEMO_ANOMALIES: AnomalyEvent[] = [
  { timestamp: Date.now() - 120_000, score: 0.72, type: "latency_spike", team: "Zerocopy Crew" },
  { timestamp: Date.now() - 240_000, score: 0.58, type: "order_imbalance", team: "Photon Markets" },
  { timestamp: Date.now() - 480_000, score: 0.44, type: "throughput_drop", team: "Orderflow Labs" },
];

// ── Submission history ────────────────────────────────────────────────────────

export const DEMO_SUBMISSIONS: Submission[] = [
  {
    id: "ae3f1b2c-0004-0004-0004-000000000004",
    team: "UORA Demo Desk",
    language: "cpp",
    status: "scored",
    submittedAt: Date.now() - 18 * 60_000,
  },
  {
    id: "demo-prev-0002",
    team: "UORA Demo Desk",
    language: "rust",
    status: "failed",
    submittedAt: Date.now() - 65 * 60_000,
    error: "Build timeout: compilation exceeded 120s limit",
    failedStage: "building",
  },
  {
    id: "demo-prev-0001",
    team: "UORA Demo Desk",
    language: "cpp",
    status: "scored",
    submittedAt: Date.now() - 3 * 3600_000,
  },
];

// ── Simulated submission pipeline stages ─────────────────────────────────────

export const DEMO_PIPELINE_STAGES = [
  { status: "building", delay: 800 },
  { status: "built",    delay: 1600 },
  { status: "deployed", delay: 2600 },
  { status: "benchmarking", delay: 4000 },
  { status: "validating",   delay: 5800 },
  { status: "scored",       delay: 7200 },
] as const;
