"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, Download, FileText, Loader2 } from "lucide-react";
import { useAuthStore } from "@/stores/useAuthStore";
import { useLeaderboardStore } from "@/stores/useLeaderboardStore";
import { GlassPanel, PanelHeader, PanelTitle } from "@/components/ui/GlassPanel";
import { LanguageBadge } from "@/components/ui/Badge";
import { MetricKPI } from "@/components/ui/MetricKPI";

export function ReportsPanel() {
  const { entries } = useLeaderboardStore();
  const { isDemo } = useAuthStore();
  const [selected, setSelected] = useState<string>("");
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const entry = entries.find((e) => e.submission_id === selected) ?? entries[0];

  const handleDownload = async () => {
    if (!entry) return;
    setDownloadError(null);
    if (isDemo) {
      setDownloadError("PDF reports are only available for real submissions.");
      return;
    }
    setDownloading(true);
    try {
      const api = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const res = await fetch(`${api}/api/v1/report/${entry.submission_id}`, {
        credentials: "include",
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(detail?.detail || `Download failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `uora-report-${entry.team.toLowerCase().replace(/\s+/g, "_")}-${entry.submission_id.slice(0, 8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setDownloadError(e instanceof Error ? e.message : "Download failed");
    } finally {
      setDownloading(false);
    }
  };

  if (!entries.length) {
    return (
      <GlassPanel className="flex flex-col items-center justify-center py-16 text-center">
        <FileText className="w-8 h-8 text-[var(--ink-600)] mb-3" />
        <p className="text-xs font-mono font-semibold text-[var(--ink-400)] uppercase tracking-wider">
          No scored engines
        </p>
        <p className="text-[11px] text-[var(--ink-500)] mt-1">
          Reports are generated after scoring completes.
        </p>
      </GlassPanel>
    );
  }

  const p99Good = (entry?.p99_latency_ms ?? Infinity) < 2.0;
  const correctGood = (entry?.correctness_rate ?? 0) > 0.99;
  const anomalyOk = (entry?.anomaly_score ?? 1) < 0.5;

  return (
    <div className="space-y-4">
      {/* Engine selector */}
      <GlassPanel>
        <PanelHeader>
          <PanelTitle icon={<FileText className="w-3.5 h-3.5" />}>
            Performance Audit
          </PanelTitle>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="bg-[var(--void-800)] border border-[rgba(0,212,255,0.1)] rounded px-3 py-1.5 text-[11px] font-mono text-[var(--ink-300)] focus:outline-none focus:border-[rgba(0,212,255,0.35)] transition-colors"
          >
            <option value="">Select engine…</option>
            {entries.map((e) => (
              <option key={e.submission_id} value={e.submission_id}>
                {e.team} ({e.submission_id.slice(0, 8)})
              </option>
            ))}
          </select>
        </PanelHeader>

        {entry && (
          <div className="p-5">
            {/* Engine header */}
            <div className="flex items-center gap-3 mb-6 pb-5 border-b border-[rgba(255,255,255,0.05)]">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-base font-semibold text-[var(--ink-100)]">{entry.team}</span>
                  <LanguageBadge lang={entry.language} />
                </div>
                <span className="text-[10px] font-mono text-[var(--ink-500)]">
                  {entry.submission_id}
                </span>
              </div>
              <div className="ml-auto">
                <span
                  className="text-3xl font-mono font-black tabnum"
                  style={{
                    color: entry.composite_score >= 90 ? "var(--bid)" : entry.composite_score >= 70 ? "var(--plasma)" : "var(--ask)",
                  }}
                >
                  {entry.composite_score.toFixed(1)}
                </span>
                <div className="label-mono mt-0.5">Composite Score</div>
              </div>
            </div>

            {/* Audit status grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <AuditCard
                label="Tail Latency"
                value={p99Good ? "WITHIN TARGET" : "REVIEW"}
                detail={`p99 = ${entry.p99_latency_ms.toFixed(3)}ms · target < 2.00ms`}
                pass={p99Good}
              />
              <AuditCard
                label="Fill Correctness"
                value={`${(entry.correctness_rate * 100).toFixed(3)}%`}
                detail="Price-time priority + fill accuracy"
                pass={correctGood}
              />
              <AuditCard
                label="Anomaly Status"
                value={anomalyOk ? "CLEAN" : "FLAGGED"}
                detail={`Score: ${entry.anomaly_score.toFixed(4)} · threshold 0.5`}
                pass={anomalyOk}
              />
            </div>

            {/* Metrics matrix */}
            <div className="rounded bg-[var(--void-800)] border border-[rgba(255,255,255,0.05)] p-4">
              <div className="label-mono mb-4 pb-2 border-b border-[rgba(255,255,255,0.04)]">
                Telemetry Matrix
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
                <MetricKPI label="P50 Latency" value={`${entry.p50_latency_ms.toFixed(3)}ms`} color="bid" />
                <MetricKPI label="P90 Latency" value={`${entry.p90_latency_ms.toFixed(3)}ms`} color="plasma" />
                <MetricKPI label="P99 Latency" value={`${entry.p99_latency_ms.toFixed(3)}ms`} color="ask" />
                <MetricKPI label="Peak TPS" value={(entry.max_tps ?? entry.throughput).toLocaleString()} color="plasma" />
                <MetricKPI label="Success Rate" value={`${((entry.success_rate ?? 1) * 100).toFixed(3)}%`} color="bid" />
                <MetricKPI label="Error Rate" value={`${((entry.error_rate ?? 0) * 100).toFixed(4)}%`} color="ask" />
                <MetricKPI label="Correctness" value={`${(entry.correctness_rate * 100).toFixed(3)}%`} color="bid" />
                <MetricKPI label="Anomaly Score" value={entry.anomaly_score.toFixed(4)} color={anomalyOk ? "white" : "ask"} />
              </div>
            </div>

            {/* Score formula */}
            <div className="mt-4 p-4 rounded bg-[var(--void-800)] border border-[rgba(0,212,255,0.07)]">
              <div className="label-mono mb-2">Composite Score Formula</div>
              <code className="text-[11px] font-mono text-[var(--plasma)]">
                score = (throughput × correctness_rate) / (p99_latency_ns² + resource_penalty)
              </code>
              <p className="text-[10px] font-mono text-[var(--ink-500)] mt-1">
                Bounded [0, 100] via isolation forest normalization
              </p>
            </div>

            {/* Report download */}
            <div className="mt-4 p-3.5 rounded bg-[var(--void-800)] border border-[rgba(255,255,255,0.05)]">
              <div className="flex items-start gap-3 mb-3">
                {entry.status === "scored" ? (
                  <CheckCircle2 className="w-4 h-4 text-[var(--bid)] flex-shrink-0 mt-0.5" />
                ) : (
                  <Loader2 className="w-4 h-4 text-[var(--ink-500)] flex-shrink-0 mt-0.5 animate-spin" />
                )}
                <div className="flex-1">
                  <p
                    className="text-[11px] font-mono font-semibold"
                    style={{ color: entry.status === "scored" ? "var(--bid)" : "var(--ink-300)" }}
                  >
                    {entry.status === "scored" ? "PDF report ready" : `Awaiting scoring · ${entry.status.toUpperCase()}`}
                  </p>
                  <p className="text-[10px] font-mono text-[var(--ink-500)] mt-0.5">
                    {entry.status === "scored"
                      ? "Full performance audit with telemetry matrix, validation summary, and score breakdown."
                      : "Report is generated automatically once scoring completes."}
                  </p>
                </div>
              </div>

              {entry.status === "scored" && (
                <button
                  onClick={handleDownload}
                  disabled={downloading}
                  className="btn-plasma w-full text-xs disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {downloading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Preparing PDF…
                    </>
                  ) : (
                    <>
                      <Download className="w-3.5 h-3.5" />
                      Download PDF Report
                    </>
                  )}
                </button>
              )}

              {downloadError && (
                <div className="mt-2.5 flex items-start gap-2 p-2.5 rounded bg-[rgba(234,57,67,0.06)] border border-[rgba(234,57,67,0.2)]">
                  <AlertCircle className="w-3 h-3 flex-shrink-0 mt-0.5 text-[var(--ask)]" />
                  <p className="text-[10px] font-mono text-[var(--ask)] leading-relaxed">{downloadError}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </GlassPanel>
    </div>
  );
}

function AuditCard({
  label,
  value,
  detail,
  pass,
}: {
  label: string;
  value: string;
  detail: string;
  pass: boolean;
}) {
  return (
    <div className="p-4 rounded bg-[var(--void-800)] border border-[rgba(255,255,255,0.05)]">
      <div className="label-mono mb-2">{label}</div>
      <div
        className="text-lg font-mono font-bold tabnum mb-1"
        style={{ color: pass ? "var(--bid)" : "var(--ask)" }}
      >
        {value}
      </div>
      <p className="text-[10px] text-[var(--ink-500)] font-mono leading-relaxed">{detail}</p>
    </div>
  );
}
