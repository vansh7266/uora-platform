"use client";

import { useMemo, useEffect, useState } from "react";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { useLeaderboardStore } from "@/stores/useLeaderboardStore";
import { GlassPanel, PanelHeader, PanelTitle } from "@/components/ui/GlassPanel";
import { Badge } from "@/components/ui/Badge";
import { Chart } from "@/components/ui/Chart";

// ── Live orderbook depth ──────────────────────────────────────────────────────
// Fetches from the reference engine's /api/v1/orderbook endpoint (real data).
// Falls back to an empty state if the reference engine isn't reachable rather
// than fabricating fake levels.

type DepthLevel = [number, number]; // [price, cumSize]

interface SnapshotLevel {
  price: string;
  quantity: number;
  order_count: number;
}

function cumulate(levels: SnapshotLevel[], descending = false): DepthLevel[] {
  let cum = 0;
  const out: DepthLevel[] = [];
  for (const l of levels) {
    cum += l.quantity;
    out.push([parseFloat(l.price), cum]);
  }
  return descending ? out.reverse() : out;
}

function OrderbookDepthChart() {
  const [bids, setBids] = useState<DepthLevel[]>([]);
  const [asks, setAsks] = useState<DepthLevel[]>([]);
  const { submissions } = useLeaderboardStore();

  useEffect(() => {
    // Use the submission API's /orderbook/snapshot proxy, which reaches into
    // the latest active contestant container via the internal Docker network.
    // This avoids needing public access to sub-<id>:8080 from the browser.
    const apiUrl =
      process.env.NEXT_PUBLIC_API_URL ||
      "http://localhost:8000";

    const fetchSnapshot = async () => {
      try {
        const res = await fetch(`${apiUrl}/api/v1/orderbook/snapshot`, {
          cache: "no-store",
          credentials: "include",
        });
        if (!res.ok) return;
        const data = await res.json();
        setBids(cumulate((data.bids ?? []) as SnapshotLevel[], true));
        setAsks(cumulate((data.asks ?? []) as SnapshotLevel[], false));
      } catch {
        // Backend offline; chart stays in empty state.
      }
    };
    fetchSnapshot();
    const id = setInterval(fetchSnapshot, 2000);
    return () => clearInterval(id);
    // submissions kept for re-trigger when status changes
  }, [submissions]);


  const allPrices = [...bids.map(([p]) => p), ...asks.map(([p]) => p)];
  const maxCum = Math.max(...bids.map(([, c]) => c), ...asks.map(([, c]) => c), 1);

  const option = useMemo(() => ({
    backgroundColor: "transparent",
    animation: true,
    animationDuration: 600,
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
      data: allPrices.map(String),
      axisLine: { lineStyle: { color: "#1A3050" } },
      axisTick: { show: false },
      axisLabel: {
        color: "#484F58",
        fontFamily: "monospace",
        fontSize: 9,
        interval: 4,
        rotate: 30,
      },
      splitLine: { show: false },
    },
    yAxis: {
      type: "value",
      max: maxCum * 1.1,
      axisLabel: {
        color: "#484F58",
        fontFamily: "monospace",
        fontSize: 9,
        formatter: (v: number) => `${(v / 1000).toFixed(0)}K`,
      },
      axisLine: { show: false },
      splitLine: { lineStyle: { color: "rgba(255,255,255,0.03)" } },
    },
    series: [
      {
        name: "Bids",
        type: "line",
        data: [
          ...bids.map(([, c]) => c),
          ...new Array(asks.length).fill(null),
        ],
        smooth: false,
        symbol: "none",
        lineStyle: { color: "#16C784", width: 1.5 },
        areaStyle: { color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: "rgba(22,199,132,0.25)" }, { offset: 1, color: "rgba(22,199,132,0.02)" }] } },
        connectNulls: false,
      },
      {
        name: "Asks",
        type: "line",
        data: [
          ...new Array(bids.length).fill(null),
          ...asks.map(([, c]) => c),
        ],
        smooth: false,
        symbol: "none",
        lineStyle: { color: "#EA3943", width: 1.5 },
        areaStyle: { color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: "rgba(234,57,67,0.25)" }, { offset: 1, color: "rgba(234,57,67,0.02)" }] } },
        connectNulls: false,
      },
    ],
  }), [bids, asks, allPrices, maxCum]);

  if (!bids.length && !asks.length) {
    return (
      <div className="flex items-center justify-center h-[200px] text-center px-6">
        <p className="text-[10px] font-mono text-[var(--ink-500)] leading-relaxed max-w-xs">
          Reference engine snapshot unavailable. Make sure the engine is
          running on the configured URL — depth fills here as soon as the
          first order rests.
        </p>
      </div>
    );
  }

  return <Chart option={option} height={200} />;
}

