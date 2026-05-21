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
    score >= 90 ? "ELITE" :
    score >= 75 ? "ADVANCED" :
    score >= 50 ? "STABLE" :
    score > 0 ? "DEVELOPING" :
    "OFFLINE";

  return (
    <div className="overflow-hidden rounded-md border border-uora-border bg-uora-surface shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
      <div className="flex items-center justify-between border-b border-uora-border/60 px-5 py-4 bg-uora-bg/30">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-uora-cyan" />
          <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300">Composite Leader</h3>
        </div>
        <div className="rounded border border-uora-border bg-uora-bg px-2.5 py-0.5 font-mono text-[10px] font-bold text-uora-cyan">
          {tier}
        </div>
      </div>

      <div className="p-5">
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
              LEADING SUBMISSION
            </div>
            <div className="mt-2 truncate font-mono text-base font-bold text-white">
              {topTeam?.team || topTeam?.submission_id.slice(0, 12) || "AWAITING RUNS"}
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <div className="font-mono text-4xl font-bold tracking-tight text-uora-cyan">
              {score ? score.toFixed(1) : "0.0"}
            </div>
            <div className="mt-0.5 text-[9px] font-mono text-slate-500 uppercase">SCORE UNIT</div>
          </div>
        </div>

        <div className="mt-6 h-2.5 overflow-hidden rounded-full bg-uora-bg ring-1 ring-uora-border">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${scoreWidth}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="h-full rounded-full bg-gradient-to-r from-uora-success via-uora-cyan to-uora-blue"
          />
        </div>

        <div className="mt-6 grid grid-cols-3 gap-2.5">
          <Metric label="P99 TAIL" value={topTeam ? `${topTeam.p99_latency_ms.toFixed(2)}ms` : "---"} />
          <Metric label="THROUGHPUT" value={topTeam ? `${(topTeam.throughput / 1000).toFixed(1)}K/s` : "---"} />
          <Metric label="CORRECT" value={topTeam ? `${(topTeam.correctness_rate * 100).toFixed(1)}%` : "---"} />
        </div>

        <div className="mt-5 flex items-start gap-2.5 rounded border border-uora-border bg-uora-bg/60 p-3 text-[10px] font-mono text-slate-500 leading-normal">
          <Gauge className="h-4 w-4 text-uora-cyan flex-shrink-0 mt-0.5" />
          <span>COMPOSITE SCORING REWARDS MASSIVE CONCURRENCY THROTTLE, SLA TAIL STABILITY, STRICT TRANSACTION CORRECTNESS, AND EXTREME ANOMALY RESISTANCE.</span>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-uora-border bg-uora-bg p-3 min-w-0">
      <div className="font-mono text-[9px] uppercase tracking-wider text-slate-500 truncate">{label}</div>
      <div className="mt-2 truncate font-mono text-xs font-bold text-slate-200">{value}</div>
    </div>
  );
}
