"use client";

import { useMemo } from "react";
import { Activity } from "lucide-react";
import { useLeaderboardStore } from "@/stores/useLeaderboardStore";
import { GlassPanel, PanelHeader, PanelTitle } from "@/components/ui/GlassPanel";
import { MetricKPI } from "@/components/ui/MetricKPI";
import { Chart } from "@/components/ui/Chart";

const PLASMA = "#00D4FF";
const BID    = "#16C784";
const ASK    = "#EA3943";
const AMBER  = "#F0B90B";
const MUTED  = "#1A3050";

function LatencyLineChart() {
  const { metrics } = useLeaderboardStore();
  // Skip the flat-zero idle window between benchmarks.
  const data = metrics
    .slice(-60)
    .filter((m) => m.p99 > 0 || m.p90 > 0 || m.p50 > 0);

  const option = useMemo(() => ({
    backgroundColor: "transparent",
    animation: true,
    animationDuration: 400,
    grid: { left: 52, right: 16, top: 16, bottom: 36 },
    tooltip: {
      trigger: "axis",
      backgroundColor: "#0A1525",
      borderColor: "rgba(0,212,255,0.2)",
      borderWidth: 1,
      textStyle: { color: "#C9D1D9", fontFamily: "monospace", fontSize: 11 },
      formatter: (params: { name: string; marker: string; seriesName: string; value: number | string }[]) => {
        const t = new Date(parseInt(params[0].name)).toLocaleTimeString();
        const rows = params
          .map((p) => {
            const v = typeof p.value === "number" ? p.value : parseFloat(p.value as string);
            return `${p.marker}${p.seriesName}: ${Number.isFinite(v) ? v.toFixed(3) : "—"}ms`;
          })
          .join("<br>");
        return `<div style="font-family:monospace;font-size:11px">${t}<br>${rows}</div>`;
      },
    },
    legend: {
      data: ["P50", "P90", "P99"],
      textStyle: { color: "#6E7681", fontFamily: "monospace", fontSize: 10 },
      right: 0,
      top: 0,
    },
    xAxis: {
      type: "category",
      data: data.map((d) => d.timestamp.toString()),
      axisLine: { lineStyle: { color: MUTED } },
      axisTick: { show: false },
      axisLabel: {
        show: true,
        color: "#484F58",
        fontFamily: "monospace",
        fontSize: 9,
        formatter: (v: string) => new Date(parseInt(v)).toLocaleTimeString("en-US", { hour12: false, minute: "2-digit", second: "2-digit" }),
        interval: Math.floor(data.length / 4),
      },
      splitLine: { show: false },
    },
    yAxis: {
      type: "value",
      axisLabel: { color: "#484F58", fontFamily: "monospace", fontSize: 9, formatter: "{value}ms" },
      axisLine: { show: false },
      splitLine: { lineStyle: { color: "rgba(255,255,255,0.03)" } },
    },
    series: [
      {
        name: "P50",
        type: "line",
        data: data.map((d) => Number(d.p50.toFixed(3))),
        smooth: true,
        symbol: "none",
        lineStyle: { color: BID, width: 1.5 },
        areaStyle: { color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: `${BID}20` }, { offset: 1, color: "transparent" }] } },
      },
      {
        name: "P90",
        type: "line",
        data: data.map((d) => Number(d.p90.toFixed(3))),
        smooth: true,
        symbol: "none",
        lineStyle: { color: PLASMA, width: 1.5 },
        areaStyle: { color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: `${PLASMA}15` }, { offset: 1, color: "transparent" }] } },
      },
      {
        name: "P99",
        type: "line",
        data: data.map((d) => Number(d.p99.toFixed(3))),
        smooth: true,
        symbol: "none",
        lineStyle: { color: ASK, width: 2 },
        areaStyle: { color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: `${ASK}18` }, { offset: 1, color: "transparent" }] } },
      },
    ],
  }), [data]);

  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-48 text-[var(--ink-500)] text-xs font-mono">
        Awaiting telemetry stream…
      </div>
    );
  }

  return <Chart option={option} height={200} />;
}

