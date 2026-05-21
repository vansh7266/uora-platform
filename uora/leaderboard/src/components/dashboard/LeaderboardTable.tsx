"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown,
  ArrowUp,
  ArrowDown,
  Minus,
  Cpu,
  Clock,
  Zap,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  TrendingUp,
} from "lucide-react";
import { useLeaderboardStore } from "@/stores/useLeaderboardStore";
import { cn, formatLatency, formatThroughput, formatScore, getLanguageBg, getScoreColor, getLatencyColor } from "@/lib/utils";

export function LeaderboardTable() {
  const { entries } = useLeaderboardStore();
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedRow(expandedRow === id ? null : id);
  };

  const getRankBadge = (rank: number) => {
    if (rank === 1)
      return "bg-uora-cyan/15 text-uora-cyan border-uora-cyan/30 shadow-[0_0_8px_rgba(226,181,62,0.1)]";
    if (rank === 2)
      return "bg-slate-300/10 text-slate-300 border-slate-300/20";
    if (rank === 3)
      return "bg-amber-600/10 text-amber-500 border-amber-600/25";
    return "bg-uora-elevated text-slate-500 border-uora-border";
  };

  const getRankChange = (rank: number, prevRank: number) => {
    if (prevRank === rank || prevRank === 0)
      return <Minus className="w-3 h-3 text-slate-500" />;
    if (prevRank > rank)
      return (
        <motion.div
          initial={{ y: 5, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="flex items-center text-uora-success"
        >
          <ArrowUp className="w-3 h-3" />
          <span className="text-[10px] font-mono">{prevRank - rank}</span>
        </motion.div>
      );
    return (
      <motion.div
        initial={{ y: -5, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="flex items-center text-uora-error"
      >
        <ArrowDown className="w-3 h-3" />
        <span className="text-[10px] font-mono">{rank - prevRank}</span>
      </motion.div>
    );
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "running":
        return (
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-uora-blue animate-pulse" />
            <span className="text-blue-400 text-xs">Running</span>
          </div>
        );
      case "completed":
        return (
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-uora-success" />
            <span className="text-uora-success text-xs">Done</span>
          </div>
        );
      case "failed":
        return (
          <div className="flex items-center gap-1.5">
            <XCircle className="w-3.5 h-3.5 text-uora-error" />
            <span className="text-uora-error text-xs">Failed</span>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="bg-uora-surface border border-uora-border rounded-md overflow-hidden shadow-lg">
      {/* Header */}
      <div className="px-5 py-4 border-b border-uora-border/60 flex items-center justify-between bg-uora-bg/30">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-uora-cyan animate-pulse" />
          <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300">Live Leaderboard</h2>
          <span className="px-2 py-0.5 rounded border text-[9px] font-mono font-bold bg-uora-cyan/10 text-uora-cyan border-uora-cyan/20 tracking-wider">
            REAL-TIME
          </span>
        </div>
        <span className="text-[10px] font-mono text-slate-500 uppercase">
          {entries.length} teams active
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-left text-slate-500 text-[10px] font-mono uppercase tracking-wider font-bold border-b border-uora-border bg-uora-bg/50">
              <th className="px-4 py-3 w-16">Rank</th>
              <th className="px-3 py-3 w-8" />
              <th className="px-4 py-3">Team Name</th>
              <th className="px-4 py-3 w-24">Language</th>
              <th className="px-4 py-3 w-28 text-right">Score</th>
              <th className="px-4 py-3 w-32 text-right">P99 Latency</th>
              <th className="px-4 py-3 w-32 text-right">Throughput</th>
              <th className="px-4 py-3 w-28 text-right">Correctness</th>
              <th className="px-4 py-3 w-28">Status</th>
              <th className="px-4 py-3 w-10" />
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, index) => (
              <>
                <motion.tr
                  key={`row-${entry.submission_id}`}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3, delay: index * 0.03 }}
                  onClick={() => toggleExpand(entry.submission_id)}
                  className={cn(
                    "border-b border-uora-border/50 cursor-pointer transition-colors group text-xs",
                    expandedRow === entry.submission_id
                      ? "bg-uora-cyan/5"
                      : "hover:bg-uora-elevated/50"
                  )}
                >
                  {/* Rank */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "inline-flex items-center justify-center w-8 h-8 rounded font-bold text-xs border font-mono shadow-sm",
                          getRankBadge(entry.rank)
                        )}
                      >
                        {entry.rank}
                      </span>
                    </div>
                  </td>

                  {/* Rank Change */}
                  <td className="px-3 py-3">
                    {getRankChange(entry.rank, entry.prevRank)}
                  </td>

                  {/* Team */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded bg-gradient-to-br from-uora-cyan/30 to-uora-blue/30 flex items-center justify-center text-xs font-bold font-mono text-white">
                        {entry.team.charAt(0)}
                      </div>
                      <span className="font-semibold text-xs sm:text-sm text-slate-200 group-hover:text-white transition-colors">
                        {entry.team}
                      </span>
                    </div>
                  </td>

                  {/* Language Badge */}
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "px-2 py-0.5 rounded text-[10px] font-mono border",
                        getLanguageBg(entry.language)
                      )}
                    >
                      {entry.language}
                    </span>
                  </td>

                  {/* Composite Score with liquid fill */}
                  <td className="px-4 py-3 text-right">
                    <div className="relative">
                      <span
                        className={cn(
                          "font-mono font-bold text-xs sm:text-sm",
                          getScoreColor(entry.composite_score)
                        )}
                      >
                        {formatScore(entry.composite_score)}
                      </span>
                      {/* Mini bar */}
                      <div className="mt-1 h-1 w-full bg-uora-elevated rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{
                            width: `${entry.composite_score}%`,
                          }}
                          transition={{ duration: 1, ease: "easeOut" }}
                          className="h-full bg-gradient-to-r from-uora-cyan to-uora-blue rounded-full"
                        />
                      </div>
                    </div>
                  </td>

                  {/* P99 Latency */}
                  <td className="px-4 py-3 text-right">
                    <span
                      className={cn(
                        "font-mono font-bold text-xs sm:text-sm",
                        getLatencyColor(entry.p99_latency_ms)
                      )}
                    >
                      {formatLatency(entry.p99_latency_ms)}
                    </span>
                  </td>

                  {/* Throughput */}
                  <td className="px-4 py-3 text-right">
                    <span className="font-mono font-bold text-xs sm:text-sm text-slate-100">
                      {formatThroughput(entry.throughput)}
                      <span className="text-slate-500 ml-1 text-[10px]">/s</span>
                    </span>
                  </td>

                  {/* Correctness */}
                  <td className="px-4 py-3 text-right">
                    <span
                      className={cn(
                        "font-mono font-bold text-xs sm:text-sm",
                        entry.correctness_rate >= 0.99
                          ? "text-uora-success"
                          : entry.correctness_rate >= 0.95
                          ? "text-uora-warning"
                          : "text-uora-error"
                      )}
                    >
                      {(entry.correctness_rate * 100).toFixed(1)}%
                    </span>
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3">
                    <div className="text-xs font-mono">
                      {getStatusIcon(entry.status)}
                    </div>
                  </td>

                  {/* Expand Chevron */}
                  <td className="px-4 py-3">
                    <motion.div
                      animate={{
                        rotate:
                          expandedRow === entry.submission_id ? 180 : 0,
                      }}
                      transition={{ duration: 0.2 }}
                    >
                      <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                    </motion.div>
                  </td>
                </motion.tr>

                {/* Inline detail expand — renders right under this row */}
                {expandedRow === entry.submission_id && (
                  <tr key={`expand-${entry.submission_id}`}>
                    <td colSpan={10} className="p-0 border-b border-uora-border/50">
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        className="overflow-hidden bg-uora-bg/50"
                      >
                        <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-4">
                          <DetailCard
                            icon={<Clock className="w-4 h-4" />}
                            label="P50 Latency"
                            value={formatLatency(entry.p50_latency_ms ?? 0)}
                            color="text-uora-cyan"
                          />
                          <DetailCard
                            icon={<Zap className="w-4 h-4" />}
                            label="P99 Latency"
                            value={formatLatency(entry.p99_latency_ms)}
                            color="text-uora-warning"
                          />
                          <DetailCard
                            icon={<TrendingUp className="w-4 h-4" />}
                            label="Throughput"
                            value={`${formatThroughput(entry.throughput)}/s`}
                            color="text-uora-success"
                          />
                          <DetailCard
                            icon={<AlertTriangle className="w-4 h-4" />}
                            label="Anomaly Score"
                            value={(entry.anomaly_score * 100).toFixed(1) + "%"}
                            color={entry.anomaly_score > 0.7 ? "text-uora-error" : "text-uora-success"}
                          />
                        </div>
                      </motion.div>
                    </td>
                  </tr>
                )}
              </>
            ))}

            {entries.length === 0 && (
              <tr>
                <td
                  colSpan={10}
                  className="px-6 py-16 text-center text-slate-500"
                >
                  <div className="flex flex-col items-center gap-3">
                    <Cpu className="w-8 h-8 text-slate-700 animate-pulse" />
                    <p className="text-xs font-mono font-bold tracking-wider text-slate-400 uppercase">Awaiting Telemetry Stream...</p>
                    <p className="text-[10px] font-mono text-slate-600 max-w-md mx-auto leading-relaxed">
                      No matching engines currently scored. Submit source in the Submit portal to start the build, benchmark, validation, and scoring pipeline.
                    </p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DetailCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="bg-uora-surface border border-uora-border rounded p-3">
      <div className="flex items-center gap-2 text-slate-500 text-xs mb-1">
        {icon}
        {label}
      </div>
      <span className={cn("font-mono font-bold text-xs sm:text-sm", color)}>
        {value}
      </span>
    </div>
  );
}
