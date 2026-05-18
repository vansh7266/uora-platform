"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Navbar } from "@/components/layout/Navbar";
import { Sidebar } from "@/components/layout/Sidebar";
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
  LayoutDashboard,
  Activity,
  BarChart3,
  Radar,
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

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" as const } },
};

export default function DashboardPage() {
  const [activeSection, setActiveSection] = useState("overview");
  const { connected, entries, lastUpdated } = useLeaderboardStore();
  useSSE();

  return (
    <div className="min-h-screen bg-uora-bg">
      <Navbar />
      <Sidebar activeSection={activeSection} onSectionChange={setActiveSection} />

      <main className="pt-16 lg:pl-[200px] transition-all duration-300">
        <div className="p-4 sm:p-6 lg:p-8 max-w-[1800px] mx-auto">
          {/* Dashboard Header */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4"
          >
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                Dashboard
              </h1>
              <p className="text-sm text-slate-500 mt-1">
                Real-time HFT benchmark monitoring
              </p>
            </div>

            <div className="flex items-center gap-3">
              {/* Section quick-nav pills */}
              <div className="hidden md:flex items-center gap-1 bg-uora-surface border border-uora-border rounded-xl p-1">
                {sections.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setActiveSection(s.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                      activeSection === s.id
                        ? "bg-uora-cyan/10 text-uora-cyan border border-uora-cyan/20"
                        : "text-slate-500 hover:text-slate-300"
                    }`}
                  >
                    <s.icon className="w-3 h-3" />
                    {s.label}
                  </button>
                ))}
              </div>

              {/* Last updated */}
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-uora-surface border border-uora-border">
                <div
                  className={`w-2 h-2 rounded-full ${
                    connected
                      ? "bg-uora-success animate-pulse"
                      : "bg-uora-error"
                  }`}
                />
                <span className="text-xs font-mono text-slate-400">
                  {connected
                    ? lastUpdated
                      ? `Updated ${new Date(lastUpdated).toLocaleTimeString()}`
                      : "LIVE"
                    : "OFFLINE"}
                </span>
              </div>
            </div>
          </motion.div>

          {/* Content */}
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            <AnimatePresence mode="wait">
              {activeSection === "overview" && (
                <motion.div
                  key="overview"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.25 }}
                  className="space-y-6"
                >
                  {/* Stats row */}
                  <motion.div
                    variants={itemVariants}
                    className="grid grid-cols-2 md:grid-cols-4 gap-4"
                  >
                    <StatCard
                      label="Active Teams"
                      value={entries.length.toString()}
                      icon={<LayoutDashboard className="w-4 h-4" />}
                      color="text-uora-cyan"
                    />
                    <StatCard
                      label="Top Score"
                      value={
                        entries.length > 0
                          ? Math.max(...entries.map((e) => e.composite_score)).toFixed(1)
                          : "---"
                      }
                      icon={<BarChart3 className="w-4 h-4" />}
                      color="text-uora-success"
                    />
                    <StatCard
                      label="Best P99"
                      value={
                        entries.length > 0
                          ? Math.min(...entries.map((e) => e.p99_latency_ms)).toFixed(2) + "ms"
                          : "---"
                      }
                      icon={<Activity className="w-4 h-4" />}
                      color="text-uora-warning"
                    />
                    <StatCard
                      label="Anomalies"
                      value={entries.filter((e) => (e.anomaly_score ?? 0) > 0.7).length.toString()}
                      icon={<Radar className="w-4 h-4" />}
                      color="text-uora-error"
                    />
                  </motion.div>

                  {/* Score Reveal + Latency */}
                  <motion.div
                    variants={itemVariants}
                    className="grid grid-cols-1 lg:grid-cols-3 gap-6"
                  >
                    <ScoreRevealLiquidFill />
                    <div className="lg:col-span-2">
                      <LatencyChart />
                    </div>
                  </motion.div>

                  {/* Throughput + Heatmap */}
                  <motion.div
                    variants={itemVariants}
                    className="grid grid-cols-1 lg:grid-cols-2 gap-6"
                  >
                    <ThroughputChart />
                    <LatencyHeatmapChart />
                  </motion.div>

                  {/* Leaderboard + Orderbook Depth */}
                  <motion.div
                    variants={itemVariants}
                    className="grid grid-cols-1 xl:grid-cols-3 gap-6"
                  >
                    <div className="xl:col-span-2">
                      <LeaderboardTable />
                    </div>
                    <div className="space-y-6">
                      <AnomalyPulseDetector />
                      <LiveOrderbookDepth />
                    </div>
                  </motion.div>
                </motion.div>
              )}

              {activeSection === "latency" && (
                <motion.div
                  key="latency"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.25 }}
                  className="space-y-6"
                >
                  <LatencyChart />
                  <LeaderboardTable />
                </motion.div>
              )}

              {activeSection === "throughput" && (
                <motion.div
                  key="throughput"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.25 }}
                  className="space-y-6"
                >
                  <ThroughputChart />
                  <LeaderboardTable />
                </motion.div>
              )}

              {activeSection === "anomaly" && (
                <motion.div
                  key="anomaly"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.25 }}
                  className="space-y-6"
                >
                  <AnomalyPulseDetector />
                  <LeaderboardTable />
                </motion.div>
              )}

              {activeSection === "market" && (
                <motion.div
                  key="market"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.25 }}
                  className="space-y-6"
                >
                  <MarketReplayTheatre />
                  <LatencyChart />
                </motion.div>
              )}

              {activeSection === "submit" && (
                <motion.div
                  key="submit"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.25 }}
                  className="space-y-6"
                >
                  <SubmissionPanel />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </main>
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
    <div className="bg-uora-surface border border-uora-border rounded-xl p-4 flex items-center gap-4">
      <div className={`p-2.5 rounded-lg bg-uora-elevated ${color}`}>
        {icon}
      </div>
      <div>
        <div className="text-xs text-slate-500 font-mono">{label}</div>
        <div className={`text-xl font-bold font-mono tabular-nums ${color}`}>
          {value}
        </div>
      </div>
    </div>
  );
}