function ThroughputChart() {
  const { metrics } = useLeaderboardStore();
  // Drop the long flat-zero idle tail between benchmark runs so the
  // chart isn't an empty grid when no benchmark is currently active.
  const data = metrics
    .slice(-60)
    .filter((m) => m.throughput > 0);

  const option = useMemo(() => ({
    backgroundColor: "transparent",
    animation: true,
    grid: { left: 60, right: 16, top: 8, bottom: 36 },
    tooltip: {
      trigger: "axis",
      backgroundColor: "#0A1525",
      borderColor: "rgba(0,212,255,0.2)",
      borderWidth: 1,
      textStyle: { color: "#C9D1D9", fontFamily: "monospace", fontSize: 11 },
    },
    xAxis: {
      type: "category",
      data: data.map((d) => d.timestamp.toString()),
      axisLine: { lineStyle: { color: MUTED } },
      axisTick: { show: false },
      axisLabel: {
        color: "#484F58",
        fontFamily: "monospace",
        fontSize: 9,
        formatter: (v: string) => new Date(parseInt(v)).toLocaleTimeString("en-US", { hour12: false, minute: "2-digit", second: "2-digit" }),
        interval: Math.floor(data.length / 4),
      },
      splitLine: { show: false },
    },
    yAxis: {
      type: "value",
      axisLabel: {
        color: "#484F58",
        fontFamily: "monospace",
        fontSize: 9,
        formatter: (v: number) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : `${(v / 1_000).toFixed(0)}K`,
      },
      axisLine: { show: false },
      splitLine: { lineStyle: { color: "rgba(255,255,255,0.03)" } },
    },
    series: [{
      type: "bar",
      data: data.map((d) => d.throughput),
      barMaxWidth: 6,
      itemStyle: {
        color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [{ offset: 0, color: PLASMA }, { offset: 1, color: `${PLASMA}30` }] },
        borderRadius: [2, 2, 0, 0],
      },
    }],
  }), [data]);

  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-40 text-[var(--ink-500)] text-xs font-mono">
        Awaiting telemetry stream…
      </div>
    );
  }

  return <Chart option={option} height={160} />;
}

export function LatencyPanel() {
  const { entries, metrics } = useLeaderboardStore();

  const latest = metrics[metrics.length - 1];
  const best = entries.length
    ? entries.reduce((b, e) => (e.p99_latency_ms < b.p99_latency_ms ? e : b), entries[0])
    : null;

  return (
    <div className="space-y-4">
      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Best P50", value: best ? `${best.p50_latency_ms.toFixed(3)}ms` : "—", color: "bid" as const },
          { label: "Best P90", value: best ? `${best.p90_latency_ms.toFixed(3)}ms` : "—", color: "plasma" as const },
          { label: "Best P99", value: best ? `${best.p99_latency_ms.toFixed(3)}ms` : "—", color: "ask" as const },
          { label: "Live TPS", value: latest ? (latest.throughput >= 1_000_000 ? `${(latest.throughput / 1_000_000).toFixed(2)}M` : `${(latest.throughput / 1_000).toFixed(1)}K`) : "—", color: "plasma" as const },
        ].map((kpi) => (
          <GlassPanel key={kpi.label} className="p-4">
            <MetricKPI {...kpi} size="md" />
          </GlassPanel>
        ))}
      </div>

      {/* Latency time-series */}
      <GlassPanel>
        <PanelHeader>
          <PanelTitle icon={<Activity className="w-3.5 h-3.5" />}>
            Latency Profile · P50 / P90 / P99
          </PanelTitle>
        </PanelHeader>
        <div className="p-4">
          <LatencyLineChart />
        </div>
      </GlassPanel>

      {/* Throughput */}
      <GlassPanel>
        <PanelHeader>
          <PanelTitle>Throughput · Orders per Second</PanelTitle>
        </PanelHeader>
        <div className="p-4">
          <ThroughputChart />
        </div>
      </GlassPanel>
    </div>
  );
}
