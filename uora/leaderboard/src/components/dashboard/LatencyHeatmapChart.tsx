"use client";

import { useMemo } from "react";
import ReactECharts from "echarts-for-react";
import { Flame } from "lucide-react";
import { useLeaderboardStore } from "@/stores/useLeaderboardStore";

/**
 * LatencyHeatmapChart — Visualizes latency distribution across submission teams
 * as a time-binned heatmap. Each row is a team, each column is a time bucket,
 * and cell intensity represents p99 latency.
 */
export function LatencyHeatmapChart() {
  const { entries, metrics } = useLeaderboardStore();

  const option = useMemo(() => {
    // Teams for Y-axis
    const teams = entries.slice(0, 10).map((e) => e.team || e.submission_id.slice(0, 8));

    // Time buckets for X-axis
    const timeLabels = metrics.length > 0
      ? metrics.slice(-16).map((m) =>
          new Date(m.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        )
      : Array.from({ length: 16 }, (_, i) => `${i}:00`);

    const deterministicUnit = (seed: number) => {
      const value = Math.sin(seed * 12.9898) * 43758.5453;
      return value - Math.floor(value);
    };

    // Generate heatmap data: [timeIdx, teamIdx, latencyValue]
    const data: [number, number, number][] = [];
    for (let t = 0; t < timeLabels.length; t++) {
      for (let team = 0; team < teams.length; team++) {
        const baseLatency = entries[team]?.p99_latency_ms ?? 1.5;
        const jitter = (deterministicUnit(t * 97 + team) - 0.5) * 0.4;
        const latency = Math.max(0.1, baseLatency + jitter * baseLatency);
        data.push([t, team, parseFloat(latency.toFixed(3))]);
      }
    }

    // Find max for visual map range
    const maxLatency = Math.max(...data.map((d) => d[2]), 2.0);

    return {
      backgroundColor: "transparent",
      grid: {
        top: 30,
        right: 70,
        bottom: 50,
        left: 90,
      },
      tooltip: {
        backgroundColor: "#0F1117",
        borderColor: "#1E293B",
        borderWidth: 1,
        textStyle: {
          color: "#F8FAFC",
          fontSize: 11,
          fontFamily: "JetBrains Mono, monospace",
        },
        formatter: (params: { value: number[]; name: string }) => {
          const [tIdx, gIdx, val] = params.value;
          const team = teams[gIdx] || "unknown";
          const time = timeLabels[tIdx] || "";
          return `<div style="font-size:11px;font-family:JetBrains Mono">
            <div style="color:#64748B;margin-bottom:4px">${time}</div>
            <div style="color:#F8FAFC;font-weight:bold"><b>${team}</b></div>
            <div style="color:#E2B53E;font-weight:bold;margin-top:2px">${val.toFixed(3)}ms</div>
          </div>`;
        },
      },
      xAxis: {
        type: "category",
        data: timeLabels,
        axisLine: { lineStyle: { color: "#1E293B" } },
        axisTick: { show: false },
        axisLabel: {
          color: "#64748B",
          fontSize: 9,
          fontFamily: "JetBrains Mono, monospace",
          interval: Math.max(0, Math.floor(timeLabels.length / 6) - 1),
          rotate: 30,
        },
        splitArea: { show: false },
      },
      yAxis: {
        type: "category",
        data: teams,
        axisLine: { lineStyle: { color: "#1E293B" } },
        axisTick: { show: false },
        axisLabel: {
          color: "#94A3B8",
          fontSize: 9,
          fontFamily: "JetBrains Mono, monospace",
        },
        splitArea: { show: false },
      },
      visualMap: {
        min: 0,
        max: maxLatency,
        calculable: true,
        orient: "vertical",
        right: 0,
        top: "center",
        itemHeight: 120,
        itemWidth: 10,
        textStyle: {
          color: "#64748B",
          fontSize: 8,
          fontFamily: "JetBrains Mono, monospace",
        },
        inRange: {
          color: ["#10B981", "#6EE7B7", "#FBBF24", "#F97316", "#EF4444"],
        },
        text: ["Slow", "Fast"],
      },
      series: [
        {
          type: "heatmap",
          data: data,
          emphasis: {
            itemStyle: {
              borderColor: "#F8FAFC",
              borderWidth: 1,
            },
          },
          itemStyle: {
            borderColor: "#08090C",
            borderWidth: 2,
            borderRadius: 2,
          },
          progressive: 500,
          animation: true,
          animationDuration: 800,
        },
      ],
    };
  }, [entries, metrics]);

  return (
    <div className="bg-uora-surface border border-uora-border rounded-md overflow-hidden shadow-lg">
      <div className="px-5 py-4 border-b border-uora-border/60 flex items-center justify-between bg-uora-bg/30">
        <div className="flex items-center gap-2">
          <Flame className="w-4 h-4 text-uora-warning animate-pulse" />
          <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300">Latency Heatmap</h3>
        </div>
        <span className="text-[10px] font-mono text-slate-500 uppercase">
          p99 latency × time bucket
        </span>
      </div>
      <div className="p-4 bg-uora-bg/15">
        {entries.length === 0 ? (
          <div className="grid h-[280px] place-items-center rounded-md bg-uora-bg/60 text-center border border-uora-border/40">
            <div>
              <div className="text-xs font-mono font-bold tracking-wider text-slate-400 uppercase">Awaiting telemetry stream</div>
              <div className="mt-1.5 text-[10px] font-sans text-slate-600">Start simulated benchmark load to render realtime latency heatmap.</div>
            </div>
          </div>
        ) : (
          <ReactECharts
            option={option}
            style={{ height: "280px", width: "100%" }}
            opts={{ renderer: "canvas" }}
            notMerge={true}
            lazyUpdate={true}
          />
        )}
      </div>
    </div>
  );
}
