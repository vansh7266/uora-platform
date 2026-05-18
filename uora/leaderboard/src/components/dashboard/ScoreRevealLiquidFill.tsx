"use client";

import { useMemo, useEffect, useState } from "react";
import ReactECharts from "echarts-for-react";
import { motion } from "framer-motion";
import { Trophy, Sparkles } from "lucide-react";
import { useLeaderboardStore } from "@/stores/useLeaderboardStore";
import { cn } from "@/lib/utils";

/**
 * ScoreRevealLiquidFill — Animated liquid-fill gauge that reveals
 * the composite score with a satisfying fill animation.
 * Uses ECharts liquidFill series for the water-level effect.
 */
export function ScoreRevealLiquidFill() {
  const { entries } = useLeaderboardStore();
  const [animatedScore, setAnimatedScore] = useState(0);

  // Get top team score
  const topScore = entries.length > 0
    ? Math.max(...entries.map((e) => e.composite_score))
    : 0;

  const topTeam = entries.length > 0
    ? entries.reduce((best, e) => (e.composite_score > best.composite_score ? e : best), entries[0])
    : null;

  // Animate score counting up
  useEffect(() => {
    if (topScore === 0) {
      setAnimatedScore(0);
      return;
    }

    let current = 0;
    const duration = 1500;
    const steps = 60;
    const increment = topScore / steps;
    const interval = duration / steps;

    const timer = setInterval(() => {
      current += increment;
      if (current >= topScore) {
        setAnimatedScore(topScore);
        clearInterval(timer);
      } else {
        setAnimatedScore(current);
      }
    }, interval);

    return () => clearInterval(timer);
  }, [topScore]);

  const scoreNormalized = topScore / 100; // 0-1 scale

  const option = useMemo(() => {
    // Color based on score tier
    const fillColor = topScore >= 90 ? "#06B6D4" : topScore >= 70 ? "#8B5CF6" : topScore >= 50 ? "#F59E0B" : "#64748B";

    return {
      backgroundColor: "transparent",
      series: [
        {
          type: "liquidFill",
          radius: "78%",
          center: ["50%", "50%"],
          data: [scoreNormalized, scoreNormalized - 0.02, scoreNormalized - 0.04],
          amplitude: 6,
          waveLength: "80%",
          phase: 0,
          period: 3000,
          color: [fillColor, fillColor, fillColor],
          opacity: [0.8, 0.5, 0.3],
          outline: {
            show: true,
            borderDistance: 4,
            itemStyle: {
              borderColor: fillColor,
              borderWidth: 2,
              shadowBlur: 12,
              shadowColor: `${fillColor}33`,
            },
          },
          backgroundStyle: {
            color: "#0F172A",
            borderColor: "#1E293B",
            borderWidth: 1,
          },
          label: {
            show: true,
            formatter: () => `${animatedScore.toFixed(1)}`,
            fontSize: 42,
            fontFamily: "JetBrains Mono, monospace",
            fontWeight: "bold",
            color: "#E2E8F0",
            insideColor: "#E2E8F0",
          },
          emphasis: {
            itemStyle: {
              opacity: 0.9,
            },
          },
        },
      ],
    };
  }, [scoreNormalized, animatedScore, topScore]);

  // Score tier label
  const tierLabel = topScore >= 90 ? "ELITE" : topScore >= 70 ? "ADVANCED" : topScore >= 50 ? "COMPETENT" : topScore > 0 ? "DEVELOPING" : "NO DATA";

  return (
    <div className="bg-uora-surface border border-uora-border rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-uora-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trophy className="w-4 h-4 text-uora-warning" />
          <h3 className="text-sm font-semibold">Score Reveal</h3>
        </div>
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 1.5, duration: 0.5 }}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono font-bold border",
            topScore >= 90
              ? "bg-uora-cyan/10 text-uora-cyan border-uora-cyan/20"
              : topScore >= 70
              ? "bg-uora-purple/10 text-uora-purple border-uora-purple/20"
              : "bg-uora-warning/10 text-uora-warning border-uora-warning/20"
          )}
        >
          <Sparkles className="w-3 h-3" />
          {tierLabel}
        </motion.div>
      </div>

      <div className="p-2">
        <ReactECharts
          option={option}
          style={{ height: "280px", width: "100%" }}
          opts={{ renderer: "canvas" }}
          notMerge={true}
          lazyUpdate={true}
        />
      </div>

      {/* Team info */}
      {topTeam && (
        <div className="px-5 pb-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500">Top Team</div>
            <div className="text-sm font-mono font-bold text-slate-200">
              {topTeam.team || topTeam.submission_id.slice(0, 12)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-slate-500">P99</div>
            <div className="text-sm font-mono font-bold text-uora-warning">
              {topTeam.p99_latency_ms.toFixed(2)}ms
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
