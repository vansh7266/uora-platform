"use client";

import { useMemo, useState, useEffect } from "react";
import ReactECharts from "echarts-for-react";
import { motion, AnimatePresence } from "framer-motion";
import { Radar, AlertTriangle } from "lucide-react";
import { useLeaderboardStore } from "@/stores/useLeaderboardStore";
import { cn } from "@/lib/utils";

const ANOMALY_TYPES = [
  { type: "hardcoded_cheating", label: "Hardcoded Values", severity: "high" },
  { type: "memory_leak", label: "Memory Leak", severity: "medium" },
  { type: "crash_loop", label: "Crash Loop", severity: "high" },
  { type: "latency_spike", label: "Latency Spike", severity: "low" },
  { type: "throughput_anomaly", label: "Throughput Anomaly", severity: "medium" },
];

export function AnomalyPulseDetector() {
  const { anomalies, entries } = useLeaderboardStore();
  const [isShaking, setIsShaking] = useState(false);

  // Track anomaly scores and trigger shaking effect
  useEffect(() => {
    if (anomalies.length === 0) return;
    const latest = anomalies[anomalies.length - 1];
    if (latest.score <= 0.7) return;

    const startTimer = setTimeout(() => setIsShaking(true), 0);
    const stopTimer = setTimeout(() => setIsShaking(false), 600);
    return () => {
      clearTimeout(startTimer);
      clearTimeout(stopTimer);
    };
  }, [anomalies]);

  // Compute current max anomaly score from entries
  const currentMaxScore = useMemo(() => {
    if (entries.length === 0) return 0;
    return Math.max(...entries.map((e) => e.anomaly_score || 0));
  }, [entries]);

  const isCritical = currentMaxScore > 0.7;
  const isWarning = currentMaxScore > 0.4 && !isCritical;

  const option = useMemo(() => {
    const pulseIntensity = isCritical ? 0.8 : isWarning ? 0.4 : 0.15;
    const ringColor = isCritical ? "#EF4444" : "#E2B53E";

    return {
      backgroundColor: "transparent",
      radar: {
        indicator: ANOMALY_TYPES.map((at) => ({
          name: at.label,
          max: 1,
        })),
        shape: "polygon",
        center: ["50%", "50%"],
        radius: "65%",
        axisName: {
          color: "#64748B",
          fontSize: 9,
          fontFamily: "JetBrains Mono, monospace",
        },
        splitArea: { show: false },
        splitLine: {
          lineStyle: { color: "#1E293B", type: "dashed" },
        },
        axisLine: { lineStyle: { color: "#1E293B" } },
      },
      series: [
        // Outer pulsing ring
        {
          type: "pie",
          radius: ["88%", "92%"],
          silent: true,
          animation: true,
          animationDuration: 1000,
          data: [
            {
              value: currentMaxScore * 100,
              itemStyle: {
                color: {
                  type: "radial",
                  x: 0.5,
                  y: 0.5,
                  r: 0.5,
                  colorStops: [
                    { offset: 0, color: ringColor },
                    {
                      offset: 1,
                      color: isCritical
                        ? "rgba(239, 68, 68, 0.2)"
                        : "rgba(226, 181, 62, 0.2)",
                    },
                  ],
                },
              },
            },
            {
              value: (1 - currentMaxScore) * 100,
              itemStyle: { color: "rgba(30, 41, 59, 0.5)" },
            },
          ],
          label: { show: false },
        },
        // Inner glow ring
        {
          type: "pie",
          radius: ["78%", "82%"],
          silent: true,
          animation: true,
          animationDuration: 1500,
          data: [
            {
              value: pulseIntensity * 100,
              itemStyle: {
                color: ringColor,
                opacity: 0.15,
              },
            },
            {
              value: (1 - pulseIntensity) * 100,
              itemStyle: { color: "transparent" },
            },
          ],
          label: { show: false },
        },
        // Radar sectors for anomaly types
        {
          type: "radar",
          data: [
            {
              value: ANOMALY_TYPES.map((at) => {
                const matching = anomalies.filter(
                  (a) => a.type === at.type
                ).length;
                return Math.min(matching * 0.2, 1);
              }),
              name: "Anomaly Profile",
              areaStyle: {
                color: isCritical
                  ? "rgba(239, 68, 68, 0.15)"
                  : "rgba(226, 181, 62, 0.1)",
              },
              lineStyle: {
                color: isCritical
                  ? "rgba(239, 68, 68, 0.6)"
                  : "rgba(226, 181, 62, 0.4)",
                width: 1.5,
              },
              itemStyle: {
                color: isCritical ? "#EF4444" : "#E2B53E",
                borderWidth: 0,
              },
              symbol: "circle",
              symbolSize: 4,
            },
          ],
        },
      ],
    };
  }, [anomalies, currentMaxScore, isCritical, isWarning]);

  return (
    <motion.div
      animate={isShaking ? { x: [-2, 2, -2, 2, 0] } : {}}
      transition={{ duration: 0.3 }}
      className={cn(
        "bg-uora-surface border rounded-md overflow-hidden transition-all duration-500 shadow-lg",
        isCritical
          ? "border-uora-error/50 glow-red-sm"
          : isWarning
          ? "border-uora-warning/30"
          : "border-uora-border"
      )}
    >
      <div className="px-5 py-4 border-b border-uora-border/60 flex items-center justify-between bg-uora-bg/30">
        <div className="flex items-center gap-2">
          <Radar
            className={cn(
              "w-4 h-4",
              isCritical ? "text-uora-error" : "text-uora-cyan animate-pulse"
            )}
          />
          <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300">Anomaly Pulse Detector</h3>
        </div>
        <div
          className={cn(
            "flex items-center gap-2 px-2.5 py-0.5 rounded border text-[10px] font-mono",
            isCritical
              ? "bg-uora-error/10 text-uora-error border-uora-error/20"
              : isWarning
              ? "bg-uora-warning/10 text-uora-warning border-uora-warning/20"
              : "bg-uora-success/10 text-uora-success border-uora-success/20"
          )}
        >
          <div
            className={cn(
              "w-1.5 h-1.5 rounded-full",
              isCritical
                ? "bg-uora-error animate-pulse"
                : isWarning
                ? "bg-uora-warning animate-pulse"
                : "bg-uora-success"
            )}
          />
          <span>{isCritical ? "CRITICAL" : isWarning ? "WARNING" : "NOMINAL"}</span>
        </div>
      </div>

      <div className="p-2 relative bg-uora-bg/10">
        {/* Anomaly flash overlay */}
        <AnimatePresence>
          {isCritical && (
            <motion.div
              initial={{ opacity: 0.3 }}
              animate={{ opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.8 }}
              className="absolute inset-0 bg-uora-error/5 z-10 pointer-events-none"
            />
          )}
        </AnimatePresence>

        <ReactECharts
          option={option}
          style={{ height: "290px", width: "100%" }}
          opts={{ renderer: "canvas" }}
          notMerge={true}
          lazyUpdate={true}
        />
      </div>

      {/* Anomaly Score Display */}
      <div className="px-5 pb-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-mono text-slate-500 uppercase">Isolation Forest Score</span>
          <span
            className={cn(
              "font-mono font-bold text-xs",
              isCritical
                ? "text-uora-error"
                : isWarning
                ? "text-uora-warning"
                : "text-uora-success"
            )}
          >
            {(currentMaxScore * 100).toFixed(1)}%
          </span>
        </div>
        <div className="h-1.5 bg-uora-elevated rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${currentMaxScore * 100}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className={cn(
              "h-full rounded-full",
              isCritical
                ? "bg-gradient-to-r from-uora-error/60 to-uora-error"
                : isWarning
                ? "bg-gradient-to-r from-uora-warning/60 to-uora-warning"
                : "bg-gradient-to-r from-uora-cyan/60 to-uora-cyan"
            )}
          />
        </div>

        {/* Latest anomaly events */}
        {anomalies.length > 0 ? (
          <div className="mt-4 space-y-1.5 max-h-24 overflow-y-auto border-t border-uora-border/60 pt-3">
            {anomalies
              .slice(-3)
              .reverse()
              .map((anomaly, idx) => (
                <motion.div
                  key={`${anomaly.timestamp}-${idx}`}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center gap-2 text-[10px] font-mono"
                >
                  <AlertTriangle
                    className={cn(
                      "w-3 h-3 flex-shrink-0",
                      anomaly.score > 0.7
                        ? "text-uora-error"
                        : "text-uora-warning"
                    )}
                  />
                  <span className="text-slate-500">
                    {new Date(anomaly.timestamp).toLocaleTimeString()}
                  </span>
                  <span
                    className={cn(
                      "font-semibold uppercase tracking-tight",
                      anomaly.score > 0.7
                        ? "text-uora-error"
                        : "text-slate-300"
                    )}
                  >
                    {anomaly.type.replace(/_/g, " ")}
                  </span>
                  <span className="text-slate-500 ml-auto">
                    {(anomaly.score * 100).toFixed(0)}%
                  </span>
                </motion.div>
              ))}
          </div>
        ) : (
          <div className="mt-4 text-center text-[10px] font-mono text-slate-600 border-t border-uora-border/60 pt-3 uppercase">
            No anomalous transaction patterns detected
          </div>
        )}
      </div>
    </motion.div>
  );
}
