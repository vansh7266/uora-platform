"use client";

import { useMemo } from "react";
import ReactECharts from "echarts-for-react";
import { BarChart3 } from "lucide-react";
import { useLeaderboardStore } from "@/stores/useLeaderboardStore";
import { getLanguageColor } from "@/lib/utils";

export function ThroughputChart() {
  const { entries } = useLeaderboardStore();

  const option = useMemo(() => {
    const sortedEntries = [...entries].sort(
      (a, b) => b.throughput - a.throughput
    );
    const teamNames = sortedEntries.map((e) => e.team);
    const throughputs = sortedEntries.map((e) => e.throughput);
    const colors = sortedEntries.map((e) => getLanguageColor(e.language));

    return {
      backgroundColor: "transparent",
      grid: {
        top: 30,
        right: 40,
        bottom: 40,
        left: 80,
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
          type: "shadow",
          shadowStyle: {
            color: "rgba(226, 181, 62, 0.04)",
          },
        },
        formatter: (params: Array<{ name: string; value: number; data: { itemStyle: { color: string } } }>) => {
          const p = params[0];
          return `<div style="font-size:10px;margin-bottom:4px;color:#64748B;font-family:JetBrains Mono">${p.name}</div>
            <div style="display:flex;align-items:center;gap:6px;font-family:JetBrains Mono">
              <span style="display:inline-block;width:7px;height:7px;border-radius:2px;background:${p.data.itemStyle.color}"></span>
              <span style="color:#94A3B8">Throughput:</span>
              <span style="color:#F8FAFC;font-weight:bold;margin-left:auto">${(p.value / 1000).toFixed(1)}K ops/s</span>
            </div>`;
        },
      },
      xAxis: {
        type: "value",
        name: "K/s",
        nameTextStyle: {
          color: "#64748B",
          fontSize: 9,
          fontFamily: "JetBrains Mono, monospace",
        },
        axisLine: { lineStyle: { color: "#1E293B" } },
        axisTick: { show: false },
        axisLabel: {
          color: "#64748B",
          fontSize: 9,
          fontFamily: "JetBrains Mono, monospace",
          formatter: (val: number) => `${(val / 1000).toFixed(0)}K`,
        },
        splitLine: {
          lineStyle: {
            color: "#1E293B",
            type: "dashed",
          },
        },
      },
      yAxis: {
        type: "category",
        data: teamNames,
        axisLine: { lineStyle: { color: "#1E293B" } },
        axisTick: { show: false },
        axisLabel: {
          color: "#94A3B8",
          fontSize: 10,
          fontFamily: "JetBrains Mono, monospace",
        },
      },
      series: [
        {
          type: "bar",
          data: throughputs.map((val, idx) => ({
            value: val,
            itemStyle: {
              color: {
                type: "linear",
                x: 0,
                y: 0,
                x2: 1,
                y2: 0,
                colorStops: [
                  { offset: 0, color: colors[idx] + "33" },
                  { offset: 1, color: colors[idx] },
                ],
              },
              borderRadius: [0, 2, 2, 0],
            },
          })),
          barWidth: "50%",
          animationDuration: 800,
          animationEasing: "cubicOut",
          label: {
            show: true,
            position: "right",
            color: "#94A3B8",
            fontSize: 9,
            fontFamily: "JetBrains Mono, monospace",
            formatter: (params: { value: number }) =>
              `${(params.value / 1000).toFixed(1)}K`,
          },
        },
      ],
      animation: true,
      animationDuration: 800,
    };
  }, [entries]);

  return (
    <div className="bg-uora-surface border border-uora-border rounded-md overflow-hidden shadow-lg">
      <div className="px-5 py-4 border-b border-uora-border/60 flex items-center justify-between bg-uora-bg/30">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-uora-cyan animate-pulse" />
          <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300">Throughput Performance</h3>
        </div>
        <div className="flex items-center gap-3 text-[10px] font-mono text-slate-500 uppercase">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded bg-[#3B82F6]" />
            C++
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded bg-[#F97316]" />
            Rust
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded bg-[#06B6D4]" />
            Go
          </div>
        </div>
      </div>
      <div className="p-4 bg-uora-bg/15">
        {entries.length === 0 ? (
          <div className="grid h-[280px] place-items-center rounded-md bg-uora-bg/60 text-center border border-uora-border/40">
            <div>
              <div className="text-xs font-mono font-bold tracking-wider text-slate-400 uppercase">Awaiting telemetry stream</div>
              <div className="mt-1.5 text-[10px] font-sans text-slate-600">Start simulated benchmark load to render realtime throughput capacity.</div>
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
