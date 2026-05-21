"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Navbar } from "@/components/layout/Navbar";
import { LeaderboardTable } from "@/components/dashboard/LeaderboardTable";
import { LatencyChart } from "@/components/dashboard/LatencyChart";
import { AnomalyPulseDetector } from "@/components/dashboard/AnomalyPulseDetector";
import { MarketReplayTheatre } from "@/components/dashboard/MarketReplayTheatre";
import { SubmissionPanel } from "@/components/dashboard/SubmissionPanel";
import { LatencyHeatmapChart } from "@/components/dashboard/LatencyHeatmapChart";
import { LiveOrderbookDepth } from "@/components/dashboard/LiveOrderbookDepth";
import { ScoreRevealLiquidFill } from "@/components/dashboard/ScoreRevealLiquidFill";
import { RunTimeline } from "@/components/dashboard/RunTimeline";
import { useSSE } from "@/hooks/useSSE";
import { useLeaderboardStore } from "@/stores/useLeaderboardStore";
import {
  Activity,
  Clock3,
  Gauge,
  LayoutDashboard,
  Radio,
  ShieldCheck,
  Upload,
  FileSpreadsheet,
  AlertCircle,
  Binary,
  Layers,
} from "lucide-react";

const sections = [
  { id: "submit", label: "Submit portal", icon: Upload },
  { id: "timeline", label: "Run Timeline", icon: Clock3 },
  { id: "leaderboard", label: "Leaderboard", icon: LayoutDashboard },
  { id: "latency", label: "Latency profile", icon: Activity },
  { id: "validation", label: "Validation & Depth", icon: ShieldCheck },
  { id: "reports", label: "Reports", icon: FileSpreadsheet },
];

const panelIn = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.24, ease: "easeOut" as const },
};

