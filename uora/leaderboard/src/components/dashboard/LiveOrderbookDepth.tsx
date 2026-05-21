"use client";

import { useMemo, useState, useEffect } from "react";
import ReactECharts from "echarts-for-react";
import { Layers } from "lucide-react";

interface OrderbookLevel {
  price: number;
  quantity: number;
  orders: number;
}

function deterministicUnit(seed: number) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function generateLevels(currentTick: number, midPrice: number) {
  const bids: OrderbookLevel[] = [];
  const asks: OrderbookLevel[] = [];

  for (let i = 0; i < 12; i++) {
    const spread = 0.01 * (i + 1);
    const bidQty = Math.floor(50 + deterministicUnit(currentTick * 31 + i) * 400);
    const askQty = Math.floor(50 + deterministicUnit(currentTick * 37 + i) * 400);
    bids.push({
      price: parseFloat((midPrice - spread).toFixed(2)),
      quantity: bidQty + Math.floor(deterministicUnit(currentTick * 41 + i) * 30) - 15,
      orders: Math.floor(1 + deterministicUnit(currentTick * 43 + i) * 8),
    });
    asks.push({
      price: parseFloat((midPrice + spread).toFixed(2)),
      quantity: askQty + Math.floor(deterministicUnit(currentTick * 47 + i) * 30) - 15,
      orders: Math.floor(1 + deterministicUnit(currentTick * 53 + i) * 8),
    });
  }

  return { bids, asks };
}

/**
 * LiveOrderbookDepth — Real-time orderbook depth visualization showing
 * bid/ask imbalance with animated, deterministic price levels.
 */
