"use client";

import { useMemo } from "react";
import ReactECharts from "echarts-for-react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Download,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileText,
  Shield,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useLeaderboardStore } from "@/stores/useLeaderboardStore";
import { cn, formatLatency, formatThroughput } from "@/lib/utils";

const CORRECTNESS_LEVELS = [
  {
    level: "L1",
    label: "Basic Matching",
    description: "Order matching produces correct fills",
  },
  {
    level: "L2",
    label: "Price-Time Priority",
    description: "Orders matched in strict price-time sequence",
  },
  {
    level: "L3",
    label: "Multi-Book Consistency",
    description: "Cross-book arbitration produces consistent state",
  },
  {
    level: "L4",
    label: "Adversarial Correctness",
    description: "Correct under adversarial market conditions",
  },
];

export function SubmissionDetail() {
  const router = useRouter();
  const { selectedEntry } = useLeaderboardStore();

  const fallbackEntry = useMemo(() => ({
    rank: 1,
    prevRank: 1,
    submission_id: "sub-001",
    team: "Team Alpha",
    language: "cpp",
    composite_score: 95.2,
    p99_latency_ms: 1.2,
    p50_latency_ms: 0.4,
    throughput: 45000,
    correctness_rate: 0.999,
    status: "completed" as const,
    anomaly_score: 0.15,
  }), []);

  const entry = selectedEntry || fallbackEntry;

  // Latency histogram data
  const histogramOption = useMemo(() => {
    const bins = 30;
    const labels: string[] = [];
    const values: number[] = [];

    for (let i = 0; i < bins; i++) {
      const latency = (i / bins) * (entry.p99_latency_ms * 2);
      labels.push(latency.toFixed(2));
      // Normal-ish distribution centered around p50
      const mean = entry.p50_latency_ms;
      const std = entry.p99_latency_ms / 4;
      const x = latency;
      const gaussian =
        Math.exp(-0.5 * Math.pow((x - mean) / std, 2)) * 100;
      values.push(Math.max(0, gaussian));
    }

    return {
      backgroundColor: "transparent",
      grid: { top: 20, right: 20, bottom: 40, left: 50 },
      tooltip: {
        backgroundColor: "#111827",
        borderColor: "#1E293B",
        borderWidth: 1,
        textStyle: {
          color: "#E2E8F0",
          fontSize: 11,
          fontFamily: "JetBrains Mono, monospace",
        },
      },
      xAxis: {
        type: "category",
        data: labels,
        axisLine: { lineStyle: { color: "#1E293B" } },
        axisTick: { show: false },
        axisLabel: {
          color: "#64748B",
          fontSize: 9,
          fontFamily: "JetBrains Mono, monospace",
          interval: 4,
          formatter: (val: string) => `${val}ms`,
        },
      },
      yAxis: {
        type: "value",
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: "#64748B",
          fontSize: 9,
          fontFamily: "JetBrains Mono, monospace",
        },
        splitLine: {
          lineStyle: { color: "#1E293B", type: "dashed" },
        },
      },
      series: [
        {
          type: "bar",
          data: values.map((v) => ({
            value: v,
            itemStyle: {
              color: {
                type: "linear",
                x: 0,
                y: 0,
                x2: 0,
                y2: 1,
                colorStops: [
                  { offset: 0, color: "rgba(6, 182, 212, 0.8)" },
                  { offset: 1, color: "rgba(6, 182, 212, 0.1)" },
                ],
              },
              borderRadius: [2, 2, 0, 0],
            },
          })),
          barWidth: "80%",
        },
      ],
    };
  }, [entry]);

  return (
    <div className="min-h-screen bg-uora-bg bg-grid-pattern pt-20 px-4 sm:px-6 lg:px-8 pb-12">
      <div className="max-w-6xl mx-auto">
        {/* Back Button */}
        <motion.button
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          onClick={() => router.push("/dashboard")}
          className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </motion.button>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-uora-surface border border-uora-border rounded-xl p-6 mb-6"
        >
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-2xl font-bold">{entry.team}</h1>
                <span
                  className={cn(
                    "px-2 py-0.5 rounded text-[10px] font-mono border",
                    entry.language === "cpp"
                      ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                      : entry.language === "Rust"
                      ? "bg-orange-500/10 text-orange-400 border-orange-500/20"
                      : "bg-cyan-500/10 text-cyan-400 border-cyan-500/20"
                  )}
                >
                  {entry.language === "cpp" ? "C++" : entry.language}
                </span>
              </div>
              <p className="text-sm text-slate-500 font-mono">
                {entry.submission_id} · Rank #{entry.rank}
              </p>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold font-mono text-uora-cyan">
                {entry.composite_score.toFixed(2)}
              </div>
              <p className="text-xs text-slate-500">Composite Score</p>
            </div>
          </div>
        </motion.div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            {
              label: "P50 Latency",
              value: formatLatency(entry.p50_latency_ms),
              color: "text-uora-cyan",
            },
            {
              label: "P99 Latency",
              value: formatLatency(entry.p99_latency_ms),
              color: "text-uora-warning",
            },
            {
              label: "Throughput",
              value: formatThroughput(entry.throughput) + "/s",
              color: "text-uora-success",
            },
            {
              label: "Correctness",
              value: (entry.correctness_rate * 100).toFixed(1) + "%",
              color: "text-uora-success",
            },
          ].map((stat, idx) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
              className="bg-uora-surface border border-uora-border rounded-xl p-4"
            >
              <p className="text-xs text-slate-500 mb-1">{stat.label}</p>
              <p className={cn("text-xl font-bold font-mono", stat.color)}>
                {stat.value}
              </p>
            </motion.div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Latency Distribution */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-uora-surface border border-uora-border rounded-xl overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-uora-border flex items-center gap-2">
              <FileText className="w-4 h-4 text-uora-cyan" />
              <h3 className="text-sm font-semibold">
                Latency Distribution
              </h3>
            </div>
            <div className="p-4">
              <ReactECharts
                option={histogramOption}
                style={{ height: "250px", width: "100%" }}
                opts={{ renderer: "canvas" }}
              />
            </div>
          </motion.div>

          {/* Correctness Validation */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-uora-surface border border-uora-border rounded-xl overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-uora-border flex items-center gap-2">
              <Shield className="w-4 h-4 text-uora-cyan" />
              <h3 className="text-sm font-semibold">
                Correctness Validation
              </h3>
            </div>
            <div className="p-4 space-y-3">
              {CORRECTNESS_LEVELS.map((level, idx) => {
                const passRate = Math.max(
                  0.7,
                  entry.correctness_rate - idx * 0.05
                );
                const passed = passRate >= 0.95;

                return (
                  <div
                    key={level.level}
                    className="flex items-center gap-3 p-3 rounded-lg bg-uora-bg border border-uora-border"
                  >
                    <div
                      className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center",
                        passed
                          ? "bg-uora-success/10"
                          : "bg-uora-error/10"
                      )}
                    >
                      {passed ? (
                        <CheckCircle2 className="w-4 h-4 text-uora-success" />
                      ) : (
                        <XCircle className="w-4 h-4 text-uora-error" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold text-slate-300">
                          {level.level}
                        </span>
                        <span className="text-xs text-slate-400">
                          {level.label}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500">
                        {level.description}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "text-xs font-mono font-bold",
                        passed ? "text-uora-success" : "text-uora-error"
                      )}
                    >
                      {(passRate * 100).toFixed(1)}%
                    </span>
                  </div>
                );
              })}
            </div>
          </motion.div>
        </div>

        {/* ML Anomaly Report */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-uora-surface border border-uora-border rounded-xl overflow-hidden mb-6"
        >
          <div className="px-5 py-4 border-b border-uora-border flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-uora-warning" />
            <h3 className="text-sm font-semibold">ML Anomaly Report</h3>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-lg bg-uora-bg border border-uora-border">
                <p className="text-xs text-slate-500 mb-1">
                  Isolation Forest Score
                </p>
                <p
                  className={cn(
                    "text-xl font-bold font-mono",
                    entry.anomaly_score > 0.7
                      ? "text-uora-error"
                      : "text-uora-success"
                  )}
                >
                  {(entry.anomaly_score * 100).toFixed(1)}%
                </p>
              </div>
              <div className="p-4 rounded-lg bg-uora-bg border border-uora-border">
                <p className="text-xs text-slate-500 mb-1">Detected Patterns</p>
                <p className="text-xl font-bold font-mono text-slate-300">
                  {entry.anomaly_score > 0.7 ? "3" : "0"}
                </p>
              </div>
              <div className="p-4 rounded-lg bg-uora-bg border border-uora-border">
                <p className="text-xs text-slate-500 mb-1">Risk Level</p>
                <p
                  className={cn(
                    "text-xl font-bold font-mono",
                    entry.anomaly_score > 0.7
                      ? "text-uora-error"
                      : entry.anomaly_score > 0.4
                      ? "text-uora-warning"
                      : "text-uora-success"
                  )}
                >
                  {entry.anomaly_score > 0.7
                    ? "HIGH"
                    : entry.anomaly_score > 0.4
                    ? "MEDIUM"
                    : "LOW"}
                </p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Export Button */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="flex justify-end"
        >
          <button className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-uora-elevated border border-uora-border text-sm text-slate-300 hover:text-white hover:bg-uora-cyan/10 hover:border-uora-cyan/20 transition-colors">
            <Download className="w-4 h-4" />
            Export as PDF
          </button>
        </motion.div>
      </div>
    </div>
  );
}
