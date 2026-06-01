"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Minus,
  Trophy,
} from "lucide-react";
import { useLeaderboardStore } from "@/stores/useLeaderboardStore";
import { GlassPanel, PanelHeader, PanelTitle } from "@/components/ui/GlassPanel";
import { LanguageBadge, StatusBadge } from "@/components/ui/Badge";

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return (
    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[rgba(240,185,11,0.12)] border border-[rgba(240,185,11,0.3)] text-[#F0B90B] text-xs font-bold font-mono">
      1
    </span>
  );
  if (rank === 2) return (
    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[rgba(192,192,192,0.1)] border border-[rgba(192,192,192,0.2)] text-[#C0C0C0] text-xs font-bold font-mono">
      2
    </span>
  );
  if (rank === 3) return (
    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[rgba(205,127,50,0.1)] border border-[rgba(205,127,50,0.2)] text-[#CD7F32] text-xs font-bold font-mono">
      3
    </span>
  );
  return (
    <span className="inline-flex items-center justify-center w-7 h-7 rounded text-[11px] font-mono text-[var(--ink-500)] border border-[rgba(255,255,255,0.06)]">
      {rank}
    </span>
  );
}

function RankDelta({ rank, prevRank }: { rank: number; prevRank: number }) {
  if (!prevRank || prevRank === rank) return <Minus className="w-3 h-3 text-[var(--ink-600)]" />;
  if (prevRank > rank) return (
    <div className="flex items-center text-[var(--bid)] gap-0.5">
      <ArrowUp className="w-3 h-3" />
      <span className="text-[9px] font-mono">{prevRank - rank}</span>
    </div>
  );
  return (
    <div className="flex items-center text-[var(--ask)] gap-0.5">
      <ArrowDown className="w-3 h-3" />
      <span className="text-[9px] font-mono">{rank - prevRank}</span>
    </div>
  );
}

function ScoreBar({ score }: { score: number }) {
  const pct = Math.min(100, score);
  const color = score >= 90 ? "var(--bid)" : score >= 70 ? "var(--plasma)" : "var(--ask)";
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex-1 h-1 rounded-full bg-[rgba(255,255,255,0.05)] overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
        />
      </div>
      <span
        className="text-sm font-mono font-bold tabnum w-10 text-right"
        style={{ color }}
      >
        {score.toFixed(1)}
      </span>
    </div>
  );
}

export function LeaderboardPanel() {
  const { entries } = useLeaderboardStore();
  const [expanded, setExpanded] = useState<string | null>(null);

  if (!entries.length) {
    return (
      <GlassPanel className="flex flex-col items-center justify-center py-16 text-center">
        <Trophy className="w-8 h-8 text-[var(--ink-600)] mb-3" />
        <p className="text-xs font-mono font-semibold text-[var(--ink-400)] uppercase tracking-wider">
          No scores yet
        </p>
        <p className="text-[11px] text-[var(--ink-500)] mt-1">
          Submit a matching engine to appear on the leaderboard.
        </p>
      </GlassPanel>
    );
  }

  return (
    <GlassPanel>
      <PanelHeader>
        <PanelTitle icon={<Trophy className="w-3.5 h-3.5" />}>Leaderboard</PanelTitle>
        <span className="text-[10px] font-mono text-[var(--ink-500)]">
          {entries.length} engine{entries.length !== 1 ? "s" : ""} ranked
        </span>
      </PanelHeader>

      {/* Table header */}
      <div className="hidden sm:grid grid-cols-[40px_16px_1fr_80px_90px_90px_80px_80px] gap-x-4 items-center px-5 py-2 border-b border-[rgba(255,255,255,0.04)] text-[9px] font-mono font-semibold text-[var(--ink-500)] uppercase tracking-wider">
        <span>#</span>
        <span />
        <span>Team</span>
        <span className="text-right">Score</span>
        <span className="text-right">P99 (ms)</span>
        <span className="text-right">TPS</span>
        <span className="text-right">Correct.</span>
        <span className="text-right">Anomaly</span>
      </div>

      <div className="divide-y divide-[rgba(255,255,255,0.03)]">
        {entries.map((entry) => {
          const isExpanded = expanded === entry.submission_id;
          const anomalyHigh = (entry.anomaly_score ?? 0) > 0.6;

          return (
            <div key={entry.submission_id}>
              <motion.button
                layout
                onClick={() => setExpanded(isExpanded ? null : entry.submission_id)}
                className="w-full text-left px-5 py-3 hover:bg-[rgba(255,255,255,0.02)] transition-colors"
              >
                <div className="grid grid-cols-[40px_16px_1fr_auto] sm:grid-cols-[40px_16px_1fr_80px_90px_90px_80px_80px] gap-x-4 items-center">
                  <RankBadge rank={entry.rank} />
                  <RankDelta rank={entry.rank} prevRank={entry.prevRank} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-medium text-[var(--ink-100)] truncate">{entry.team}</span>
                      <LanguageBadge lang={entry.language} />
                    </div>
                    {/* Mobile score */}
                    <div className="sm:hidden mt-1">
                      <ScoreBar score={entry.composite_score} />
                    </div>
                  </div>

                  {/* Desktop columns */}
                  <div className="hidden sm:block">
                    <ScoreBar score={entry.composite_score} />
                  </div>
                  <span className="hidden sm:block text-right text-xs font-mono tabnum text-[var(--ink-200)]">
                    {entry.p99_latency_ms.toFixed(2)}
                  </span>
                  <span className="hidden sm:block text-right text-xs font-mono tabnum text-[var(--ink-200)]">
                    {entry.throughput >= 1_000_000
                      ? `${(entry.throughput / 1_000_000).toFixed(1)}M`
                      : `${(entry.throughput / 1_000).toFixed(0)}K`}
                  </span>
                  <span className="hidden sm:block text-right text-xs font-mono tabnum text-[var(--ink-200)]">
                    {(entry.correctness_rate * 100).toFixed(2)}%
                  </span>
                  <span
                    className={`hidden sm:block text-right text-xs font-mono tabnum ${
                      anomalyHigh ? "text-[var(--ask)]" : "text-[var(--ink-400)]"
                    }`}
                  >
                    {entry.anomaly_score.toFixed(3)}
                  </span>
                </div>
              </motion.button>

              {/* Expanded row */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden bg-[rgba(0,0,0,0.2)] border-t border-[rgba(255,255,255,0.04)]"
                  >
                    <div className="px-5 py-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
                      {[
                        { label: "P50 Latency", value: `${entry.p50_latency_ms.toFixed(3)}ms` },
                        { label: "P90 Latency", value: `${entry.p90_latency_ms.toFixed(3)}ms` },
                        { label: "P99 Latency", value: `${entry.p99_latency_ms.toFixed(3)}ms` },
                        { label: "Max TPS", value: (entry.max_tps ?? entry.throughput).toLocaleString() },
                        { label: "Success Rate", value: `${((entry.success_rate ?? 1) * 100).toFixed(2)}%` },
                        { label: "Error Rate", value: `${((entry.error_rate ?? 0) * 100).toFixed(3)}%` },
                        { label: "Correctness", value: `${(entry.correctness_rate * 100).toFixed(3)}%` },
                        { label: "Status", value: entry.status.toUpperCase() },
                      ].map(({ label, value }) => (
                        <div key={label}>
                          <div className="label-mono">{label}</div>
                          <div className="text-sm font-mono font-semibold text-[var(--ink-200)] mt-1 tabnum">{value}</div>
                        </div>
                      ))}
                    </div>
                    <div className="px-5 pb-3">
                      <span className="text-[10px] font-mono text-[var(--ink-600)]">
                        ID: {entry.submission_id}
                      </span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </GlassPanel>
  );
}
