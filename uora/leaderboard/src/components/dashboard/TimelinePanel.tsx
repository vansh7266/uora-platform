"use client";

import { motion } from "framer-motion";
import { Clock, Loader2 } from "lucide-react";
import { useLeaderboardStore } from "@/stores/useLeaderboardStore";
import { GlassPanel, PanelHeader, PanelTitle } from "@/components/ui/GlassPanel";
import { LanguageBadge, StatusBadge } from "@/components/ui/Badge";

const STAGE_ORDER = [
  "queued",
  "building",
  "built",
  "deployed",
  "benchmarking",
  "validating",
  "scored",
];

function elapsed(since: number) {
  const secs = Math.floor((Date.now() - since) / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

export function TimelinePanel() {
  const { submissions } = useLeaderboardStore();

  if (!submissions.length) {
    return (
      <GlassPanel className="flex flex-col items-center justify-center py-16 text-center">
        <Clock className="w-8 h-8 text-[var(--ink-600)] mb-3" />
        <p className="text-xs font-mono font-semibold text-[var(--ink-400)] uppercase tracking-wider">
          No submissions yet
        </p>
        <p className="text-[11px] text-[var(--ink-500)] mt-1">
          Timeline populates as engines enter the pipeline.
        </p>
      </GlassPanel>
    );
  }

  return (
    <GlassPanel>
      <PanelHeader>
        <PanelTitle icon={<Clock className="w-3.5 h-3.5" />}>Run Timeline</PanelTitle>
        <span className="text-[10px] font-mono text-[var(--ink-500)]">
          {submissions.length} submission{submissions.length !== 1 ? "s" : ""}
        </span>
      </PanelHeader>

      <div className="divide-y divide-[rgba(255,255,255,0.04)]">
        {submissions.map((sub, idx) => {
          const stageIdx = STAGE_ORDER.indexOf(sub.status);
          const running = sub.status !== "scored" && sub.status !== "failed";

          return (
            <motion.div
              key={sub.id}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="px-5 py-4"
            >
              {/* Row header */}
              <div className="flex items-center justify-between gap-4 mb-3">
                <div className="flex items-center gap-2 min-w-0">
                  <LanguageBadge lang={sub.language} />
                  <span className="text-xs font-mono text-[var(--ink-400)] truncate">
                    {sub.id.slice(0, 16)}…
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <StatusBadge status={sub.status} />
                  <span className="text-[10px] font-mono text-[var(--ink-500)]">
                    {elapsed(sub.submittedAt)}
                  </span>
                </div>
              </div>

              {/* Stage progress */}
              <div className="flex items-center gap-0">
                {STAGE_ORDER.map((stage, si) => {
                  const done = si < stageIdx || sub.status === "scored";
                  const active = si === stageIdx && running;
                  const failed = sub.status === "failed" && si === stageIdx;
                  const color = failed ? "var(--ask)" : done || sub.status === "scored" ? "var(--bid)" : active ? "var(--plasma)" : "rgba(255,255,255,0.08)";

                  return (
                    <div key={stage} className="flex items-center flex-1">
                      <motion.div
                        animate={{ backgroundColor: color, boxShadow: active ? `0 0 6px ${color}` : "none" }}
                        className="flex-1 h-1 rounded-full transition-all duration-400"
                      />
                      {si < STAGE_ORDER.length - 1 && (
                        <div className="w-1 flex-shrink-0" />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Stage labels */}
              <div className="flex items-center gap-0 mt-1">
                {STAGE_ORDER.map((stage) => (
                  <div key={stage} className="flex-1 text-center">
                    <span className="text-[7px] font-mono text-[var(--ink-600)] uppercase">
                      {stage.slice(0, 4)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Error */}
              {sub.error && (
                <p className="mt-2 text-[10px] font-mono text-[var(--ask)] bg-[rgba(234,57,67,0.06)] px-3 py-1.5 rounded border border-[rgba(234,57,67,0.15)]">
                  ✗ {sub.error}
                </p>
              )}

              {/* Running indicator */}
              {running && (
                <div className="flex items-center gap-1.5 mt-2">
                  <Loader2 className="w-3 h-3 animate-spin text-[var(--plasma)]" />
                  <span className="text-[10px] font-mono text-[var(--plasma)]">
                    {sub.status.toUpperCase()}
                  </span>
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
    </GlassPanel>
  );
}
