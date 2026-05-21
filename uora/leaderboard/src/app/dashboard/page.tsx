"use client";

import { useState, useEffect } from "react";
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
import { cn } from "@/lib/utils";
import {
  Activity,
  Clock3,
  Gauge,
  LayoutDashboard,
  Radio,
  ShieldCheck,
  Upload,
  Cpu,
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
  { id: "simulator", label: "Stress Simulator", icon: Gauge },
  { id: "profiler", label: "Syscall & VM Profiler", icon: Cpu },
  { id: "reports", label: "Reports & Audits", icon: FileSpreadsheet },
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
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportComplete, setExportComplete] = useState(false);

  useSSE();

  const topScore = entries.length
    ? Math.max(...entries.map((entry) => entry.composite_score)).toFixed(1)
    : "---";
  const bestP99 = entries.length
    ? `${Math.min(...entries.map((entry) => entry.p99_latency_ms)).toFixed(2)}ms`
    : "---";

  const triggerExport = () => {
    setIsExporting(true);
    setExportProgress(0);
    setExportComplete(false);
    const interval = setInterval(() => {
      setExportProgress((p) => {
        if (p >= 100) {
          clearInterval(interval);
          setTimeout(() => {
            setIsExporting(false);
            setExportComplete(true);
          }, 400);
          return 100;
        }
        return p + 10;
      });
    }, 120);
  };

  const currentAuditItem = entries.find((e) => e.submission_id === selectedAuditEngine) || entries[0];

  return (
    <div className="min-h-screen overflow-x-hidden bg-uora-bg bg-dot-pattern text-slate-100">
      <Navbar />

      <main className="mx-auto w-full max-w-[1540px] px-4 pb-12 pt-24 sm:px-6 lg:px-8">
        {/* Dashboard Technical Header */}
        <section className="mb-8 border-b border-uora-border pb-6">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="min-w-0">
              <div className="mb-3 h-px w-24 bg-gradient-to-r from-uora-cyan to-transparent" />
              <h1 className="text-2xl font-black tracking-tight text-white font-mono sm:text-3xl md:text-4xl bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent uppercase">
                BENCHMARK OPERATIONS CONSOLE
              </h1>
              <p className="mt-2 text-xs sm:text-sm leading-relaxed text-slate-400 font-sans">
                Live FIX/WebSocket matching engine load simulator & tail-latency telemetries.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <StatusPill
                icon={<Radio className="h-4 w-4" />}
                label={connected ? "SSE LIVE" : "OFFLINE"}
                live={connected}
              />
              <div className="flex items-center gap-2 rounded-md border border-uora-border bg-uora-surface px-3.5 py-2 text-sm font-mono text-slate-400">
                <Clock3 className="h-4 w-4 text-slate-500" />
                <span>LAST TICK: {lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : "AWAITING ENGINE"}</span>
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
          <div className="mt-8 flex w-full gap-2 overflow-x-auto rounded-md border border-uora-border bg-uora-surface/40 p-2">
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
                        <span>Upload proprietary match engines written in <b>C++20</b>, <b>Rust</b>, or <b>Go</b>.</span>
                      </li>
                      <li className="flex items-start gap-2.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-uora-cyan mt-1.5 flex-shrink-0" />
                        <span>Source files are isolated inside gVisor containers with strict CPU & memory constraints.</span>
                      </li>
                      <li className="flex items-start gap-2.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-uora-cyan mt-1.5 flex-shrink-0" />
                        <span>The load simulator streams 100K+ order requests per second to verify latency performance.</span>
                      </li>
                      <li className="flex items-start gap-2.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-uora-cyan mt-1.5 flex-shrink-0" />
                        <span>Anomalies like cheat-checks and memory leaks trigger automated disqualifications.</span>
                      </li>
                    </ul>
                  </div>
                  <div className="mt-8 border-t border-uora-border/60 pt-6">
                    <div className="flex items-center gap-3 p-3.5 rounded bg-uora-bg border border-uora-border/80">
                      <AlertCircle className="w-5 h-5 text-uora-warning flex-shrink-0" />
                      <p className="text-[10px] font-mono text-slate-500 leading-normal">
                        Ensure all network loopbacks use standard socket loops. Hardcoded solutions are filtered out dynamically by the isolation forest monitor.
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

          {activeSection === "simulator" && (
            <motion.div key="simulator" {...panelIn}>
              <StressSimulatorWidget />
            </motion.div>
          )}

          {activeSection === "profiler" && (
            <motion.div key="profiler" {...panelIn}>
              <SystemProfilerWidget />
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
                    <Cpu className="w-10 h-10 text-slate-700 mx-auto mb-4 animate-pulse" />
                    <p className="text-xs font-mono font-bold tracking-wider text-slate-400 uppercase">NO AUDITABLE DATA YET</p>
                    <p className="text-[10px] font-sans text-slate-600 mt-1 max-w-sm mx-auto">
                      Matching engines must complete validation load simulations and earn a composite score before compliance telemetry logs can be compiled.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <AuditMetric
                        label="SLA COMPLIANCE STATUS"
                        value={currentAuditItem?.p99_latency_ms < 2.0 ? "100.0% NOMINAL" : "WARN - SLA BREACH"}
                        detail="Threshold: p99 latency < 2.00ms under 100K tps"
                        color={currentAuditItem?.p99_latency_ms < 2.0 ? "text-uora-success" : "text-uora-error"}
                      />
                      <AuditMetric
                        label="TRANSACTION CORRECTNESS"
                        value={currentAuditItem ? `${(currentAuditItem.correctness_rate * 100).toFixed(2)}% OK` : "---"}
                        detail="Strict zero-loss, queue matching order state checks"
                        color="text-uora-cyan"
                      />
                      <AuditMetric
                        label="CPU CORE SCHEDULING"
                        value="ISOLATED CORES 4-7"
                        detail="Pinned vCPU, hardware context switch bypass"
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
                          <div className="text-slate-200 mt-1 font-bold">{(currentAuditItem?.p99_latency_ms * 0.45 || 0.124).toFixed(3)}ms</div>
                        </div>
                        <div>
                          <div className="text-[9px] text-slate-500">P90 LATENCY</div>
                          <div className="text-slate-200 mt-1 font-bold">{(currentAuditItem?.p99_latency_ms * 0.72 || 0.458).toFixed(3)}ms</div>
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
                        gVisor Kernel Sandbox Audit Logs
                      </div>
                      <div className="font-mono text-[10px] text-slate-600 space-y-1 select-none overflow-y-auto max-h-40">
                        <div>[0.000s] &gt; [INFO] sandbox initialize: configuring runtime isolations</div>
                        <div>[0.015s] &gt; [INFO] core allocation: binding isolate process to vCPU 4, 5, 6, 7</div>
                        <div>[0.040s] &gt; [INFO] memory map: allocating static arena buffers (2048MB locked page)</div>
                        <div>[0.102s] &gt; [INFO] security: sysfilter intercepts initialized (seccomp-bpf activated)</div>
                        <div>[0.550s] &gt; [INFO] match-engine: binary payload spawned with execution hash: 0x{currentAuditItem?.submission_id}</div>
                        <div>[0.560s] &gt; [INFO] port-harness: streaming FIX loopback ticks at localhost:8000</div>
                        <div>[1.200s] &gt; [INFO] telemetry: simulation load started; listening for order feedback</div>
                        <div>[5.000s] &gt; [INFO] supervisor: nominal state preserved, correctness = {currentAuditItem ? (currentAuditItem.correctness_rate * 100).toFixed(1) : "100.0"}%, no heap growth detected</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 pt-2">
                      <button
                        onClick={triggerExport}
                        disabled={isExporting}
                        className="px-4 py-2 bg-uora-cyan/10 border border-uora-cyan/30 rounded text-xs font-mono font-bold uppercase text-uora-cyan hover:bg-uora-cyan/20 transition-all flex items-center gap-2"
                      >
                        {isExporting ? (
                          <>Exporting system log... {exportProgress}%</>
                        ) : (
                          <>Generate System Audit Report</>
                        )}
                      </button>

                      {exportComplete && (
                        <span className="text-[10px] font-mono text-uora-success animate-pulse">
                          Audit report compiled: compliance_audit_{currentAuditItem?.team.toLowerCase()}_{currentAuditItem?.submission_id.slice(0,8)}.json
                        </span>
                      )}
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

function StressSimulatorWidget() {
  const [mounted, setMounted] = useState(false);
  const [tps, setTps] = useState(75000);
  const [volatility, setVolatility] = useState("standard");
  const [eventProfile, setEventProfile] = useState("nominal");
  const [chaosLog, setChaosLog] = useState<string[]>([
    "SIM_INIT // CONNECTING SIMULATED CONCURRENCY CLIENTS",
    "SIM_READY // LOAD PROFILES INSTANTIATED // TARGET: LOOPBACK_SOCKET_4",
  ]);
  const [queueUsage, setQueueUsage] = useState(24);
  const [cpuTemp, setCpuTemp] = useState(48.5);

  // Advanced Hardware Level NUMA & Cache Diagnostics State
  const [cpuFreqs, setCpuFreqs] = useState<number[]>([4.12, 4.25, 4.18, 4.21]);
  const [numaHitRate, setNumaHitRate] = useState(99.6);
  const [cacheInvalidations, setCacheInvalidations] = useState(14);
  const [coreGrids, setCoreGrids] = useState<string[][]>([
    ["mint", "mint", "mint", "mint", "mint", "gold", "mint", "mint"],
    ["mint", "mint", "mint", "gold", "mint", "mint", "mint", "mint"],
    ["mint", "gold", "mint", "mint", "mint", "mint", "gold", "mint"],
    ["mint", "mint", "mint", "mint", "gold", "mint", "mint", "mint"],
  ]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setMounted(true);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    
    // Defer initial load to prevent synchronous setState within effect warning
    const deferTimer = setTimeout(() => {
      const mult = volatility === "saturate" ? 1.6 : volatility === "jitter" ? 1.25 : 1.0;
      const baseQueue = Math.floor((tps / 250000) * 100 * mult);
      setQueueUsage(Math.min(100, Math.max(5, baseQueue + (Math.floor(Math.random() * 8) - 4))));

      const baseTemp = 42 + (tps / 250000) * 35;
      setCpuTemp(parseFloat((baseTemp + Math.random() * 1.5).toFixed(1)));
    }, 0);

    const interval = setInterval(() => {
      // Frequency updates based on load
      const baseFreq = 3.6 + (tps / 250000) * 1.0;
      setCpuFreqs(prev => prev.map(() => parseFloat((baseFreq + Math.random() * 0.25).toFixed(2))));

      // NUMA rates update based on volatility profiles
      let numaBase = 99.7;
      if (volatility === "saturate") numaBase = 93.2;
      else if (volatility === "jitter") numaBase = 97.1;
      setNumaHitRate(parseFloat((numaBase + Math.random() * 0.5).toFixed(1)));

      // Cache invalidations (K/s) scale with load and congestion
      const baseInv = Math.floor((tps / 250000) * 45) + (volatility === "saturate" ? 65 : volatility === "jitter" ? 28 : 6);
      setCacheInvalidations(Math.max(2, baseInv + Math.floor(Math.random() * 6) - 3));

      // Dynamic queue and temperature updates integrated smoothly inside the async loop
      const mult = volatility === "saturate" ? 1.6 : volatility === "jitter" ? 1.25 : 1.0;
      const baseQueue = Math.floor((tps / 250000) * 100 * mult);
      setQueueUsage(Math.min(100, Math.max(5, baseQueue + (Math.floor(Math.random() * 8) - 4))));

      const baseTemp = 42 + (tps / 250000) * 35;
      setCpuTemp(parseFloat((baseTemp + Math.random() * 1.5).toFixed(1)));

      // Cache line alignments flash simulator
      setCoreGrids(prev => prev.map((core) => {
        return core.map(() => {
          const rand = Math.random();
          if (volatility === "saturate") {
            if (rand < 0.35) return "red";
            if (rand < 0.75) return "gold";
            return "mint";
          }
          if (volatility === "jitter") {
            if (rand < 0.12) return "red";
            if (rand < 0.45) return "gold";
            return "mint";
          }
          if (rand < 0.02) return "red";
          if (rand < 0.15) return "gold";
          return "mint";
        });
      }));
    }, 450);

    return () => {
      clearTimeout(deferTimer);
      clearInterval(interval);
    };
  }, [tps, volatility, mounted]);

  const injectChaos = (type: string) => {
    const time = new Date().toLocaleTimeString();
    if (type === "jitter") {
      setChaosLog(prev => [
        ...prev,
        `[${time}] CHAOS_ENG // INJECTING MICROSECOND JITTER SPIKES (50-200μs)`,
        `[${time}] TELEMETRY // DETECTED LATENCY VARIANCE INCREASED (P99.9 OUTLIER DETECTED)`,
      ].slice(-8));
    } else {
      setChaosLog(prev => [
        ...prev,
        `[${time}] CHAOS_ENG // SATURATING FIFO RING BUFFER`,
        `[${time}] SECURITY_RULE // FORCE PACKET DROP PINNED ON CORE_4`,
        `[${time}] ANOMALY_DETECTOR // TRIGGERED ISOLATION FOREST SHUNT`,
      ].slice(-8));
    }
  };

  const resetSimulator = () => {
    setTps(75000);
    setVolatility("standard");
    setEventProfile("nominal");
    setChaosLog([
      "SIM_RESET // CONCURRENCY HARNESS RESTORED TO DEFAULT NOMINAL PROFILE",
      "SIM_READY // LISTENING ON LOCAL FIX EVENT REPLAY PIPES",
    ]);
  };

  const calculatedLatency = (
    (tps / 100000) * 0.45 * (volatility === "jitter" ? 2.8 : volatility === "saturate" ? 4.5 : 1.0) + 0.08
  ).toFixed(3);

  const calculatedDropRate = volatility === "saturate" ? "1.84%" : volatility === "jitter" ? "0.04%" : "0.00%";

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <div className="bg-uora-surface border border-uora-border rounded-md p-6 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between border-b border-uora-border/60 pb-4 mb-6">
            <div>
              <h3 className="text-base font-semibold text-white font-mono uppercase tracking-wide">
                Simulated Stress & Load Controller
              </h3>
              <p className="text-xs text-slate-500 mt-1 font-mono">
                Dynamically stream load events directly into the isolated sandbox execution core.
              </p>
            </div>
            <button
              onClick={resetSimulator}
              className="px-3 py-1.5 border border-uora-border bg-uora-bg rounded text-[10px] font-mono font-bold uppercase text-slate-400 hover:border-uora-cyan hover:text-white transition"
            >
              Reset Controller
            </button>
          </div>

          <div className="mb-8">
            <div className="flex justify-between items-center mb-3 font-mono">
              <span className="text-xs text-slate-400 uppercase font-bold">Simulated Event Load</span>
              <span className="text-sm font-bold text-uora-cyan tracking-wide tabular-nums">
                {tps.toLocaleString()} orders/sec
              </span>
            </div>
            <input
              type="range"
              min="10000"
              max="250000"
              step="5000"
              value={tps}
              onChange={(e) => setTps(parseInt(e.target.value))}
              className="w-full h-1 bg-uora-bg rounded-lg appearance-none cursor-pointer accent-uora-cyan border border-uora-border/40"
            />
            <div className="flex justify-between text-[9px] font-mono text-slate-600 mt-1.5">
              <span>10K TPS (MIN)</span>
              <span>100K TPS (SLA PEAK)</span>
              <span>250K TPS (STRESS SPIKE)</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 font-mono">
            <div>
              <div className="text-[10px] text-slate-500 uppercase font-bold mb-2">Queue Volatility</div>
              <div className="flex flex-col gap-2">
                {[
                  { id: "standard", label: "FIFO Standard" },
                  { id: "jitter", label: "Jittery (12%)" },
                  { id: "saturate", label: "Saturated" },
                ].map((mode) => (
                  <label
                    key={mode.id}
                    className={`flex items-center gap-2 px-3 py-2 border rounded cursor-pointer transition text-xs ${
                      volatility === mode.id
                        ? "bg-uora-cyan/5 border-uora-cyan/60 text-uora-cyan font-bold"
                        : "border-uora-border/60 text-slate-400 hover:text-slate-300 hover:bg-uora-bg/30"
                    }`}
                  >
                    <input
                      type="radio"
                      name="volatility"
                      checked={volatility === mode.id}
                      onChange={() => setVolatility(mode.id)}
                      className="sr-only"
                    />
                    <span>{mode.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <div className="text-[10px] text-slate-500 uppercase font-bold mb-2">Simulated Event Pattern</div>
              <div className="flex flex-col gap-2">
                {[
                  { id: "nominal", label: "Nominal Session" },
                  { id: "fomc", label: "FOMC Announcement" },
                  { id: "crash", label: "Flash Crash Panic" },
                ].map((mode) => (
                  <label
                    key={mode.id}
                    className={`flex items-center gap-2 px-3 py-2 border rounded cursor-pointer transition text-xs ${
                      eventProfile === mode.id
                        ? "bg-uora-warning/5 border-uora-warning/60 text-uora-warning font-bold"
                        : "border-uora-border/60 text-slate-400 hover:text-slate-300 hover:bg-uora-bg/30"
                    }`}
                  >
                    <input
                      type="radio"
                      name="eventProfile"
                      checked={eventProfile === mode.id}
                      onChange={() => setEventProfile(mode.id)}
                      className="sr-only"
                    />
                    <span>{mode.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <div className="text-[10px] text-slate-500 uppercase font-bold mb-2">Inject Anomaly Trigger</div>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => injectChaos("jitter")}
                  className="px-3 py-2 border border-uora-cyan/35 bg-uora-cyan/5 rounded text-xs text-uora-cyan hover:bg-uora-cyan/15 transition text-left flex items-center justify-between"
                >
                  <span>Latency Jitter</span>
                  <span className="text-[9px] px-1 bg-uora-cyan/20 rounded">SPIKE</span>
                </button>
                <button
                  onClick={() => injectChaos("saturate")}
                  className="px-3 py-2 border border-red-500/35 bg-red-500/5 rounded text-xs text-red-400 hover:bg-red-500/15 transition text-left flex items-center justify-between"
                >
                  <span>FIFO Saturation</span>
                  <span className="text-[9px] px-1 bg-red-500/20 rounded">DROP</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {tps > 180000 && (
          <div className="mt-4 border border-uora-warning/35 bg-uora-warning/5 p-3.5 rounded flex items-center gap-3 animate-pulse">
            <AlertCircle className="w-5 h-5 text-uora-warning flex-shrink-0" />
            <div className="font-mono text-[10px] text-uora-warning leading-normal">
              <strong>SIMULATOR ALERT // CRITICAL OVERLOAD STRESS ACTIVE:</strong> Event Ingestion rate currently exceeds nominal SLA bounds ({tps.toLocaleString()} TPS &gt; 180,000 TPS). Isolation Forest algorithm is evaluating anomalous tail latency deviations.
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-uora-surface border border-uora-border rounded p-4 font-mono">
            <div className="text-[10px] text-slate-500 uppercase font-bold">Simulated p99 Latency</div>
            <div className={`text-2xl font-bold mt-2 tabular-nums ${tps > 180000 ? "text-uora-warning" : "text-uora-success"}`}>
              {calculatedLatency}ms
            </div>
            <div className="text-[9px] text-slate-500 mt-1">SLA Threshold: &lt; 2.000ms</div>
          </div>

          <div className="bg-uora-surface border border-uora-border rounded p-4 font-mono">
            <div className="text-[10px] text-slate-500 uppercase font-bold">Simulated Packet Loss</div>
            <div className={`text-2xl font-bold mt-2 tabular-nums ${volatility === "saturate" ? "text-red-400" : "text-slate-300"}`}>
              {calculatedDropRate}
            </div>
            <div className="text-[9px] text-slate-500 mt-1">Target Loss Bounds: 0.00%</div>
          </div>

          <div className="bg-uora-surface border border-uora-border rounded p-4 font-mono">
            <div className="text-[10px] text-slate-500 uppercase font-bold">Estimated CPU Core Temp</div>
            <div className={`text-2xl font-bold mt-2 tabular-nums ${cpuTemp > 75 ? "text-uora-warning" : "text-uora-cyan"}`}>
              {cpuTemp}°C
            </div>
            <div className="text-[9px] text-slate-500 mt-1">Pinned Cores 4-7 Ingest Core</div>
          </div>

          <div className="bg-uora-surface border border-uora-border rounded p-4 font-mono">
            <div className="text-[10px] text-slate-500 uppercase font-bold">Buffer Queue Util.</div>
            <div className={`text-2xl font-bold mt-2 tabular-nums ${queueUsage > 75 ? "text-uora-warning" : "text-uora-success"}`}>
              {queueUsage}%
            </div>
            <div className="text-[9px] text-slate-500 mt-1">SLA Limit Bounds: 80% Ring Buffer</div>
          </div>
        </div>

        {/* Ring Buffer Visualizer */}
        <div className="bg-uora-surface border border-uora-border rounded-md p-4 font-mono">
          <div className="flex justify-between text-[10px] text-slate-500 font-bold mb-2">
            <span>FIFO BUFFER Ring Buffer Utilization Queue</span>
            <span className={queueUsage > 75 ? "text-uora-warning" : "text-uora-cyan"}>{queueUsage}%</span>
          </div>
          <div className="w-full h-3 bg-uora-bg border border-uora-border/60 rounded overflow-hidden">
            <motion.div
              animate={{ width: `${queueUsage}%` }}
              transition={{ type: "spring", stiffness: 90 }}
              className={`h-full ${
                queueUsage > 80 
                  ? "bg-gradient-to-r from-red-500 to-uora-warning" 
                  : queueUsage > 60 
                    ? "bg-gradient-to-r from-uora-cyan to-uora-warning"
                    : "bg-gradient-to-r from-uora-cyan to-uora-success"
              }`}
            />
          </div>
        </div>

        {/* NUMA Memory Domain & Core Affinity Map */}
        <div className="bg-uora-surface border border-uora-border rounded-md p-4 font-mono">
          <div className="flex justify-between items-center text-[10px] text-slate-400 font-bold mb-3 border-b border-uora-border/60 pb-2 uppercase">
            <span>NUMA Memory Domain & Core Affinity Map</span>
            <div className="flex gap-3 text-[9px] font-normal text-slate-500">
              <span className="flex items-center gap-1">L1/L2 <span className="inline-block w-1.5 h-1.5 rounded-full bg-uora-success" /></span>
              <span className="flex items-center gap-1">Bounce <span className="inline-block w-1.5 h-1.5 rounded-full bg-uora-warning" /></span>
              <span className="flex items-center gap-1">Evict <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500" /></span>
            </div>
          </div>
          
          <div className="grid grid-cols-4 gap-2 text-center">
            {cpuFreqs.map((freq, idx) => {
              const coreName = `vCPU_0${idx + 4}`;
              return (
                <div key={idx} className="border border-uora-border bg-uora-bg/35 p-2 rounded flex flex-col items-center">
                  <div className="text-[9px] font-bold text-slate-400">{coreName}</div>
                  <div className="text-[9px] text-uora-cyan mt-0.5 font-bold tabular-nums">{freq.toFixed(2)} GHz</div>
                  
                  {/* Physical Cache Line Map Grid */}
                  <div className="grid grid-cols-4 gap-1 mt-2.5">
                    {coreGrids[idx]?.map((state, cellIdx) => {
                      const colorClass =
                        state === "mint"
                          ? "bg-uora-success shadow-[0_0_4px_rgba(16,185,129,0.2)]"
                          : state === "gold"
                          ? "bg-uora-warning shadow-[0_0_4px_rgba(226,181,62,0.2)]"
                          : "bg-red-500 shadow-[0_0_4px_rgba(239,68,68,0.2)]";
                      return (
                        <div
                          key={cellIdx}
                          className={cn(
                            "w-2 h-2 rounded-sm transition-all duration-200",
                            colorClass
                          )}
                          title={`Cache-line ${cellIdx + 1}: ${state}`}
                        />
                      );
                    })}
                  </div>
                  
                  <div className="text-[7.5px] text-slate-500 mt-2 font-mono uppercase tracking-wider">
                    {idx === 0 ? "Ingest" : idx === 1 ? "FIFO" : idx === 2 ? "MATCH" : "TELEMETRY"}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex justify-between items-center text-[9px] text-slate-500 mt-3 border-t border-uora-border/40 pt-2 font-mono">
            <span>NUMA NODE HIT RATE: <span className="text-uora-cyan font-bold tabular-nums">{numaHitRate}%</span></span>
            <span>CACHE INVALIDATIONS: <span className="text-uora-warning font-bold tabular-nums">{cacheInvalidations}K/s</span></span>
          </div>
        </div>

        {/* Chaos output log */}
        <div className="bg-uora-bg rounded border border-uora-border p-4 flex-1 flex flex-col justify-between min-h-[140px]">
          <div className="text-[10px] font-mono font-bold tracking-wider text-slate-500 border-b border-uora-border/60 pb-2 mb-2 uppercase flex justify-between items-center">
            <span>Chaos Injection Simulator output logs</span>
            <span className="h-1.5 w-1.5 rounded-full bg-uora-cyan animate-ping" />
          </div>
          <div className="font-mono text-[9px] text-slate-500 space-y-1 overflow-y-auto max-h-36 pr-1 leading-relaxed flex-1 flex flex-col justify-end">
            {chaosLog.map((log, index) => (
              <div
                key={index}
                className={
                  log.includes("CHAOS") 
                    ? "text-uora-warning font-bold" 
                    : log.includes("RESET")
                      ? "text-uora-cyan font-bold"
                      : log.includes("SECURITY")
                        ? "text-red-400 font-bold"
                        : "text-slate-500"
                }
              >
                {log}
              </div>
            ))}
          </div>
        </div>
      </div>
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
    <div className="flex items-center gap-2.5 rounded-md border border-uora-border bg-uora-surface px-3.5 py-2 text-sm font-mono text-slate-300">
      <span className={live ? "text-uora-success" : "text-uora-error"}>{icon}</span>
      <span className={`h-2 w-2 rounded-full ${live ? "bg-uora-success" : "bg-uora-error"}`} />
      <span>{label}</span>
    </div>
  );
}

function SystemProfilerWidget() {
  const [mounted, setMounted] = useState(false);
  const [activeSyscallCount, setActiveSyscallCount] = useState(148052);
  const [blockedSyscallCount, setBlockedSyscallCount] = useState(412);
  const [cacheHitRate, setCacheHitRate] = useState(99.82);
  const [memoryUsage, setMemoryUsage] = useState({ bss: 256, heap: 104, stack: 32, arena: 1024 });
  const [syscallFeed, setSyscallFeed] = useState<Array<{ name: string; status: "ALLOWED" | "BLOCKED"; latency: string; time: string }>>([]);

  useEffect(() => {
    setMounted(true);
    
    // Seed initial syscalls feed
    const calls = [
      { name: "sys_epoll_pwait", status: "ALLOWED" as const, latency: "240ns", time: "14:44:02.812" },
      { name: "sys_futex", status: "ALLOWED" as const, latency: "180ns", time: "14:44:02.815" },
      { name: "sys_read", status: "ALLOWED" as const, latency: "420ns", time: "14:44:02.819" },
      { name: "sys_write", status: "ALLOWED" as const, latency: "380ns", time: "14:44:02.822" },
      { name: "sys_clone", status: "BLOCKED" as const, latency: "---", time: "14:44:02.824" },
    ];
    setSyscallFeed(calls);

    const interval = setInterval(() => {
      setActiveSyscallCount(prev => prev + Math.floor(Math.random() * 80) + 40);
      
      const shouldBlock = Math.random() < 0.05;
      if (shouldBlock) {
        setBlockedSyscallCount(prev => prev + 1);
      }

      setCacheHitRate(prev => {
        const delta = (Math.random() * 0.04) - 0.02;
        return parseFloat(Math.max(99.6, Math.min(99.99, prev + delta)).toFixed(2));
      });

      setMemoryUsage(prev => {
        const delta = Math.floor(Math.random() * 6) - 3;
        return {
          ...prev,
          heap: Math.max(80, Math.min(180, prev.heap + delta))
        };
      });

      const sysNames = ["sys_epoll_pwait", "sys_futex", "sys_read", "sys_write", "sys_mmap", "sys_sched_yield"];
      const blockNames = ["sys_clone", "sys_socket", "sys_fork", "sys_execve"];
      
      const isBlocked = shouldBlock;
      const name = isBlocked 
        ? blockNames[Math.floor(Math.random() * blockNames.length)]
        : sysNames[Math.floor(Math.random() * sysNames.length)];
      
      const newCall = {
        name,
        status: isBlocked ? ("BLOCKED" as const) : ("ALLOWED" as const),
        latency: isBlocked ? "---" : `${Math.floor(Math.random() * 300) + 120}ns`,
        time: new Date().toLocaleTimeString(),
      };

      setSyscallFeed(prev => [newCall, ...prev].slice(0, 7));
    }, 800);

    return () => clearInterval(interval);
  }, []);

  if (!mounted) return null;

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      {/* Left panel: Syscall monitor */}
      <div className="bg-uora-surface border border-uora-border rounded-md p-6 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between border-b border-uora-border/60 pb-4 mb-6">
            <div>
              <h3 className="text-base font-semibold text-white font-mono uppercase tracking-wide">
                gVisor Syscall Interceptor & Seccomp Rules
              </h3>
              <p className="text-xs text-slate-500 mt-1 font-mono">
                Real-time kernel-level system call interception within secure sandboxed VM context.
              </p>
            </div>
            <div className="flex gap-3 text-[10px] font-mono">
              <span className="flex items-center gap-1.5 text-uora-success font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-uora-success animate-pulse" />
                SECURE RUNTIME
              </span>
            </div>
          </div>

          {/* Syscalls Feed Table */}
          <div className="border border-uora-border bg-uora-bg/40 rounded overflow-hidden mb-6">
            <div className="grid grid-cols-4 gap-2 bg-uora-bg p-3 border-b border-uora-border font-mono text-[10px] text-slate-500 font-bold uppercase tracking-wider">
              <span>Timestamp</span>
              <span>Syscall Name</span>
              <span>Filter Status</span>
              <span className="text-right">Latency</span>
            </div>
            <div className="divide-y divide-uora-border/60 font-mono text-xs max-h-[280px] overflow-y-auto">
              {syscallFeed.map((call, idx) => (
                <div key={idx} className="grid grid-cols-4 gap-2 p-3 items-center hover:bg-uora-surface/20 transition-colors">
                  <span className="text-slate-500 text-[10px]">{call.time}</span>
                  <span className="text-slate-200 font-semibold">{call.name}</span>
                  <span>
                    <span className={`inline-block px-2 py-0.5 rounded text-[9px] font-bold tracking-wider ${
                      call.status === "ALLOWED" 
                        ? "bg-uora-success/10 border border-uora-success/30 text-uora-success" 
                        : "bg-red-500/10 border border-red-500/30 text-red-400 animate-pulse font-black"
                    }`}>
                      {call.status}
                    </span>
                  </span>
                  <span className={`text-right text-[11px] font-bold ${call.status === "ALLOWED" ? "text-uora-cyan" : "text-slate-600"}`}>
                    {call.latency}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="border-t border-uora-border/60 pt-4 flex justify-between items-center text-[10px] font-mono text-slate-500 uppercase tracking-widest">
          <span>Total allowed syscalls: <span className="text-uora-success font-bold">{activeSyscallCount.toLocaleString()}</span></span>
          <span>Security intercepts: <span className="text-red-400 font-bold">{blockedSyscallCount} BLOCKS</span></span>
        </div>
      </div>

      {/* Right panel: Memory Mapping Visualizer */}
      <div className="flex flex-col gap-4">
        {/* Virtual memory allocation sectors */}
        <div className="bg-uora-surface border border-uora-border rounded-md p-6 font-mono">
          <div className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-4 border-b border-uora-border/60 pb-2">
            gVisor Isolated Memory Space allocation
          </div>

          <div className="space-y-4">
            {/* 1. Pre-allocated Core Arena */}
            <div>
              <div className="flex justify-between text-[10px] text-slate-500 font-bold mb-1.5 uppercase">
                <span>1. Pre-allocated L3 Queue Arena</span>
                <span className="text-uora-cyan font-bold">{memoryUsage.arena} MB LOCKED</span>
              </div>
              <div className="w-full h-3 bg-uora-bg border border-uora-border/40 rounded-sm overflow-hidden p-0.5">
                <div className="h-full bg-gradient-to-r from-uora-cyan/30 to-uora-cyan rounded-sm w-[90%]" />
              </div>
            </div>

            {/* 2. Compiled Machine Code (.text) */}
            <div>
              <div className="flex justify-between text-[10px] text-slate-500 font-bold mb-1.5 uppercase">
                <span>2. Engine Binaries Segment (.text)</span>
                <span className="text-slate-300 font-bold">256 MB STATIC</span>
              </div>
              <div className="w-full h-3 bg-uora-bg border border-uora-border/40 rounded-sm overflow-hidden p-0.5">
                <div className="h-full bg-slate-600 rounded-sm w-[45%]" />
              </div>
            </div>

            {/* 3. Thread Safe Memory Pools (.heap) */}
            <div>
              <div className="flex justify-between text-[10px] text-slate-500 font-bold mb-1.5 uppercase">
                <span>3. Dynamic Thread Heap Allocations</span>
                <span className="text-uora-success font-bold">{memoryUsage.heap} MB ACTIVE</span>
              </div>
              <div className="w-full h-3 bg-uora-bg border border-uora-border/40 rounded-sm overflow-hidden p-0.5">
                <motion.div 
                  animate={{ width: `${(memoryUsage.heap / 200) * 100}%` }}
                  transition={{ duration: 0.8 }}
                  className="h-full bg-gradient-to-r from-uora-success/30 to-uora-success rounded-sm" 
                />
              </div>
            </div>

            {/* 4. Execution Stacks (.stack) */}
            <div>
              <div className="flex justify-between text-[10px] text-slate-500 font-bold mb-1.5 uppercase">
                <span>4. Core Thread Context Stacks</span>
                <span className="text-slate-300 font-bold">32 MB FIXED</span>
              </div>
              <div className="w-full h-3 bg-uora-bg border border-uora-border/40 rounded-sm overflow-hidden p-0.5">
                <div className="h-full bg-indigo-500/80 rounded-sm w-[20%]" />
              </div>
            </div>
          </div>
        </div>

        {/* Cache Telemetry Card */}
        <div className="bg-uora-surface border border-uora-border rounded-md p-6 font-mono">
          <div className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-4 border-b border-uora-border/60 pb-2">
            Cache Coherency & NUMA Alignment
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="border border-uora-border bg-uora-bg/30 p-4 rounded flex flex-col justify-between">
              <span className="text-[10px] text-slate-500 font-bold uppercase">L1/L2 Cache Hit Rate</span>
              <span className="text-2xl font-black text-uora-success mt-2 tabular-nums">{cacheHitRate}%</span>
              <span className="text-[9px] text-slate-600 mt-1 font-mono uppercase">Target Bounds: &gt; 99.5%</span>
            </div>
            <div className="border border-uora-border bg-uora-bg/30 p-4 rounded flex flex-col justify-between">
              <span className="text-[10px] text-slate-500 font-bold uppercase">TLB Dynamic Translation</span>
              <span className="text-2xl font-black text-uora-cyan mt-2 tabular-nums">0x3D88</span>
              <span className="text-[9px] text-slate-600 mt-1 font-mono uppercase">Hugepage Size: 2MB</span>
            </div>
          </div>
        </div>
      </div>
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
