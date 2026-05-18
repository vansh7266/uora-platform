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
        right: 20,
        bottom: 40,
        left: 80,
      },
      tooltip: {
        trigger: "axis",
        backgroundColor: "#111827",
        borderColor: "#1E293B",
        borderWidth: 1,
        textStyle: {
          color: "#E2E8F0",
          fontSize: 12,
          fontFamily: "JetBrains Mono, monospace",
        },
        axisPointer: {
          type: "shadow",
          shadowStyle: {
            color: "rgba(6, 182, 212, 0.05)",
          },
        },
        formatter: (params: Array<{ name: string; value: number; data: { itemStyle: { color: string } } }>) => {
          const p = params[0];
          return `<div style="font-size:11px;margin-bottom:4px;color:#94A3B8">${p.name}</div>
            <div style="display:flex;align-items:center;gap:6px">
              <span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${p.data.itemStyle.color}"></span>
              <span style="color:#E2E8F0;font-weight:bold;font-family:JetBrains Mono,monospace">${(p.value / 1000).toFixed(1)}K</span>
              <span style="color:#94A3B8">orders/sec</span>
            </div>`;
        },
      },
      xAxis: {
        type: "value",
        name: "K/s",
        nameTextStyle: {
          color: "#64748B",
          fontSize: 10,
          fontFamily: "JetBrains Mono, monospace",
        },
        axisLine: { lineStyle: { color: "#1E293B" } },
        axisTick: { show: false },
        axisLabel: {
          color: "#64748B",
          fontSize: 10,
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
          fontSize: 11,
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
              borderRadius: [0, 4, 4, 0],
            },
          })),
          barWidth: "60%",
          animationDuration: 800,
          animationEasing: "cubicOut",
          label: {
            show: true,
            position: "right",
            color: "#94A3B8",
            fontSize: 10,
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
    <div className="bg-uora-surface border border-uora-border rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-uora-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-uora-blue" />
          <h3 className="text-sm font-semibold">Throughput by Team</h3>
        </div>
        <div className="flex items-center gap-3 text-[10px] font-mono text-slate-500">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm bg-[#3B82F6]" />
            C++
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm bg-[#F97316]" />
            Rust
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm bg-[#06B6D4]" />
            Go
          </div>
        </div>
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
    </div>
  );
}
