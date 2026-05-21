"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Navbar } from "@/components/layout/Navbar";
import { LeaderboardTable } from "@/components/dashboard/LeaderboardTable";
import { LatencyChart } from "@/components/dashboard/LatencyChart";
import { ThroughputChart } from "@/components/dashboard/ThroughputChart";
import { AnomalyPulseDetector } from "@/components/dashboard/AnomalyPulseDetector";
import { MarketReplayTheatre } from "@/components/dashboard/MarketReplayTheatre";
import { SubmissionPanel } from "@/components/dashboard/SubmissionPanel";
import { LatencyHeatmapChart } from "@/components/dashboard/LatencyHeatmapChart";
import { LiveOrderbookDepth } from "@/components/dashboard/LiveOrderbookDepth";
import { ScoreRevealLiquidFill } from "@/components/dashboard/ScoreRevealLiquidFill";
import { useSSE } from "@/hooks/useSSE";
import { useLeaderboardStore } from "@/stores/useLeaderboardStore";
import {
  Activity,
  BarChart3,
  Clock3,
  Gauge,
  LayoutDashboard,
  Radio,
  Radar,
  ShieldCheck,
  TrendingUp,
  Upload,
} from "lucide-react";

const sections = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "latency", label: "Latency", icon: Activity },
  { id: "throughput", label: "Throughput", icon: BarChart3 },
  { id: "anomaly", label: "Anomaly", icon: Radar },
  { id: "market", label: "Market Replay", icon: TrendingUp },
  { id: "submit", label: "Submit", icon: Upload },
];

const panelIn = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.24, ease: "easeOut" as const },
};

export default function DashboardPage() {
  const [activeSection, setActiveSection] = useState("overview");
  const { connected, entries, lastUpdated } = useLeaderboardStore();
  useSSE();

  const topScore = entries.length
    ? Math.max(...entries.map((entry) => entry.composite_score)).toFixed(1)
    : "---";
  const bestP99 = entries.length
    ? `${Math.min(...entries.map((entry) => entry.p99_latency_ms)).toFixed(2)}ms`
    : "---";

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#05080d] bg-grid-pattern text-slate-100">
      <Navbar />

      <main className="mx-auto w-full max-w-[1540px] px-4 pb-10 pt-24 sm:px-6 lg:px-8">
        <section className="mb-6 min-w-0 border-b border-[#223047] pb-5">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="min-w-0">
              <div className="mb-4 h-px w-24 bg-gradient-to-r from-uora-cyan to-transparent" />
              <h1 className="max-w-[calc(100vw-2rem)] text-3xl font-semibold tracking-tight text-white sm:max-w-none sm:text-4xl">
                Benchmark Operations
              </h1>
              <p className="mt-2 w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] break-words text-sm leading-6 text-slate-400 sm:w-auto sm:max-w-2xl">
                Live scoring, order-flow telemetry, validation signals, and benchmark submissions.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <StatusPill
                icon={<Radio className="h-4 w-4" />}
                label={connected ? "SSE LIVE" : "OFFLINE"}
                live={connected}
              />
              <div className="flex items-center gap-2 rounded-lg border border-[#2a3a50] bg-[#101823] px-3 py-2 text-xs font-mono text-slate-400">
                <Clock3 className="h-4 w-4 text-slate-500" />
                {lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : "awaiting tick"}
              </div>
            </div>
          </div>

          <div className="mt-6 flex w-[calc(100vw-2rem)] max-w-full gap-2 overflow-x-auto rounded-lg border border-[#253449] bg-[#0b1119] p-1 sm:w-full">
            {sections.map((section) => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-md px-3.5 py-2 text-sm font-semibold transition ${
                  activeSection === section.id
                    ? "bg-uora-cyan/14 text-uora-cyan ring-1 ring-uora-cyan/30"
                    : "text-slate-500 hover:bg-[#101823] hover:text-slate-200"
                }`}
              >
                <section.icon className="h-4 w-4" />
                {section.label}
              </button>
            ))}
          </div>
        </section>

        <AnimatePresence mode="wait">
          {activeSection === "overview" && (
            <motion.div key="overview" {...panelIn} className="space-y-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                  label="Active Submissions"
                  value={entries.length.toString()}
                  icon={<LayoutDashboard className="h-4 w-4" />}
                  color="text-uora-cyan"
                />
                <StatCard
                  label="Top Score"
                  value={topScore}
                  icon={<Gauge className="h-4 w-4" />}
                  color="text-uora-success"
                />
                <StatCard
                  label="Best P99"
                  value={bestP99}
                  icon={<Activity className="h-4 w-4" />}
                  color="text-uora-warning"
                />
                <StatCard
                  label="Validation Alerts"
                  value={entries.filter((entry) => (entry.anomaly_score ?? 0) > 0.7).length.toString()}
                  icon={<ShieldCheck className="h-4 w-4" />}
                  color="text-uora-error"
                />
              </div>

              <div className="grid grid-cols-1 gap-6 xl:grid-cols-[420px_1fr]">
                <ScoreRevealLiquidFill />
                <LatencyChart />
              </div>

              <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <ThroughputChart />
                <LatencyHeatmapChart />
              </div>

              <div className="grid grid-cols-1 gap-6 2xl:grid-cols-[1fr_420px]">
                <LeaderboardTable />
                <div className="space-y-6">
                  <AnomalyPulseDetector />
                  <LiveOrderbookDepth />
                </div>
              </div>
            </motion.div>
          )}

          {activeSection === "latency" && (
            <motion.div key="latency" {...panelIn} className="space-y-6">
              <LatencyChart />
              <LatencyHeatmapChart />
              <LeaderboardTable />
            </motion.div>
          )}

          {activeSection === "throughput" && (
            <motion.div key="throughput" {...panelIn} className="space-y-6">
              <ThroughputChart />
              <LeaderboardTable />
            </motion.div>
          )}

          {activeSection === "anomaly" && (
            <motion.div key="anomaly" {...panelIn} className="space-y-6">
              <AnomalyPulseDetector />
              <LeaderboardTable />
            </motion.div>
          )}

          {activeSection === "market" && (
            <motion.div key="market" {...panelIn} className="space-y-6">
              <MarketReplayTheatre />
              <LatencyChart />
            </motion.div>
          )}

          {activeSection === "submit" && (
            <motion.div key="submit" {...panelIn} className="space-y-6">
              <SubmissionPanel />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

function StatusPill({
  icon,
  label,
  live,
}: {
  icon: React.ReactNode;
  label: string;
  live: boolean;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-[#2a3a50] bg-[#101823] px-3 py-2 text-xs font-mono text-slate-300">
      <span className={live ? "text-uora-success" : "text-uora-error"}>{icon}</span>
      <span className={`h-2 w-2 rounded-full ${live ? "bg-uora-success" : "bg-uora-error"}`} />
      {label}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-[#253449] bg-[#101823] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-mono text-xs uppercase tracking-[0.14em] text-slate-500">{label}</div>
          <div className={`mt-3 font-mono text-2xl font-bold tabular-nums ${color}`}>{value}</div>
        </div>
        <div className={`rounded-md bg-[#0b1119] p-2 ring-1 ring-[#253449] ${color}`}>{icon}</div>
      </div>
    </div>
  );
}
