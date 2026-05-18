"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  TrendingUp,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface OrderBookLevel {
  price: number;
  quantity: number;
  orders: number;
}

interface OrderBookSnapshot {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  timestamp: number;
  lastPrice: number;
  lastSide: "buy" | "sell";
}

// Generate mock orderbook data
function generateOrderbook(): OrderBookSnapshot {
  const midPrice = 100 + Math.random() * 2 - 1;
  const bids: OrderBookLevel[] = [];
  const asks: OrderBookLevel[] = [];

  for (let i = 0; i < 8; i++) {
    bids.push({
      price: midPrice - 0.01 * (i + 1),
      quantity: Math.floor(Math.random() * 500 + 50),
      orders: Math.floor(Math.random() * 10 + 1),
    });
    asks.push({
      price: midPrice + 0.01 * (i + 1),
      quantity: Math.floor(Math.random() * 500 + 50),
      orders: Math.floor(Math.random() * 10 + 1),
    });
  }

  return {
    bids: bids.sort((a, b) => b.price - a.price),
    asks: asks.sort((a, b) => a.price - b.price),
    timestamp: Date.now(),
    lastPrice: midPrice + (Math.random() > 0.5 ? 0.01 : -0.01),
    lastSide: Math.random() > 0.5 ? "buy" : "sell",
  };
}

// Generate a sequence of orderbook snapshots
function generateSequence(count: number): OrderBookSnapshot[] {
  const sequence: OrderBookSnapshot[] = [];
  for (let i = 0; i < count; i++) {
    const snapshot = generateOrderbook();
    snapshot.timestamp = Date.now() - (count - i) * 100;
    sequence.push(snapshot);
  }
  return sequence;
}

const SPEEDS = [1, 2, 5, 10];

