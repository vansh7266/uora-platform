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
  const { entries, selectedEntry, setSelectedEntry } = useLeaderboardStore();
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedRow(expandedRow === id ? null : id);
  };

  const getRankBadge = (rank: number) => {
    if (rank === 1)
      return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
    if (rank === 2)
      return "bg-slate-400/20 text-slate-300 border-slate-400/30";
    if (rank === 3)
      return "bg-orange-500/20 text-orange-400 border-orange-500/30";
    return "bg-uora-elevated text-slate-400 border-uora-border";
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
            <span className="text-blue-400">Running</span>
          </div>
        );
      case "completed":
        return (
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-uora-success" />
            <span className="text-uora-success">Done</span>
          </div>
        );
      case "failed":
        return (
          <div className="flex items-center gap-1.5">
            <XCircle className="w-3.5 h-3.5 text-uora-error" />
            <span className="text-uora-error">Failed</span>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="bg-uora-surface border border-uora-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-uora-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <TrendingUp className="w-5 h-5 text-uora-cyan" />
          <h2 className="text-lg font-semibold">Live Leaderboard</h2>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-uora-cyan/10 text-uora-cyan border border-uora-cyan/20">
            REAL-TIME
          </span>
        </div>
        <span className="text-xs text-slate-500 font-mono">
          {entries.length} teams
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-left text-slate-500 text-xs font-medium border-b border-uora-border bg-uora-bg/50">
              <th className="px-4 py-3 w-16">Rank</th>
              <th className="px-4 py-3 w-8" />
              <th className="px-4 py-3">Team</th>
              <th className="px-4 py-3 w-20">Lang</th>
              <th className="px-4 py-3 w-24 text-right">Score</th>
              <th className="px-4 py-3 w-28 text-right">P99 Latency</th>
              <th className="px-4 py-3 w-28 text-right">Throughput</th>
              <th className="px-4 py-3 w-24 text-right">Correctness</th>
              <th className="px-4 py-3 w-24">Status</th>
              <th className="px-4 py-3 w-8" />
            </tr>
          </thead>
          <tbody>
            <AnimatePresence mode="popLayout">
              {entries.map((entry, index) => (
                <motion.tr
                  key={entry.submission_id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3, delay: index * 0.03 }}
                  onClick={() => {
                    toggleExpand(entry.submission_id);
                    setSelectedEntry(
                      selectedEntry?.submission_id === entry.submission_id
                        ? null
                        : entry
                    );
                  }}
                  className={cn(
                    "border-b border-uora-border/50 cursor-pointer transition-colors group",
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
                          "inline-flex items-center justify-center w-8 h-8 rounded-lg font-bold text-xs border",
                          getRankBadge(entry.rank)
                        )}
                      >
                        {entry.rank}
                      </span>
                    </div>
                  </td>

                  {/* Rank Change */}
                  <td className="px-4 py-3">
                    {getRankChange(entry.rank, entry.prevRank)}
                  </td>

                  {/* Team */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-uora-cyan/30 to-uora-blue/30 flex items-center justify-center text-xs font-bold font-mono">
                        {entry.team.charAt(0)}
                      </div>
                      <span className="font-medium text-sm text-slate-200 group-hover:text-white transition-colors">
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
                          "font-mono font-bold text-sm",
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
                        "font-mono text-sm",
                        getLatencyColor(entry.p99_latency_ms)
                      )}
                    >
                      {formatLatency(entry.p99_latency_ms)}
                    </span>
                  </td>

                  {/* Throughput */}
                  <td className="px-4 py-3 text-right">
                    <span className="font-mono text-sm text-slate-300">
                      {formatThroughput(entry.throughput)}
                      <span className="text-slate-500 ml-1 text-xs">/s</span>
                    </span>
                  </td>

                  {/* Correctness */}
                  <td className="px-4 py-3 text-right">
                    <span
                      className={cn(
                        "font-mono text-sm",
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
                    <div className="text-xs">
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
                      <ChevronDown className="w-4 h-4 text-slate-500" />
                    </motion.div>
                  </td>
                </motion.tr>
              ))}
            </AnimatePresence>

            {entries.length === 0 && (
              <tr>
                <td
                  colSpan={10}
                  className="px-6 py-16 text-center text-slate-500"
                >
                  <div className="flex flex-col items-center gap-3">
                    <Cpu className="w-8 h-8 text-slate-600" />
                    <p className="text-sm">Waiting for benchmark data...</p>
                    <p className="text-xs text-slate-600">
                      Submissions will appear here in real-time
                    </p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Expanded Detail */}
      <AnimatePresence>
        {expandedRow && selectedEntry && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden border-t border-uora-border"
          >
            <div className="p-6 bg-uora-bg/50">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <DetailCard
                  icon={<Clock className="w-4 h-4" />}
                  label="P50 Latency"
                  value={formatLatency(selectedEntry.p50_latency_ms || selectedEntry.p99_latency_ms * 0.4)}
                  color="text-uora-cyan"
                />
                <DetailCard
                  icon={<Zap className="w-4 h-4" />}
                  label="P99 Latency"
                  value={formatLatency(selectedEntry.p99_latency_ms)}
                  color="text-uora-warning"
                />
                <DetailCard
                  icon={<TrendingUp className="w-4 h-4" />}
                  label="Throughput"
                  value={`${formatThroughput(selectedEntry.throughput)}/s`}
                  color="text-uora-success"
                />
                <DetailCard
                  icon={<AlertTriangle className="w-4 h-4" />}
                  label="Anomaly Score"
                  value={(selectedEntry.anomaly_score * 100).toFixed(1) + "%"}
                  color={
                    selectedEntry.anomaly_score > 0.7
                      ? "text-uora-error"
                      : "text-uora-success"
                  }
                />
              </div>
              {selectedEntry.anomaly_type && (
                <div className="mt-4 px-4 py-2.5 rounded-lg bg-uora-error/5 border border-uora-error/20">
                  <div className="flex items-center gap-2 text-xs text-uora-error">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span className="font-medium">Anomaly Detected:</span>
                    <span>{selectedEntry.anomaly_type}</span>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
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
    <div className="bg-uora-surface border border-uora-border rounded-lg p-3">
      <div className="flex items-center gap-2 text-slate-500 text-xs mb-1">
        {icon}
        {label}
      </div>
      <span className={cn("font-mono font-bold text-sm", color)}>
        {value}
      </span>
    </div>
  );
}
