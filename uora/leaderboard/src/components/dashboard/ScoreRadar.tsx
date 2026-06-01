"use client";

import { useMemo } from "react";
import { useLeaderboardStore } from "@/stores/useLeaderboardStore";
import { GlassPanel, PanelHeader, PanelTitle } from "@/components/ui/GlassPanel";
import { Gauge } from "lucide-react";
import { Chart } from "@/components/ui/Chart";

export function ScoreRadar() {
  const { entries } = useLeaderboardStore();
  const top3 = entries.slice(0, 3);

  const COLORS = ["#00D4FF", "#16C784", "#F0B90B"];

  const getRadarValues = (e: (typeof entries)[0]) => {
    const latencyScore = Math.max(0, 100 - e.p99_latency_ms * 30);
    const throughputScore = Math.min(100, (e.throughput / 12000) * 100);
    const correctnessScore = e.correctness_rate * 100;
    const stabilityScore = Math.max(0, 100 - (e.error_rate ?? 0) * 1000);
    const anomalyScore = Math.max(0, 100 - (e.anomaly_score ?? 0) * 100);
    return [latencyScore, throughputScore, correctnessScore, stabilityScore, anomalyScore];
  };

  const option = useMemo(() => ({
    backgroundColor: "transparent",
    tooltip: {
      backgroundColor: "#0A1525",
      borderColor: "rgba(0,212,255,0.2)",
      borderWidth: 1,
      textStyle: { color: "#C9D1D9", fontFamily: "monospace", fontSize: 11 },
    },
    legend: {
      data: top3.map((e) => e.team),
      bottom: 0,
      textStyle: { color: "#6E7681", fontFamily: "monospace", fontSize: 10 },
      itemWidth: 10,
      itemHeight: 10,
    },
    radar: {
      indicator: [
        { name: "Latency", max: 100 },
        { name: "Throughput", max: 100 },
        { name: "Correctness", max: 100 },
        { name: "Stability", max: 100 },
        { name: "Anomaly", max: 100 },
      ],
      shape: "polygon",
      splitNumber: 4,
      axisName: {
        color: "#6E7681",
        fontFamily: "monospace",
        fontSize: 10,
        formatter: (v: string) => v,
      },
      splitLine: { lineStyle: { color: "rgba(255,255,255,0.06)" } },
      splitArea: { areaStyle: { color: ["rgba(255,255,255,0.01)", "rgba(0,0,0,0)"] } },
      axisLine: { lineStyle: { color: "rgba(255,255,255,0.08)" } },
      center: ["50%", "48%"],
      radius: "65%",
    },
    series: [{
      type: "radar",
      data: top3.map((e, i) => ({
        name: e.team,
        value: getRadarValues(e),
        lineStyle: { color: COLORS[i], width: 1.5 },
        itemStyle: { color: COLORS[i] },
        areaStyle: { color: `${COLORS[i]}18` },
      })),
    }],
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [top3]);

  if (!top3.length) {
    return (
      <GlassPanel className="flex flex-col items-center justify-center py-12 text-center">
        <Gauge className="w-6 h-6 text-[var(--ink-600)] mb-2" />
        <p className="text-xs font-mono text-[var(--ink-500)]">No scored engines yet</p>
      </GlassPanel>
    );
  }

  return (
    <GlassPanel>
      <PanelHeader>
        <PanelTitle icon={<Gauge className="w-3.5 h-3.5" />}>Score Breakdown</PanelTitle>
        <span className="text-[10px] font-mono text-[var(--ink-500)]">Top 3 engines</span>
      </PanelHeader>
      <div className="p-4">
        <Chart option={option} height={280} />
      </div>
    </GlassPanel>
  );
}
