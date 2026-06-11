"use client";

import { useMemo } from "react";
import { TrendingUp } from "lucide-react";
import { useLeaderboardStore } from "@/stores/useLeaderboardStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { GlassPanel, PanelHeader, PanelTitle } from "@/components/ui/GlassPanel";
import { Chart } from "@/components/ui/Chart";

// Real performance history: one point per scored engine per team, ordered by
// scoring time. For real users this only shows what actually ran. For demo
// users we synthesise a smooth progression so the chart isn't sparse.
export function HistoricalChart() {
  const { entries } = useLeaderboardStore();
  const { isDemo } = useAuthStore();

  const teams = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const e of entries) {
      if (!seen.has(e.team)) {
        seen.add(e.team);
        result.push(e.team);
      }
    }
    return result.slice(0, 5);
  }, [entries]);

  const COLORS = ["#00D4FF", "#16C784", "#F0B90B", "#EA3943", "#A78BFA"];

  // ── REAL data series: every scored entry for this team, in submission order ──
  // (entries are already keyed by submission_id; multiple submissions per team
  // become multiple data points.)
  const buildRealSeries = (team: string, colorIdx: number) => {
    const teamEntries = entries.filter((e) => e.team === team);
    if (teamEntries.length === 0) return null;
    const sortedEntries = teamEntries.slice().sort((a, b) => (a.submitted_at || 0) - (b.submitted_at || 0));
    return {
      name: team,
      type: "line",
      data: sortedEntries.map((e) => parseFloat(e.composite_score.toFixed(2))),
      smooth: true,
      symbol: "circle",
      symbolSize: 6,
      lineStyle: { color: COLORS[colorIdx], width: 2 },
      itemStyle: { color: COLORS[colorIdx] },
      areaStyle: {
        color: {
          type: "linear",
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            { offset: 0, color: `${COLORS[colorIdx]}20` },
            { offset: 1, color: "transparent" },
          ],
        },
      },
    };
  };

  // ── DEMO data series: smooth synthetic progression ────────────────────────
  const buildDemoSeries = (team: string, colorIdx: number) => {
    const entry = entries.find((e) => e.team === team);
    if (!entry) return null;
    const base = entry.composite_score;
    // Deterministic offsets so the chart is stable across renders (no
    // Math.random — React 19's purity rules flag impure expressions
    // during render).
    const seed = team.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    const wobble = (i: number) => ((seed * (i + 7)) % 13) / 13; // 0..1
    const points = [
      Math.max(0, base - 18 - wobble(1) * 4),
      Math.max(0, base - 12 - wobble(2) * 3),
      Math.max(0, base - 7 - wobble(3) * 2),
      Math.max(0, base - 3 - wobble(4) * 2),
      Math.max(0, base - 1 - wobble(5) * 1),
      base,
    ];
    return {
      name: team,
      type: "line",
      data: points.map((s) => parseFloat(s.toFixed(2))),
      smooth: true,
      symbol: "circle",
      symbolSize: 5,
      lineStyle: { color: COLORS[colorIdx], width: 2 },
      itemStyle: { color: COLORS[colorIdx] },
      areaStyle: {
        color: {
          type: "linear",
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            { offset: 0, color: `${COLORS[colorIdx]}20` },
            { offset: 1, color: "transparent" },
          ],
        },
      },
    };
  };

  const REAL_RUNS = useMemo(() => {
    const maxLen = Math.max(0, ...teams.map((t) => entries.filter((e) => e.team === t).length));
    return Array.from({ length: maxLen }, (_, i) => `Run ${i + 1}`);
  }, [teams, entries]);
  const DEMO_RUNS = ["Run 1", "Run 2", "Run 3", "Run 4", "Run 5", "Latest"];

  const xData = isDemo ? DEMO_RUNS : REAL_RUNS;
  const seriesBuilder = isDemo ? buildDemoSeries : buildRealSeries;

  const option = useMemo(
    () => ({
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
        data: xData,
        axisLine: { lineStyle: { color: "#1A3050" } },
        axisTick: { show: false },
        axisLabel: { color: "#484F58", fontFamily: "monospace", fontSize: 10 },
        splitLine: { show: false },
      },
      yAxis: {
        type: "value",
        min: 0,
        axisLabel: { color: "#484F58", fontFamily: "monospace", fontSize: 9 },
        axisLine: { show: false },
        splitLine: { lineStyle: { color: "rgba(255,255,255,0.03)" } },
      },
      series: teams.map((t, i) => seriesBuilder(t, i)).filter(Boolean),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [teams, entries, xData, isDemo]
  );

  if (!teams.length) {
    return (
      <GlassPanel className="flex items-center justify-center py-12">
        <p className="text-xs font-mono text-[var(--ink-500)]">No scored engines yet</p>
      </GlassPanel>
    );
  }

  // Single real data point — chart isn't meaningful. Show an empty state instead.
  if (!isDemo && xData.length < 2) {
    return (
      <GlassPanel>
        <PanelHeader>
          <PanelTitle icon={<TrendingUp className="w-3.5 h-3.5" />}>
            Historical Performance
          </PanelTitle>
          <span className="text-[10px] font-mono text-[var(--ink-500)]">
            Score progression per team
          </span>
        </PanelHeader>
        <div className="px-5 py-10 text-center">
          <TrendingUp className="w-7 h-7 text-[var(--ink-600)] mx-auto mb-3" />
          <p className="text-[11px] font-mono text-[var(--ink-400)] uppercase tracking-wider">
            Awaiting a second submission
          </p>
          <p className="text-[10px] font-mono text-[var(--ink-500)] mt-1.5 leading-relaxed max-w-sm mx-auto">
            Run another engine to plot your score progression. Each scored
            submission appears here as a new data point.
          </p>
        </div>
      </GlassPanel>
    );
  }

  return (
    <GlassPanel>
      <PanelHeader>
        <PanelTitle icon={<TrendingUp className="w-3.5 h-3.5" />}>
          Historical Performance
        </PanelTitle>
        <span className="text-[10px] font-mono text-[var(--ink-500)]">
          Score progression per team
        </span>
      </PanelHeader>
      <div className="p-4">
        <Chart option={option} height={220} />
      </div>
    </GlassPanel>
  );
}
