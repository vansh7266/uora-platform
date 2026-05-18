"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import ReactECharts from "echarts-for-react";
import { Layers } from "lucide-react";

interface OrderbookLevel {
  price: number;
  quantity: number;
  orders: number;
}

/**
 * LiveOrderbookDepth — Real-time orderbook depth visualization showing
 * bid/ask imbalance with animated price levels. Simulates a live feed
 * from the benchmark reference LOB.
 */
export function LiveOrderbookDepth() {
  const [bidLevels, setBidLevels] = useState<OrderbookLevel[]>([]);
  const [askLevels, setAskLevels] = useState<OrderbookLevel[]>([]);

  const midPrice = 100.0;

  // Simulate orderbook level updates
  const generateLevels = useCallback(() => {
    const bids: OrderbookLevel[] = [];
    const asks: OrderbookLevel[] = [];

    for (let i = 0; i < 12; i++) {
      const spread = 0.01 * (i + 1);
      const bidQty = Math.floor(50 + Math.random() * 400);
      const askQty = Math.floor(50 + Math.random() * 400);
      bids.push({
        price: parseFloat((midPrice - spread).toFixed(2)),
        quantity: bidQty + Math.floor(Math.random() * 30) - 15,
        orders: Math.floor(1 + Math.random() * 8),
      });
      asks.push({
        price: parseFloat((midPrice + spread).toFixed(2)),
        quantity: askQty + Math.floor(Math.random() * 30) - 15,
        orders: Math.floor(1 + Math.random() * 8),
      });
    }

    setBidLevels(bids);
    setAskLevels(asks);
  }, []);

  useEffect(() => {
    generateLevels();
    const interval = setInterval(generateLevels, 1500);
    return () => clearInterval(interval);
  }, [generateLevels]);

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
        top: 50,
        right: 20,
        bottom: 40,
        left: 70,
      },
      tooltip: {
        trigger: "axis",
        backgroundColor: "#111827",
        borderColor: "#1E293B",
        borderWidth: 1,
        textStyle: {
          color: "#E2E8F0",
          fontSize: 11,
          fontFamily: "JetBrains Mono, monospace",
        },
        formatter: (params: Array<{ seriesName: string; value: number; color: string; axisValue?: string }>) => {
          const price = params[0]?.axisValue ?? "";
          let result = `<div style="font-size:11px;margin-bottom:4px;color:#94A3B8">Price: ${price}</div>`;
          params.forEach((p) => {
            const color = p.seriesName.includes("Bid") ? "#06B6D4" : "#EF4444";
            result += `<div style="display:flex;align-items:center;gap:6px;margin:2px 0">
              <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color}"></span>
              <span style="color:#94A3B8">${p.seriesName}:</span>
              <span style="color:#E2E8F0;font-weight:bold;font-family:JetBrains Mono,monospace">${p.value}</span>
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
          color: "#94A3B8",
          fontSize: 10,
          fontFamily: "JetBrains Mono, monospace",
        },
        itemWidth: 12,
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
            color: "rgba(6, 182, 212, 0.7)",
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
            color: "#06B6D4",
            type: "dashed",
          },
          animationDuration: 400,
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
      markLine: {
        silent: true,
        symbol: "none",
        data: [
          {
            xAxis: bidLevels.length - 0.5,
            lineStyle: {
              color: "#F59E0B",
              type: "solid",
              width: 2,
            },
            label: {
              formatter: "Spread",
              color: "#F59E0B",
              fontSize: 10,
              fontFamily: "JetBrains Mono, monospace",
            },
          },
        ],
      },
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
    <div className="bg-uora-surface border border-uora-border rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-uora-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-uora-cyan" />
          <h3 className="text-sm font-semibold">Live Orderbook Depth</h3>
        </div>
        <div className="flex items-center gap-4 text-[10px] font-mono">
          <div className="text-slate-500">
            Spread: <span className="text-uora-warning">{spread}</span>
          </div>
          <div className="text-slate-500">
            Bias:{" "}
            <span className={bidImbalance > 55 ? "text-uora-success" : bidImbalance < 45 ? "text-uora-error" : "text-slate-300"}>
              {bidImbalance}% bid
            </span>
          </div>
        </div>
      </div>
      <div className="p-2">
        <ReactECharts
          option={option}
          style={{ height: "320px", width: "100%" }}
          opts={{ renderer: "canvas" }}
          notMerge={true}
          lazyUpdate={true}
        />
      </div>
    </div>
  );
}