export function MarketReplayTheatre() {
  const [sequence] = useState<OrderBookSnapshot[]>(() =>
    generateSequence(200)
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [matchedPrice, setMatchedPrice] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const currentSnapshot = sequence[currentIndex] || sequence[0];

  const maxQuantity = Math.max(
    ...currentSnapshot.bids.map((b) => b.quantity),
    ...currentSnapshot.asks.map((a) => a.quantity)
  );

  const tick = useCallback(() => {
    setCurrentIndex((prev) => {
      const next = prev + 1;
      if (next >= sequence.length) {
        setIsPlaying(false);
        return prev;
      }

      // Simulate a match (cross) occasionally
      if (Math.random() < 0.1) {
        setMatchedPrice(sequence[next].lastPrice);
        setTimeout(() => setMatchedPrice(null), 300);
      }

      return next;
    });
  }, [sequence]);

  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(tick, 1000 / speed);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isPlaying, speed, tick]);

  const handlePlayPause = () => {
    if (!isPlaying && currentIndex >= sequence.length - 1) {
      setCurrentIndex(0);
    }
    setIsPlaying(!isPlaying);
  };

  const handleStepForward = () => {
    if (currentIndex < sequence.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handleStepBack = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleReset = () => {
    setCurrentIndex(0);
    setIsPlaying(false);
  };

  return (
    <div className="bg-uora-surface border border-uora-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-uora-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-uora-cyan" />
          <h3 className="text-sm font-semibold">Market Replay Theatre</h3>
        </div>
        <div className="flex items-center gap-1">
          {SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              className={cn(
                "px-2 py-0.5 rounded text-[10px] font-mono transition-colors",
                speed === s
                  ? "bg-uora-cyan/20 text-uora-cyan border border-uora-cyan/30"
                  : "text-slate-500 hover:text-slate-300 hover:bg-uora-elevated"
              )}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>

      <div className="p-4">
        {/* Price Display */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <span className="text-[10px] text-slate-500 font-mono uppercase">
              Last Price
            </span>
            <div
              className={cn(
                "font-mono font-bold text-lg",
                currentSnapshot.lastSide === "buy"
                  ? "text-uora-success"
                  : "text-uora-error"
              )}
            >
              {currentSnapshot.lastPrice.toFixed(2)}
            </div>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-slate-500 font-mono uppercase">
              Step
            </span>
            <div className="font-mono text-sm text-slate-300">
              {currentIndex + 1} / {sequence.length}
            </div>
          </div>
        </div>

        {/* Orderbook */}
        <div className="bg-uora-bg rounded-lg border border-uora-border overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-3 gap-0 text-[10px] font-mono text-slate-500 px-3 py-1.5 border-b border-uora-border">
            <span>PRICE</span>
            <span className="text-right">QTY</span>
            <span className="text-right">ORDERS</span>
          </div>

          {/* Asks (reversed - lowest at bottom) */}
          <div className="max-h-40 overflow-hidden">
            {[...currentSnapshot.asks]
              .reverse()
              .map((ask, idx) => (
                <div
                  key={`ask-${idx}`}
                  className="grid grid-cols-3 gap-0 px-3 py-1 text-[11px] font-mono relative"
                >
                  <div
                    className="absolute inset-y-0 right-0 bg-uora-error/5"
                    style={{
                      width: `${(ask.quantity / maxQuantity) * 100}%`,
                    }}
                  />
                  <span className="text-uora-error relative z-10">
                    {ask.price.toFixed(2)}
                  </span>
                  <span className="text-right text-slate-400 relative z-10">
                    {ask.quantity}
                  </span>
                  <span className="text-right text-slate-500 relative z-10">
                    {ask.orders}
                  </span>
                </div>
              ))}
          </div>

          {/* Spread / Last Price */}
          <div className="relative px-3 py-2 border-y border-uora-border bg-uora-elevated/50">
            <AnimatePresence>
              {matchedPrice && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 flex items-center justify-center bg-uora-cyan/10 z-10"
                >
                  <Zap className="w-4 h-4 text-uora-cyan" />
                  <span className="text-uora-cyan font-mono font-bold text-xs ml-1">
                    MATCH @ {matchedPrice.toFixed(2)}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
            <div className="flex items-center justify-center gap-2">
              <div
                className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  currentSnapshot.lastSide === "buy"
                    ? "bg-uora-success"
                    : "bg-uora-error"
                )}
              />
              <span className="font-mono font-bold text-xs text-slate-200">
                {currentSnapshot.lastPrice.toFixed(2)}
              </span>
              <span className="text-[9px] text-slate-500 font-mono">
                SPREAD:{" "}
                {(
                  currentSnapshot.asks[0].price -
                  currentSnapshot.bids[0].price
                ).toFixed(4)}
              </span>
            </div>
          </div>

          {/* Bids */}
          <div className="max-h-40 overflow-hidden">
            {currentSnapshot.bids.map((bid, idx) => (
              <div
                key={`bid-${idx}`}
                className="grid grid-cols-3 gap-0 px-3 py-1 text-[11px] font-mono relative"
              >
                <div
                  className="absolute inset-y-0 right-0 bg-uora-success/5"
                  style={{
                    width: `${(bid.quantity / maxQuantity) * 100}%`,
                  }}
                />
                <span className="text-uora-success relative z-10">
                  {bid.price.toFixed(2)}
                </span>
                <span className="text-right text-slate-400 relative z-10">
                  {bid.quantity}
                </span>
                <span className="text-right text-slate-500 relative z-10">
                  {bid.orders}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Playback Controls */}
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            onClick={handleReset}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-uora-elevated transition-colors"
            title="Reset"
          >
            <SkipBack className="w-4 h-4" />
          </button>
          <button
            onClick={handleStepBack}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-uora-elevated transition-colors"
            title="Step back"
          >
            <SkipBack className="w-3.5 h-3.5" />
          </button>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handlePlayPause}
            className="p-3 rounded-xl bg-uora-cyan/10 border border-uora-cyan/20 text-uora-cyan hover:bg-uora-cyan/20 transition-colors"
          >
            {isPlaying ? (
              <Pause className="w-5 h-5" />
            ) : (
              <Play className="w-5 h-5 ml-0.5" />
            )}
          </motion.button>
          <button
            onClick={handleStepForward}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-uora-elevated transition-colors"
            title="Step forward"
          >
            <SkipForward className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setCurrentIndex(sequence.length - 1)}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-uora-elevated transition-colors"
            title="Go to end"
          >
            <SkipForward className="w-4 h-4" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="mt-2 h-1 bg-uora-elevated rounded-full overflow-hidden">
          <motion.div
            animate={{
              width: `${((currentIndex + 1) / sequence.length) * 100}%`,
            }}
            transition={{ duration: 0.1 }}
            className="h-full bg-gradient-to-r from-uora-cyan/60 to-uora-cyan rounded-full"
          />
        </div>
      </div>
    </div>
  );
}