export default function DashboardPage() {
  const [activeSection, setActiveSection] = useState("submit");
  const { connected, entries, lastUpdated, submissions } = useLeaderboardStore();
  const [selectedAuditEngine, setSelectedAuditEngine] = useState<string>("");

  useSSE();

  const topScore = entries.length
    ? Math.max(...entries.map((entry) => entry.composite_score)).toFixed(1)
    : "---";
  const bestP99 = entries.length
    ? `${Math.min(...entries.map((entry) => entry.p99_latency_ms)).toFixed(2)}ms`
    : "---";

  const currentAuditItem = entries.find((e) => e.submission_id === selectedAuditEngine) || entries[0];
  const auditP99Latency = currentAuditItem?.p99_latency_ms ?? Number.POSITIVE_INFINITY;

  return (
    <div className="min-h-screen overflow-x-hidden bg-uora-bg bg-dot-pattern text-slate-100">
      <Navbar />

      <main className="mx-auto w-full max-w-[1540px] min-w-0 px-4 pb-12 pt-24 sm:px-6 lg:px-8">
        {/* Dashboard Technical Header */}
        <section className="mb-8 max-w-full border-b border-uora-border pb-6">
          <div className="flex min-w-0 flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="min-w-0 max-w-[calc(100vw-2rem)] sm:max-w-full">
              <div className="mb-3 h-px w-24 bg-gradient-to-r from-uora-cyan to-transparent" />
              <h1 className="max-w-full break-words text-xl font-black tracking-tight text-white font-mono sm:text-3xl md:text-4xl bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent uppercase">
                BENCHMARK OPERATIONS CONSOLE
              </h1>
              <p className="mt-2 max-w-full text-xs sm:text-sm leading-relaxed text-slate-400 font-sans">
                Production submission, isolation, benchmark, validation, and scoring telemetry for matching engines.
              </p>
            </div>

            <div className="flex w-full min-w-0 max-w-[calc(100vw-2rem)] flex-col items-stretch gap-3 sm:max-w-full sm:flex-row sm:flex-wrap sm:items-center xl:w-auto xl:justify-end">
              <StatusPill
                icon={<Radio className="h-4 w-4" />}
                label={connected ? "SSE LIVE" : "OFFLINE"}
                live={connected}
              />
              <div className="flex min-w-0 max-w-full items-center gap-2 rounded-md border border-uora-border bg-uora-surface px-3.5 py-2 text-xs font-mono text-slate-400 sm:text-sm">
                <Clock3 className="h-4 w-4 text-slate-500" />
                <span className="min-w-0 truncate">
                  LAST TICK: {lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : "AWAITING ENGINE"}
                </span>
              </div>
            </div>
          </div>

          {/* Top Telemetry KPI Bar */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 mt-8">
            <StatCard
              label="Active Submissions"
              value={submissions.length.toString()}
              icon={<Layers className="h-4 w-4" />}
              color="text-uora-cyan"
            />
            <StatCard
              label="Top Composite Score"
              value={topScore}
              icon={<Gauge className="h-4 w-4" />}
              color="text-uora-success"
            />
            <StatCard
              label="Best Tail Latency (P99)"
              value={bestP99}
              icon={<Activity className="h-4 w-4" />}
              color="text-uora-warning"
            />
            <StatCard
              label="Critical Anomalies"
              value={entries.filter((entry) => (entry.anomaly_score ?? 0) > 0.7).length.toString()}
              icon={<ShieldCheck className="h-4 w-4" />}
              color="text-uora-error"
            />
          </div>

          {/* Tabs Navigation Bar */}
          <div className="mt-8 flex w-full min-w-0 max-w-[calc(100vw-2rem)] gap-2 overflow-x-auto rounded-md border border-uora-border bg-uora-surface/40 p-2 sm:max-w-full">
            {sections.map((section) => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`inline-flex shrink-0 items-center gap-2 rounded px-3 py-2 text-[11px] sm:text-xs font-mono font-bold uppercase tracking-wider transition ${
                  activeSection === section.id
                    ? "bg-uora-cyan/10 text-uora-cyan border border-uora-cyan/30 shadow-[0_0_12px_rgba(226,181,62,0.1)]"
                    : "text-slate-500 border border-transparent hover:text-slate-300 hover:bg-uora-elevated"
                }`}
              >
                <section.icon className="h-4 w-4" />
                {section.label}
              </button>
            ))}
          </div>
        </section>

        {/* Tab Panels */}
        <AnimatePresence mode="wait">
          {activeSection === "submit" && (
            <motion.div key="submit" {...panelIn} className="space-y-6">
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_420px]">
                <SubmissionPanel />
                <div className="bg-uora-surface border border-uora-border rounded-md p-6 flex flex-col justify-between">
                  <div>
                    <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300 mb-4 flex items-center gap-2">
                      <Binary className="w-4 h-4 text-uora-cyan" /> Submit Guidelines
                    </h3>
                    <ul className="space-y-3.5 text-xs text-slate-400 font-sans">
                      <li className="flex items-start gap-2.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-uora-cyan mt-1.5 flex-shrink-0" />
                        <span>Upload matching engines written in <b>C++20</b>, <b>Rust</b>, or <b>Go</b>.</span>
                      </li>
                      <li className="flex items-start gap-2.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-uora-cyan mt-1.5 flex-shrink-0" />
                        <span>Source files are isolated inside gVisor containers with strict CPU & memory constraints.</span>
                      </li>
                      <li className="flex items-start gap-2.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-uora-cyan mt-1.5 flex-shrink-0" />
                        <span>After deployment, the benchmark worker replays a deterministic order-flow scenario and records real latency percentiles.</span>
                      </li>
                      <li className="flex items-start gap-2.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-uora-cyan mt-1.5 flex-shrink-0" />
                        <span>Validation checks fill correctness, state transitions, market invariants, and deterministic replay behavior.</span>
                      </li>
                    </ul>
                  </div>
                  <div className="mt-8 border-t border-uora-border/60 pt-6">
                    <div className="flex items-center gap-3 p-3.5 rounded bg-uora-bg border border-uora-border/80">
                      <AlertCircle className="w-5 h-5 text-uora-warning flex-shrink-0" />
                      <p className="text-[10px] font-mono text-slate-500 leading-normal">
                        Engines must expose the standard order API. Build, runtime, and validation failures are reported directly in the timeline.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeSection === "timeline" && (
            <motion.div key="timeline" {...panelIn}>
              <RunTimeline />
            </motion.div>
          )}

          {activeSection === "leaderboard" && (
            <motion.div key="leaderboard" {...panelIn} className="space-y-6">
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-[400px_1fr]">
                <ScoreRevealLiquidFill />
                <LeaderboardTable />
              </div>
            </motion.div>
          )}

          {activeSection === "latency" && (
            <motion.div key="latency" {...panelIn} className="space-y-6">
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <LatencyChart />
                <LatencyHeatmapChart />
              </div>
              <LeaderboardTable />
            </motion.div>
          )}

          {activeSection === "validation" && (
            <motion.div key="validation" {...panelIn} className="space-y-6">
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <AnomalyPulseDetector />
                <LiveOrderbookDepth />
              </div>
              <MarketReplayTheatre />
            </motion.div>
          )}

          {activeSection === "reports" && (
            <motion.div key="reports" {...panelIn} className="space-y-6">
              <div className="bg-uora-surface border border-uora-border rounded-md p-6">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-uora-border/60 pb-4 mb-6">
                  <div>
                    <h3 className="text-sm font-semibold text-white font-mono uppercase tracking-wide">
                      SYSTEM PERFORMANCE AUDITS
                    </h3>
                    <p className="text-xs text-slate-500 mt-1 font-mono">
                      Generate cryptographic compliance telemetry reviews for verified match engines.
                    </p>
                  </div>
                  <div>
                    {entries.length > 0 && (
                      <select
                        value={selectedAuditEngine}
                        onChange={(e) => setSelectedAuditEngine(e.target.value)}
                        className="bg-uora-bg border border-uora-border rounded px-3 py-1.5 text-xs font-mono text-slate-300 focus:outline-none focus:border-uora-cyan transition-colors"
                      >
                        <option value="">Select engine to audit...</option>
                        {entries.map((e) => (
                          <option key={e.submission_id} value={e.submission_id}>
                            {e.team} ({e.submission_id.slice(0, 8)})
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>

                {entries.length === 0 ? (
                  <div className="text-center py-16">
                    <FileSpreadsheet className="w-10 h-10 text-slate-700 mx-auto mb-4" />
                    <p className="text-xs font-mono font-bold tracking-wider text-slate-400 uppercase">NO AUDITABLE DATA YET</p>
                    <p className="text-[10px] font-sans text-slate-600 mt-1 max-w-sm mx-auto">
                      Matching engines must complete benchmark, validation, and scoring before a report can be reviewed.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <AuditMetric
                        label="TAIL LATENCY STATUS"
                        value={auditP99Latency < 2.0 ? "WITHIN TARGET" : "REVIEW REQUIRED"}
                        detail="Threshold: p99 latency < 2.00ms for this benchmark profile"
                        color={auditP99Latency < 2.0 ? "text-uora-success" : "text-uora-error"}
                      />
                      <AuditMetric
                        label="VALIDATION CORRECTNESS"
                        value={currentAuditItem ? `${(currentAuditItem.correctness_rate * 100).toFixed(2)}% OK` : "---"}
                        detail="Fill, state-machine, invariant, and replay checks"
                        color="text-uora-cyan"
                      />
                      <AuditMetric
                        label="RUN STATUS"
                        value={currentAuditItem?.status?.toUpperCase() || "---"}
                        detail="Latest persisted benchmark lifecycle state"
                        color="text-slate-300"
                      />
                    </div>

                    <div className="bg-uora-bg rounded border border-uora-border p-4">
                      <div className="flex items-center justify-between mb-3 border-b border-uora-border/60 pb-2">
                        <span className="text-[10px] font-mono font-bold tracking-wider text-slate-500 uppercase">
                          MATCHING ENGINE METRICS MATRIX
                        </span>
                        <span className="text-[9px] font-mono text-slate-600 uppercase">
                          Telemetry Checksum: 0x{currentAuditItem?.submission_id.slice(0, 8)}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-mono">
                        <div>
                          <div className="text-[9px] text-slate-500">P50 LATENCY</div>
                          <div className="text-slate-200 mt-1 font-bold">{(currentAuditItem?.p50_latency_ms ?? 0).toFixed(3)}ms</div>
                        </div>
                        <div>
                          <div className="text-[9px] text-slate-500">P90 LATENCY</div>
                          <div className="text-slate-200 mt-1 font-bold">{(currentAuditItem?.p90_latency_ms ?? 0).toFixed(3)}ms</div>
                        </div>
                        <div>
                          <div className="text-[9px] text-slate-500">P99 TAIL LIMIT</div>
                          <div className="text-uora-warning mt-1 font-bold">{currentAuditItem?.p99_latency_ms.toFixed(3)}ms</div>
                        </div>
                        <div>
                          <div className="text-[9px] text-slate-500">PEAK THROUGHPUT</div>
                          <div className="text-uora-cyan mt-1 font-bold">{currentAuditItem?.throughput.toLocaleString()} tps</div>
                        </div>
                      </div>
                    </div>

                    <div className="bg-uora-bg rounded border border-uora-border p-4">
                      <div className="text-[10px] font-mono font-bold tracking-wider text-slate-500 mb-3 border-b border-uora-border/60 pb-2 uppercase">
                        Report Availability
                      </div>
                      <div className="font-mono text-[10px] text-slate-500 leading-relaxed">
                        The backend generates score reports during scoring. A download endpoint is intentionally not shown until the report artifact is exposed by the API.
                      </div>
                    </div>
                  </div>
                )}
              </div>
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
    <div className="flex max-w-full items-center gap-2.5 rounded-md border border-uora-border bg-uora-surface px-3.5 py-2 text-xs font-mono text-slate-300 sm:text-sm">
      <span className={live ? "text-uora-success" : "text-uora-error"}>{icon}</span>
      <span className={`h-2 w-2 rounded-full ${live ? "bg-uora-success" : "bg-uora-error"}`} />
      <span>{label}</span>
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
    <div className="min-w-0 rounded-md border border-uora-border bg-uora-surface p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-slate-500 font-bold">{label}</div>
          <div className={`mt-2 font-mono text-xl sm:text-2xl font-bold tabular-nums tracking-tight ${color}`}>{value}</div>
        </div>
        <div className={`rounded bg-uora-bg p-2 border border-uora-border ${color} flex-shrink-0`}>{icon}</div>
      </div>
    </div>
  );
}

function AuditMetric({
  label,
  value,
  detail,
  color,
}: {
  label: string;
  value: string;
  detail: string;
  color: string;
}) {
  return (
    <div className="border border-uora-border bg-uora-surface/60 rounded p-4">
      <div className="text-[10px] font-mono text-slate-500 tracking-wider uppercase font-bold">{label}</div>
      <div className={`text-lg sm:text-xl font-bold font-mono mt-2 ${color}`}>{value}</div>
      <div className="text-[11px] text-slate-500 mt-1.5 leading-normal">{detail}</div>
    </div>
  );
}
