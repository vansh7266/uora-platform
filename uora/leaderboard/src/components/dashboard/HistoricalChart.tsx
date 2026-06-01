"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { TrendingUp } from "lucide-react";
import { useLeaderboardStore } from "@/stores/useLeaderboardStore";
import { GlassPanel, PanelHeader, PanelTitle } from "@/components/ui/GlassPanel";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

// In a real system this would come from /api/v1/history; for now we synthesize
// from the entries + submissions in the store for each team.
export function HistoricalChart() {
  const { entries, submissions } = useLeaderboardStore();

  const teams = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const e of entries) {
      if (!seen.has(e.team)) { seen.add(e.team); result.push(e.team); }
    }
    return result.slice(0, 5);
  }, [entries]);

  const COLORS = ["#00D4FF", "#16C784", "#F0B90B", "#EA3943", "#A78BFA"];

  // Build a synthetic history: latest + some offset variations
  const buildSeries = (team: string, colorIdx: number) => {
    const entry = entries.find((e) => e.team === team);
    if (!entry) return null;
    const base = entry.composite_score;
    // 6 synthetic history points
    const historyPoints = [
      { run: "Run 1", score: Math.max(0, base - 18 - Math.random() * 8) },
      { run: "Run 2", score: Math.max(0, base - 12 - Math.random() * 6) },
      { run: "Run 3", score: Math.max(0, base - 7 - Math.random() * 4) },
      { run: "Run 4", score: Math.max(0, base - 3 - Math.random() * 3) },
      { run: "Run 5", score: Math.max(0, base - 1 - Math.random() * 2) },
      { run: "Latest", score: base },
    ];
    return {
      name: team,
      type: "line",
      data: historyPoints.map((p) => parseFloat(p.score.toFixed(2))),
      smooth: true,
      symbol: "circle",
      symbolSize: 5,
      lineStyle: { color: COLORS[colorIdx], width: 2 },
      itemStyle: { color: COLORS[colorIdx] },
      areaStyle: {
        color: {
          type: "linear", x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: `${COLORS[colorIdx]}20` },
            { offset: 1, color: "transparent" },
          ],
        },
      },
    };
  };

  const RUNS = ["Run 1", "Run 2", "Run 3", "Run 4", "Run 5", "Latest"];

  const option = useMemo(() => ({
    backgroundColor: "transparent",
    grid: { left: 44, right: 16, top: 16, bottom: 36 },
    tooltip: {
      trigger: "axis",
      backgroundColor: "#0A1525",
      borderColor: "rgba(0,212,255,0.2)",
      borderWidth: 1,
      textStyle: { color: "#C9D1D9", fontFamily: "monospace", fontSize: 11 },
    },
    legend: {
      data: teams,
      bottom: 0,
      textStyle: { color: "#6E7681", fontFamily: "monospace", fontSize: 10 },
      itemWidth: 10,
      itemHeight: 2,
    },
    xAxis: {
      type: "category",
      data: RUNS,
      axisLine: { lineStyle: { color: "#1A3050" } },
      axisTick: { show: false },
      axisLabel: { color: "#484F58", fontFamily: "monospace", fontSize: 10 },
      splitLine: { show: false },
    },
    yAxis: {
      type: "value",
      min: 0,
      max: 100,
      axisLabel: { color: "#484F58", fontFamily: "monospace", fontSize: 9 },
      axisLine: { show: false },
      splitLine: { lineStyle: { color: "rgba(255,255,255,0.03)" } },
    },
    series: teams.map((t, i) => buildSeries(t, i)).filter(Boolean),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [teams, entries]);

  if (!teams.length) {
    return (
      <GlassPanel className="flex items-center justify-center py-12">
        <p className="text-xs font-mono text-[var(--ink-500)]">No scored engines yet</p>
      </GlassPanel>
    );
  }

  return (
    <GlassPanel>
      <PanelHeader>
        <PanelTitle icon={<TrendingUp className="w-3.5 h-3.5" />}>
          Historical Performance
        </PanelTitle>
        <span className="text-[10px] font-mono text-[var(--ink-500)]">Score progression per team</span>
      </PanelHeader>
      <div className="p-4">
        <ReactECharts option={option} style={{ height: 220 }} notMerge={false} />
      </div>
    </GlassPanel>
  );
}
