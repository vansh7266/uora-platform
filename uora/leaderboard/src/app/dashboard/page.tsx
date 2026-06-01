"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { TopBar } from "@/components/layout/TopBar";
import { Sidebar, type SidebarSection } from "@/components/layout/Sidebar";
import { SubmissionPortal } from "@/components/dashboard/SubmissionPortal";
import { TimelinePanel } from "@/components/dashboard/TimelinePanel";
import { LeaderboardPanel } from "@/components/dashboard/LeaderboardPanel";
import { LatencyPanel } from "@/components/dashboard/LatencyPanel";
import { ValidationPanel } from "@/components/dashboard/ValidationPanel";
import { ReportsPanel } from "@/components/dashboard/ReportsPanel";
import { ScoreRadar } from "@/components/dashboard/ScoreRadar";
import { LatencyHistogram } from "@/components/dashboard/LatencyHistogram";
import { HistoricalChart } from "@/components/dashboard/HistoricalChart";
import { BuildLog } from "@/components/dashboard/BuildLog";
import { useSSE } from "@/hooks/useSSE";
import { useLeaderboardStore } from "@/stores/useLeaderboardStore";
import { useAuthStore } from "@/stores/useAuthStore";
import {
  DEMO_ENTRIES,
  DEMO_METRICS,
  DEMO_ANOMALIES,
  DEMO_SUBMISSIONS,
} from "@/lib/demoData";
import {
  Activity,
  AlertCircle,
  Gauge,
  Layers,
  Loader2,
} from "lucide-react";

const panelMotion = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit:    { opacity: 0, y: -8 },
  transition: { duration: 0.22, ease: "easeOut" as const },
};

export default function DashboardPage() {
  const router = useRouter();
  const [section, setSection] = useState<SidebarSection>("submit");
  const [authChecked, setAuthChecked] = useState(false);
  const [demoBannerDismissed, setDemoBannerDismissed] = useState(false);

  const { isAuthenticated, isLoading, isDemo, login } = useAuthStore();
  const { entries, submissions, setEntries, addMetrics, addAnomaly, addSubmission } = useLeaderboardStore();

  // SSE for real users
  useSSE(isDemo ? "" : "/api/leaderboard");

  // Seed demo data
  useEffect(() => {
    if (!isDemo) return;
    setEntries(DEMO_ENTRIES);
    DEMO_METRICS.forEach(addMetrics);
    DEMO_ANOMALIES.forEach(addAnomaly);
    DEMO_SUBMISSIONS.forEach(addSubmission);
  }, [isDemo, setEntries, addMetrics, addAnomaly, addSubmission]);

  // Auth guard
  useEffect(() => {
    const t = setTimeout(async () => {
      if (isAuthenticated) { setAuthChecked(true); return; }
      try {
        const api = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
        const res = await fetch(`${api}/auth/me`, { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          if (data.user) {
            login({
              id: data.payload?.sub || "user",
              name: data.payload?.name || data.user,
              email: data.user,
              avatar: data.payload?.picture || "",
              team: data.payload?.team,
            });
            setAuthChecked(true);
            return;
          }
        }
      } catch { /* network error */ }
      setAuthChecked(true);
      router.replace("/auth");
    }, 50);
    return () => clearTimeout(t);
  }, [isAuthenticated, router, login]);

  if (!authChecked || isLoading) {
    return (
      <div className="min-h-screen bg-[var(--void-950)] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--plasma)]" />
          <p className="text-[10px] font-mono text-[var(--ink-500)] uppercase tracking-widest">
            Verifying session…
          </p>
        </div>
      </div>
    );
  }

  const topScore = entries.length ? Math.max(...entries.map((e) => e.composite_score)) : null;
  const bestP99 = entries.length ? Math.min(...entries.map((e) => e.p99_latency_ms)) : null;
  const criticalAnomalies = entries.filter((e) => (e.anomaly_score ?? 0) > 0.7).length;

  return (
    <div className="min-h-screen bg-[var(--void-950)] text-[var(--ink-200)]">
      <TopBar />
      <Sidebar active={section} onChange={setSection} />

      {/* Demo banner */}
      <AnimatePresence>
        {isDemo && !demoBannerDismissed && (
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            className="fixed top-12 left-[200px] right-0 z-30 flex items-center justify-between gap-4 px-5 py-2 bg-[rgba(240,185,11,0.06)] border-b border-[rgba(240,185,11,0.15)]"
          >
            <p className="text-[10px] font-mono text-[#F0B90B]">
              <strong>DEMO MODE</strong> — Simulated data. Submit an engine to benchmark against the real pipeline.
            </p>
            <button
              onClick={() => setDemoBannerDismissed(true)}
              className="text-[10px] font-mono text-[var(--ink-500)] hover:text-[var(--ink-200)] uppercase tracking-wider shrink-0"
            >
              Dismiss
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main content */}
      <main
        className="min-h-screen pt-12 pl-[200px]"
        style={{ paddingTop: isDemo && !demoBannerDismissed ? "64px" : "48px" }}
      >
        <div className="p-5 max-w-[1440px]">
          {/* KPI strip */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
            {[
              {
                icon: <Layers className="w-3.5 h-3.5" />,
                label: "Active Submissions",
                value: submissions.length.toString(),
                color: "text-[var(--plasma)]",
              },
              {
                icon: <Gauge className="w-3.5 h-3.5" />,
                label: "Top Score",
                value: topScore != null ? topScore.toFixed(1) : "—",
                color: "text-[var(--bid)]",
              },
              {
                icon: <Activity className="w-3.5 h-3.5" />,
                label: "Best P99",
                value: bestP99 != null ? `${bestP99.toFixed(2)}ms` : "—",
                color: "text-[#F0B90B]",
              },
              {
                icon: <AlertCircle className="w-3.5 h-3.5" />,
                label: "Anomalies",
                value: criticalAnomalies.toString(),
                color: criticalAnomalies > 0 ? "text-[var(--ask)]" : "text-[var(--ink-400)]",
              },
            ].map((kpi) => (
              <div
                key={kpi.label}
                className="glass rounded-md p-4 flex items-start gap-3"
              >
                <span className={`mt-0.5 ${kpi.color} opacity-70`}>{kpi.icon}</span>
                <div>
                  <div className="label-mono">{kpi.label}</div>
                  <div className={`text-2xl font-mono font-bold tabnum mt-1 ${kpi.color}`}>
                    {kpi.value}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Panels — a keyed motion.div remounts and fades in on each section change.
              Deliberately NOT wrapped in AnimatePresence mode="wait": the exit-gating could
              stall the enter and leave a panel stuck at opacity 0 when background timers
              (TopBar tick, BuildLog) re-render the parent. Visibility must never depend on
              an animation completing. */}
          <motion.div key={section} {...panelMotion}>
              {section === "submit" && (
                <div className="grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-4">
                  <SubmissionPortal isDemo={isDemo} />
                  <div className="space-y-4">
                    <BuildLog isDemo={isDemo} />
                  </div>
                </div>
              )}

              {section === "timeline" && <TimelinePanel />}

              {section === "leaderboard" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-4">
                    <LeaderboardPanel />
                    <ScoreRadar />
                  </div>
                  <HistoricalChart />
                </div>
              )}

              {section === "latency" && (
                <div className="space-y-4">
                  <LatencyPanel />
                  <LatencyHistogram />
                </div>
              )}

              {section === "validation" && <ValidationPanel />}

              {section === "reports" && <ReportsPanel />}
          </motion.div>
        </div>
      </main>
    </div>
  );
}
