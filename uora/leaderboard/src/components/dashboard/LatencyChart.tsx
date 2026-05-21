"use client";

import { useMemo } from "react";
import ReactECharts from "echarts-for-react";
import { Activity } from "lucide-react";
import { useLeaderboardStore } from "@/stores/useLeaderboardStore";

export function LatencyChart() {
  const { metrics } = useLeaderboardStore();

  const option = useMemo(() => {
    const timestamps = metrics.map((m) =>
      new Date(m.timestamp).toLocaleTimeString()
    );
    const yMax = Math.max(2, ...metrics.map((m) => m.p99)) * 1.15;

    return {
      backgroundColor: "transparent",
      grid: {
        top: 40,
        right: 20,
        bottom: 40,
        left: 60,
      },
      tooltip: {
        trigger: "axis",
        backgroundColor: "#0F1117",
        borderColor: "#1E293B",
        borderWidth: 1,
        textStyle: {
          color: "#F8FAFC",
          fontSize: 11,
          fontFamily: "JetBrains Mono, monospace",
        },
        axisPointer: {
          type: "cross",
          lineStyle: {
            color: "#334155",
          },
          crossStyle: {
            color: "#334155",
          },
        },
        formatter: (params: Array<{ seriesName: string; value: number; color: string; axisValue?: string }>) => {
          let result = `<div style="font-size:10px;margin-bottom:4px;color:#64748B;font-family:JetBrains Mono">${params[0]?.axisValue ?? ""}</div>`;
          params.forEach((p) => {
            result += `<div style="display:flex;align-items:center;gap:6px;margin:2px 0;font-family:JetBrains Mono">
              <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${p.color}"></span>
              <span style="color:#94A3B8">${p.seriesName}:</span>
              <span style="color:#F8FAFC;font-weight:bold;margin-left:auto">${p.value.toFixed(3)}ms</span>
            </div>`;
          });
          return result;
        },
      },
      legend: {
        data: ["p50", "p90", "p99"],
        top: 8,
        right: 20,
        textStyle: {
          color: "#64748B",
          fontSize: 10,
          fontFamily: "JetBrains Mono, monospace",
        },
        itemWidth: 12,
        itemHeight: 2,
        itemGap: 16,
      },
      xAxis: {
        type: "category",
        data: timestamps,
        boundaryGap: false,
        axisLine: { lineStyle: { color: "#1E293B" } },
        axisTick: { show: false },
        axisLabel: {
          color: "#64748B",
          fontSize: 9,
          fontFamily: "JetBrains Mono, monospace",
          interval: Math.max(0, Math.floor(timestamps.length / 6) - 1),
        },
        splitLine: { show: false },
      },
      yAxis: {
        type: "value",
        min: 0,
        max: yMax,
        name: "ms",
        nameTextStyle: {
          color: "#64748B",
          fontSize: 9,
          fontFamily: "JetBrains Mono, monospace",
        },
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: "#64748B",
          fontSize: 9,
          fontFamily: "JetBrains Mono, monospace",
        },
        splitLine: {
          lineStyle: {
            color: "#1E293B",
            type: "dashed",
          },
        },
      },
      series: [
        {
          name: "p50",
          type: "line",
          data: metrics.map((m) => m.p50),
          smooth: 0.4,
          symbol: "none",
          lineStyle: {
            width: 1.5,
            color: "#10B981", // Cyber Mint Green
          },
          areaStyle: {
            color: {
              type: "linear",
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: "rgba(16, 185, 129, 0.12)" },
                { offset: 1, color: "rgba(16, 185, 129, 0.0)" },
              ],
            },
          },
          animationDuration: 300,
          animationEasing: "cubicOut",
        },
        {
          name: "p90",
          type: "line",
          data: metrics.map((m) => m.p90),
          smooth: 0.4,
          symbol: "none",
          lineStyle: {
            width: 1.5,
            color: "#3B82F6", // Technical Cobalt Blue
          },
          areaStyle: {
            color: {
              type: "linear",
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: "rgba(59, 130, 246, 0.08)" },
                { offset: 1, color: "rgba(59, 130, 246, 0.0)" },
              ],
            },
          },
          animationDuration: 300,
          animationEasing: "cubicOut",
        },
        {
          name: "p99",
          type: "line",
          data: metrics.map((m) => m.p99),
          smooth: 0.4,
          symbol: "none",
          lineStyle: {
            width: 2,
            color: "#E2B53E", // Champagne Gold
          },
          areaStyle: {
            color: {
              type: "linear",
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: "rgba(226, 181, 62, 0.12)" },
                { offset: 1, color: "rgba(226, 181, 62, 0.0)" },
              ],
            },
          },
          animationDuration: 300,
          animationEasing: "cubicOut",
          markLine: {
            silent: true,
            symbol: "none",
            lineStyle: {
              color: "#EF4444",
              type: "dashed",
              width: 1,
            },
            data: [
              {
                yAxis: 2.0,
                label: {
                  formatter: "SLA Limit",
                  color: "#EF4444",
                  fontSize: 9,
                  fontFamily: "JetBrains Mono, monospace",
                },
              },
            ],
          },
        },
      ],
      animation: true,
      animationDuration: 500,
    };
  }, [metrics]);

  return (
    <div className="bg-uora-surface border border-uora-border rounded-md overflow-hidden shadow-lg">
      <div className="px-5 py-4 border-b border-uora-border/60 flex items-center justify-between bg-uora-bg/30">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-uora-cyan animate-pulse" />
          <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300">Latency Percentiles</h3>
        </div>
        <div className="flex items-center gap-4 text-[9px] font-mono text-slate-500">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-0.5 rounded-full bg-[#10B981]" />
            p50
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-0.5 rounded-full bg-[#3B82F6]" />
            p90
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-0.5 rounded-full bg-[#E2B53E]" />
            p99
          </div>
        </div>
      </div>
      <div className="p-4">
        {metrics.length < 2 ? (
          <div className="grid h-[280px] place-items-center rounded-md bg-uora-bg/60 text-center border border-uora-border/40">
            <div>
              <div className="text-xs font-mono font-bold tracking-wider text-slate-400 uppercase">Awaiting telemetry stream</div>
              <div className="mt-1.5 text-[10px] font-sans text-slate-600">Submit an engine and wait for benchmark telemetry to render realtime latency percentiles.</div>
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