// ── Anomaly feed ──────────────────────────────────────────────────────────────

function AnomalyFeed() {
  const { anomalies } = useLeaderboardStore();

  if (!anomalies.length) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-2">
        <ShieldCheck className="w-6 h-6 text-[var(--bid)] opacity-50" />
        <p className="text-xs font-mono text-[var(--ink-500)]">No anomalies detected</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-[rgba(255,255,255,0.04)] max-h-64 overflow-y-auto">
      {[...anomalies].reverse().map((a, i) => {
        const high = a.score > 0.7;
        const med = a.score > 0.4;
        const variant = high ? "ask" : med ? "amber" : "neutral";
        return (
          <div key={i} className="flex items-start gap-3 px-5 py-3">
            <AlertTriangle
              className={`w-3.5 h-3.5 flex-shrink-0 mt-0.5 ${
                high ? "text-[var(--ask)]" : med ? "text-[#F0B90B]" : "text-[var(--ink-500)]"
              }`}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-mono text-[var(--ink-200)]">{a.team}</span>
                <Badge variant={variant}>{a.type}</Badge>
                <span className="text-[10px] font-mono text-[var(--ink-500)]">
                  score: {a.score.toFixed(3)}
                </span>
              </div>
              <p className="text-[10px] font-mono text-[var(--ink-500)] mt-0.5">
                {new Date(a.timestamp).toLocaleTimeString()}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Validation levels breakdown ────────────────────────────────────────────────

const VALIDATION_LEVELS = [
  { level: "L1", name: "Price-Time Priority", desc: "Fill ordering correctness" },
  { level: "L2", name: "State Machine",        desc: "Order lifecycle transitions" },
  { level: "L3", name: "Market Invariants",    desc: "Cross-order consistency" },
  { level: "L4", name: "Deterministic GED",    desc: "Graph edit distance replay" },
];

function ValidationMatrix() {
  const { entries } = useLeaderboardStore();
  const best = entries[0];

  return (
    <div className="divide-y divide-[rgba(255,255,255,0.04)]">
      {VALIDATION_LEVELS.map(({ level, name, desc }) => {
        const correctness = best?.correctness_rate ?? 0;
        const passed = correctness > 0.95;
        return (
          <div key={level} className="flex items-center gap-4 px-5 py-3">
            <div className="w-8 h-8 rounded flex items-center justify-center text-[10px] font-mono font-bold text-[var(--plasma)] bg-[rgba(0,212,255,0.06)] border border-[rgba(0,212,255,0.12)] flex-shrink-0">
              {level}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-mono font-medium text-[var(--ink-200)]">{name}</div>
              <div className="text-[10px] text-[var(--ink-500)]">{desc}</div>
            </div>
            <Badge variant={passed ? "bid" : "ask"}>
              {passed ? "PASS" : entries.length ? "FAIL" : "—"}
            </Badge>
          </div>
        );
      })}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function ValidationPanel() {
  return (
    <div className="space-y-4">
      {/* Orderbook depth */}
      <GlassPanel>
        <PanelHeader>
          <PanelTitle icon={<ShieldCheck className="w-3.5 h-3.5" />}>
            Live Orderbook Depth · Reference LOB
          </PanelTitle>
          <div className="flex items-center gap-3 text-[10px] font-mono">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[var(--bid)]" />Bids</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[var(--ask)]" />Asks</span>
          </div>
        </PanelHeader>
        <div className="p-4">
          <OrderbookDepthChart />
        </div>
      </GlassPanel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Validation levels */}
        <GlassPanel>
          <PanelHeader>
            <PanelTitle>Validation Matrix</PanelTitle>
          </PanelHeader>
          <ValidationMatrix />
        </GlassPanel>

        {/* Anomaly feed */}
        <GlassPanel>
          <PanelHeader>
            <PanelTitle icon={<AlertTriangle className="w-3.5 h-3.5" />}>
              ML Anomaly Feed
            </PanelTitle>
          </PanelHeader>
          <AnomalyFeed />
        </GlassPanel>
      </div>
    </div>
  );
}
