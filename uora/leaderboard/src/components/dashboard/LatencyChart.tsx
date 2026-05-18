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
        backgroundColor: "#111827",
        borderColor: "#1E293B",
        borderWidth: 1,
        textStyle: {
          color: "#E2E8F0",
          fontSize: 12,
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
          let result = `<div style="font-size:11px;margin-bottom:4px;color:#94A3B8">${params[0]?.axisValue ?? ""}</div>`;
          params.forEach((p) => {
            result += `<div style="display:flex;align-items:center;gap:6px;margin:2px 0">
              <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.color}"></span>
              <span style="color:#94A3B8">${p.seriesName}:</span>
              <span style="color:#E2E8F0;font-weight:bold;font-family:JetBrains Mono,monospace">${p.value.toFixed(3)}ms</span>
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
          color: "#94A3B8",
          fontSize: 11,
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
          fontSize: 10,
          fontFamily: "JetBrains Mono, monospace",
          interval: Math.max(0, Math.floor(timestamps.length / 6) - 1),
        },
        splitLine: { show: false },
      },
      yAxis: {
        type: "value",
        name: "ms",
        nameTextStyle: {
          color: "#64748B",
          fontSize: 10,
          fontFamily: "JetBrains Mono, monospace",
        },
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: "#64748B",
          fontSize: 10,
          fontFamily: "JetBrains Mono, monospace",
        },
        splitLine: {
          lineStyle: {
            color: "#1E293B",
            type: "dashed",
          },
        },
      },
      dataZoom: [
        {
          type: "inside",
          start: 60,
          end: 100,
          zoomOnMouseWheel: true,
          moveOnMouseMove: true,
        },
      ],
      series: [
        {
          name: "p50",
          type: "line",
          data: metrics.map((m) => m.p50),
          smooth: 0.4,
          symbol: "none",
          lineStyle: {
            width: 2,
            color: "#06B6D4",
          },
          areaStyle: {
            color: {
              type: "linear",
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: "rgba(6, 182, 212, 0.15)" },
                { offset: 1, color: "rgba(6, 182, 212, 0.0)" },
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
            width: 2,
            color: "#8B5CF6",
          },
          areaStyle: {
            color: {
              type: "linear",
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: "rgba(139, 92, 246, 0.1)" },
                { offset: 1, color: "rgba(139, 92, 246, 0.0)" },
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
            color: "#F59E0B",
          },
          areaStyle: {
            color: {
              type: "linear",
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: "rgba(245, 158, 11, 0.1)" },
                { offset: 1, color: "rgba(245, 158, 11, 0.0)" },
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
                  fontSize: 10,
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
    <div className="bg-uora-surface border border-uora-border rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-uora-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-uora-cyan" />
          <h3 className="text-sm font-semibold">Latency Percentiles</h3>
        </div>
        <div className="flex items-center gap-4 text-[10px] font-mono text-slate-500">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-0.5 rounded-full bg-[#06B6D4]" />
            p50
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-0.5 rounded-full bg-[#8B5CF6]" />
            p90
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-0.5 rounded-full bg-[#F59E0B]" />
            p99
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
