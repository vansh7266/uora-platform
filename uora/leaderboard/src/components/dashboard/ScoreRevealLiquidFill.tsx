"use client";

import { motion } from "framer-motion";
import { Gauge, Trophy } from "lucide-react";
import { useLeaderboardStore } from "@/stores/useLeaderboardStore";

export function ScoreRevealLiquidFill() {
  const { entries } = useLeaderboardStore();

  const topTeam = entries.length > 0
    ? entries.reduce((best, entry) => (entry.composite_score > best.composite_score ? entry : best), entries[0])
    : null;
  const score = topTeam?.composite_score ?? 0;
  const scoreWidth = Math.max(0, Math.min(100, score));

  const tier =
    score >= 90 ? "Elite" :
    score >= 75 ? "Advanced" :
    score >= 50 ? "Stable" :
    score > 0 ? "Developing" :
    "No Runs";

  return (
    <div className="overflow-hidden rounded-lg border border-[#253449] bg-[#101823] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      <div className="flex items-center justify-between border-b border-[#223047] px-5 py-4">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-uora-warning" />
          <h3 className="text-sm font-semibold text-slate-100">Composite Score</h3>
        </div>
        <div className="rounded-md border border-[#2a3a50] bg-[#0b1119] px-2.5 py-1 font-mono text-[11px] text-slate-300">
          {tier}
        </div>
      </div>

      <div className="p-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="font-mono text-xs uppercase tracking-[0.14em] text-slate-500">
              Leading Submission
            </div>
            <div className="mt-2 max-w-52 truncate text-lg font-semibold text-white">
              {topTeam?.team || topTeam?.submission_id || "Awaiting benchmark"}
            </div>
          </div>
          <div className="text-right">
            <div className="font-mono text-5xl font-bold tabular-nums text-uora-cyan">
              {score ? score.toFixed(1) : "0.0"}
            </div>
            <div className="mt-1 text-xs text-slate-500">out of 100</div>
          </div>
        </div>

        <div className="mt-6 h-3 overflow-hidden rounded-full bg-[#071018] ring-1 ring-[#243449]">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${scoreWidth}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="h-full rounded-full bg-gradient-to-r from-uora-success via-uora-cyan to-uora-blue"
          />
        </div>

        <div className="mt-6 grid grid-cols-3 gap-3">
          <Metric label="P99" value={topTeam ? `${topTeam.p99_latency_ms.toFixed(2)}ms` : "---"} />
          <Metric label="TPS" value={topTeam ? topTeam.throughput.toLocaleString() : "---"} />
          <Metric label="Correct" value={topTeam ? `${(topTeam.correctness_rate * 100).toFixed(1)}%` : "---"} />
        </div>

        <div className="mt-5 flex items-center gap-2 rounded-lg border border-[#253449] bg-[#0b1119] px-4 py-3 text-sm text-slate-400">
          <Gauge className="h-4 w-4 text-uora-cyan" />
          Composite ranking rewards speed, tail stability, correctness, and anomaly resistance.
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#253449] bg-[#0b1119] p-3">
      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className="mt-2 truncate font-mono text-sm font-semibold text-slate-100">{value}</div>
    </div>
  );
}

