"use client";

import { useMemo } from "react";
import { useLeaderboardStore } from "@/stores/useLeaderboardStore";
import { GlassPanel, PanelHeader, PanelTitle } from "@/components/ui/GlassPanel";
import { BarChart2 } from "lucide-react";
import { Chart } from "@/components/ui/Chart";

function buildHistogram(metrics: { p50: number; p90: number; p99: number }[]) {
  if (!metrics.length) return { buckets: [], counts: [] };
  const allVals = metrics.flatMap((m) => [m.p50, m.p90, m.p99]).filter((v) => v > 0);
  if (!allVals.length) return { buckets: [], counts: [] };

  const min = Math.min(...allVals);
  const max = Math.max(...allVals);
  const NUM_BINS = 20;
  const binWidth = (max - min) / NUM_BINS || 0.01;

  const counts = new Array(NUM_BINS).fill(0);
  for (const v of allVals) {
    const bin = Math.min(Math.floor((v - min) / binWidth), NUM_BINS - 1);
    counts[bin]++;
  }

  const buckets = Array.from({ length: NUM_BINS }, (_, i) =>
    (min + i * binWidth + binWidth / 2).toFixed(3)
  );

  return { buckets, counts };
}

export function LatencyHistogram() {
  const { metrics } = useLeaderboardStore();
  const { buckets, counts } = useMemo(() => buildHistogram(metrics), [metrics]);

  const maxCount = Math.max(...counts, 1);

  const option = useMemo(() => ({
    backgroundColor: "transparent",
    grid: { left: 48, right: 16, top: 8, bottom: 40 },
    tooltip: {
      trigger: "axis",
      backgroundColor: "#0A1525",
      borderColor: "rgba(0,212,255,0.2)",
      borderWidth: 1,
      textStyle: { color: "#C9D1D9", fontFamily: "monospace", fontSize: 11 },
      formatter: (params: { name: string; value: number }[]) =>
        `<span style="font-family:monospace;font-size:11px">${params[0].name}ms — ${params[0].value} samples</span>`,
    },
    xAxis: {
      type: "category",
      data: buckets,
      axisLine: { lineStyle: { color: "#1A3050" } },
      axisTick: { show: false },
      axisLabel: {
        color: "#484F58",
        fontFamily: "monospace",
        fontSize: 9,
        interval: 3,
        formatter: (v: string) => `${v}ms`,
      },
      splitLine: { show: false },
    },
    yAxis: {
      type: "value",
      axisLabel: { color: "#484F58", fontFamily: "monospace", fontSize: 9 },
      axisLine: { show: false },
      splitLine: { lineStyle: { color: "rgba(255,255,255,0.03)" } },
    },
    series: [{
      type: "bar",
      data: counts.map((c, i) => ({
        value: c,
        itemStyle: {
          color: {
            type: "linear", x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: c / maxCount > 0.6 ? "#EA3943" : c / maxCount > 0.3 ? "#F0B90B" : "#00D4FF" },
              { offset: 1, color: "rgba(0,0,0,0)" },
            ],
          },
          borderRadius: [2, 2, 0, 0],
        },
      })),
      barCategoryGap: "10%",
    }],
    visualMap: {
      show: false,
      min: 0,
      max: maxCount,
    },
  }), [buckets, counts, maxCount]);

  if (!buckets.length) {
    return (
      <GlassPanel className="flex items-center justify-center h-40">
        <p className="text-xs font-mono text-[var(--ink-500)]">Awaiting latency samples…</p>
      </GlassPanel>
    );
  }

  return (
    <GlassPanel>
      <PanelHeader>
        <PanelTitle icon={<BarChart2 className="w-3.5 h-3.5" />}>
          Latency Distribution
        </PanelTitle>
        <span className="text-[10px] font-mono text-[var(--ink-500)]">
          {metrics.length * 3} samples
        </span>
      </PanelHeader>
      <div className="p-4">
        <Chart option={option} height={180} />
      </div>
      <div className="px-5 pb-4 flex items-center gap-4 text-[10px] font-mono text-[var(--ink-500)]">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-[var(--plasma)]" />Normal</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-[#F0B90B]" />Elevated</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-[var(--ask)]" />High tail</span>
      </div>
    </GlassPanel>
  );
}