export function LiveOrderbookDepth() {
  const [tick, setTick] = useState(0);
  const midPrice = 100.0;

  useEffect(() => {
    const interval = setInterval(() => setTick((value) => value + 1), 1500);
    return () => clearInterval(interval);
  }, []);

  const { bids: bidLevels, asks: askLevels } = useMemo(
    () => generateLevels(tick, midPrice),
    [tick, midPrice]
  );

  const option = useMemo(() => {
    const bidPrices = bidLevels.map((l) => l.price.toFixed(2));
    const askPrices = askLevels.map((l) => l.price.toFixed(2));

    const bidCumulative: number[] = [];
    let bidSum = 0;
    for (const l of bidLevels) {
      bidSum += l.quantity;
      bidCumulative.push(bidSum);
    }

    const askCumulative: number[] = [];
    let askSum = 0;
    for (const l of askLevels) {
      askSum += l.quantity;
      askCumulative.push(askSum);
    }

    const maxQty = Math.max(
      ...bidLevels.map((l) => l.quantity),
      ...askLevels.map((l) => l.quantity),
      100
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
        backgroundColor: "#0F1117",
        borderColor: "#1E293B",
        borderWidth: 1,
        textStyle: {
          color: "#F8FAFC",
          fontSize: 11,
          fontFamily: "JetBrains Mono, monospace",
        },
        formatter: (params: Array<{ seriesName: string; value: number; color: string; axisValue?: string }>) => {
          const price = params[0]?.axisValue ?? "";
          let result = `<div style="font-size:10px;margin-bottom:4px;color:#64748B;font-family:JetBrains Mono">Price: ${price}</div>`;
          params.forEach((p) => {
            const color = p.seriesName.includes("Bid") ? "#10B981" : "#EF4444";
            result += `<div style="display:flex;align-items:center;gap:6px;margin:2px 0;font-family:JetBrains Mono">
              <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${color}"></span>
              <span style="color:#94A3B8">${p.seriesName}:</span>
              <span style="color:#F8FAFC;font-weight:bold;margin-left:auto">${p.value}</span>
            </div>`;
          });
          return result;
        },
      },
      legend: {
        data: ["Bid Qty", "Ask Qty", "Bid Depth", "Ask Depth"],
        top: 8,
        right: 20,
        textStyle: {
          color: "#64748B",
          fontSize: 9,
          fontFamily: "JetBrains Mono, monospace",
        },
        itemWidth: 10,
        itemHeight: 2,
        itemGap: 12,
      },
      xAxis: {
        type: "category",
        data: [...bidPrices.reverse(), ...askPrices],
        axisLine: { lineStyle: { color: "#1E293B" } },
        axisTick: { show: false },
        axisLabel: {
          color: "#64748B",
          fontSize: 8,
          fontFamily: "JetBrains Mono, monospace",
          rotate: 45,
          interval: 1,
        },
      },
      yAxis: [
        {
          type: "value",
          name: "Qty",
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
            lineStyle: { color: "#1E293B", type: "dashed" },
          },
          max: maxQty * 1.2,
        },
        {
          type: "value",
          name: "Depth",
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
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: "Bid Qty",
          type: "bar",
          stack: "bid",
          data: [...bidLevels.map((l) => l.quantity).reverse(), ...askLevels.map(() => 0)],
          itemStyle: {
            color: "rgba(16, 185, 129, 0.7)",
            borderRadius: [2, 2, 0, 0],
          },
          barWidth: "60%",
          animationDuration: 400,
          animationEasing: "cubicOut",
        },
        {
          name: "Ask Qty",
          type: "bar",
          stack: "ask",
          data: [...bidLevels.map(() => 0), ...askLevels.map((l) => l.quantity)],
          itemStyle: {
            color: "rgba(239, 68, 68, 0.7)",
            borderRadius: [2, 2, 0, 0],
          },
          barWidth: "60%",
          animationDuration: 400,
          animationEasing: "cubicOut",
        },
        {
          name: "Bid Depth",
          type: "line",
          yAxisIndex: 1,
          data: [...bidCumulative.reverse(), ...askLevels.map(() => 0)],
          smooth: 0.3,
          symbol: "none",
          lineStyle: {
            width: 1.5,
            color: "#10B981",
            type: "dashed",
          },
          animationDuration: 400,
          markLine: {
            silent: true,
            symbol: "none",
            data: [
              {
                xAxis: bidLevels.length - 0.5,
                lineStyle: {
                  color: "#E2B53E",
                  type: "solid",
                  width: 1.5,
                },
                label: {
                  formatter: "Spread",
                  color: "#E2B53E",
                  fontSize: 9,
                  fontFamily: "JetBrains Mono, monospace",
                },
              },
            ],
          },
        },
        {
          name: "Ask Depth",
          type: "line",
          yAxisIndex: 1,
          data: [...bidLevels.map(() => 0), ...askCumulative],
          smooth: 0.3,
          symbol: "none",
          lineStyle: {
            width: 1.5,
            color: "#EF4444",
            type: "dashed",
          },
          animationDuration: 400,
        },
      ],
      animation: true,
      animationDuration: 500,
    };
  }, [bidLevels, askLevels]);

  const spread = askLevels.length > 0 && bidLevels.length > 0
    ? (askLevels[0].price - bidLevels[0].price).toFixed(2)
    : "---";

  const bidImbalance = (() => {
    const totalBid = bidLevels.reduce((s, l) => s + l.quantity, 0);
    const totalAsk = askLevels.reduce((s, l) => s + l.quantity, 0);
    if (totalBid + totalAsk === 0) return 50;
    return Math.round((totalBid / (totalBid + totalAsk)) * 100);
  })();

  return (
    <div className="bg-uora-surface border border-uora-border rounded-md overflow-hidden shadow-lg">
      <div className="px-5 py-4 border-b border-uora-border/60 flex items-center justify-between bg-uora-bg/30">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-uora-cyan animate-pulse" />
          <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300">Live Orderbook Depth</h3>
        </div>
        <div className="flex items-center gap-4 text-[10px] font-mono">
          <div className="text-slate-500 uppercase">
            Spread: <span className="text-uora-cyan font-bold">{spread}</span>
          </div>
          <div className="text-slate-500 uppercase">
            Bias:{" "}
            <span className={bidImbalance > 55 ? "text-uora-success font-bold" : bidImbalance < 45 ? "text-uora-error font-bold" : "text-slate-300 font-bold"}>
              {bidImbalance}% BID
            </span>
          </div>
        </div>
      </div>
      <div className="p-4 bg-uora-bg/15">
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
