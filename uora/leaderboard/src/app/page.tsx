"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useInView } from "framer-motion";
// useInView import kept — still used by feature cards and arch layers below.
import {
  ArrowRight,
  Bot,
  CheckCircle,
  Code2,
  Cpu,
  GitBranch,
  Globe,
  LayoutDashboard,
  Lock,
  PlayCircle,
  Radio,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { StatusDot } from "@/components/ui/StatusDot";
import { useAuthStore } from "@/stores/useAuthStore";
import { DEMO_USER } from "@/lib/demoData";

// ─────────────────────────────────────────────────────────────────────────────
// Hero animated visualization: live latency telemetry
// Shows a continuously oscillating waveform of p50/p90/p99 timings plus
// floating metric pills. This is the single hero visual on the right.
// ─────────────────────────────────────────────────────────────────────────────

interface PulsePoint { t: number; p50: number; p90: number; p99: number; }

function generatePulse(prev: PulsePoint[] | null = null, count = 64): PulsePoint[] {
  // Realistic latency simulation around a healthy HFT baseline.
  const base = { p50: 0.18, p90: 0.31, p99: 0.52 };
  if (prev && prev.length === count) {
    const last = prev[prev.length - 1];
    const next: PulsePoint = {
      t: last.t + 1,
      p50: clamp(last.p50 + (Math.random() - 0.5) * 0.04, 0.10, 0.35),
      p90: clamp(last.p90 + (Math.random() - 0.5) * 0.06, 0.18, 0.55),
      p99: clamp(last.p99 + (Math.random() - 0.5) * 0.18, 0.30, 1.50),
    };
    return [...prev.slice(1), next];
  }
  // First (deterministic) paint matches SSR.
  return Array.from({ length: count }, (_, i) => ({
    t: i,
    p50: base.p50 + Math.sin(i * 0.32) * 0.04,
    p90: base.p90 + Math.sin(i * 0.27 + 1) * 0.05,
    p99: base.p99 + Math.sin(i * 0.21 + 2) * 0.10,
  }));
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function LatencyVisual() {
  const [points, setPoints] = useState<PulsePoint[]>(() => generatePulse(null));
  const [tps, setTps] = useState(1_240_000);
  const [correctness, setCorrectness] = useState(99.97);

  useEffect(() => {
    const tick = setInterval(() => {
      setPoints((prev) => generatePulse(prev));
      setTps(Math.floor(1_180_000 + Math.random() * 120_000));
      setCorrectness(parseFloat((99.92 + Math.random() * 0.07).toFixed(2)));
    }, 380);
    return () => clearInterval(tick);
  }, []);

  const path = useMemo(() => buildPath(points, (p) => p.p99, 320, 100), [points]);
  const path90 = useMemo(() => buildPath(points, (p) => p.p90, 320, 100), [points]);
  const path50 = useMemo(() => buildPath(points, (p) => p.p50, 320, 100), [points]);

  const current = points[points.length - 1];

  return (
    <div className="relative">
      {/* Glow halo behind the panel */}
      <div
        aria-hidden
        className="absolute -inset-10 pointer-events-none opacity-60"
        style={{
          background:
            "radial-gradient(ellipse 50% 50% at 50% 50%, rgba(0,212,255,0.18) 0%, transparent 70%)",
        }}
      />

      {/* Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        className="relative rounded-xl border border-[rgba(0,212,255,0.15)] bg-[rgba(7,17,31,0.85)] backdrop-blur-sm overflow-hidden shadow-[0_0_60px_rgba(0,212,255,0.08)]"
      >
        {/* Top status bar */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[rgba(0,212,255,0.08)]">
          <div className="flex items-center gap-2.5">
            <span className="relative flex w-2 h-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-[var(--bid)] opacity-60 animate-ping" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--bid)]" />
            </span>
            <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-300)]">
              Latency Stream · Live
            </span>
          </div>
          <span className="text-[10px] font-mono text-[var(--ink-500)] tracking-wider">
            UORA-REF · BTC/USD
          </span>
        </div>

        {/* Big metric */}
        <div className="px-5 pt-5 pb-2 flex items-baseline gap-4">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-500)] mb-1">
              p99 Latency
            </div>
            <motion.div
              key={Math.floor(current.p99 * 100)}
              initial={{ opacity: 0.4 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
              className="text-4xl font-mono font-bold tabnum text-[var(--plasma)] leading-none"
              style={{ textShadow: "0 0 24px rgba(0,212,255,0.4)" }}
            >
              {current.p99.toFixed(2)}
              <span className="text-base text-[var(--ink-400)] font-normal ml-1">ms</span>
            </motion.div>
          </div>
          <div className="flex gap-4 pl-4 ml-auto">
            <div>
              <div className="text-[9px] font-mono uppercase tracking-wider text-[var(--ink-500)]">p50</div>
              <div className="text-sm font-mono font-bold tabnum text-[var(--ink-200)]">
                {current.p50.toFixed(2)}
                <span className="text-[10px] text-[var(--ink-400)] ml-0.5">ms</span>
              </div>
            </div>
            <div>
              <div className="text-[9px] font-mono uppercase tracking-wider text-[var(--ink-500)]">p90</div>
              <div className="text-sm font-mono font-bold tabnum text-[var(--ink-200)]">
                {current.p90.toFixed(2)}
                <span className="text-[10px] text-[var(--ink-400)] ml-0.5">ms</span>
              </div>
            </div>
          </div>
        </div>

        {/* Waveform */}
        <div className="px-2 pt-2">
          <svg viewBox="0 0 320 100" className="w-full h-32" preserveAspectRatio="none">
            {/* Grid lines */}
            {[25, 50, 75].map((y) => (
              <line
                key={y}
                x1="0"
                y1={y}
                x2="320"
                y2={y}
                stroke="rgba(255,255,255,0.04)"
                strokeWidth="1"
                strokeDasharray="2,4"
              />
            ))}
            {/* p99 area fill */}
            <defs>
              <linearGradient id="p99Fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(0,212,255,0.30)" />
                <stop offset="100%" stopColor="rgba(0,212,255,0)" />
              </linearGradient>
            </defs>
            <path d={`${path} L320,100 L0,100 Z`} fill="url(#p99Fill)" />
            {/* p50/p90/p99 lines */}
            <path d={path50} fill="none" stroke="rgba(22,199,132,0.55)" strokeWidth="1.2" />
            <path d={path90} fill="none" stroke="rgba(240,185,11,0.65)" strokeWidth="1.2" />
            <path d={path} fill="none" stroke="rgba(0,212,255,1)" strokeWidth="1.8"
              style={{ filter: "drop-shadow(0 0 4px rgba(0,212,255,0.5))" }} />
          </svg>
        </div>

        {/* Bottom KPI strip */}
        <div className="grid grid-cols-3 border-t border-[rgba(0,212,255,0.08)]">
          <KpiCell label="Throughput" value={formatTps(tps)} unit="orders/s" color="var(--ink-100)" />
          <KpiCell label="Correctness" value={`${correctness.toFixed(2)}`} unit="%" color="var(--bid)" />
          <KpiCell label="Anomaly" value="0.012" unit="score" color="var(--ink-100)" lastCell />
        </div>
      </motion.div>

      {/* Floating particle pills around the panel */}
      <FloatingChip text="GED PASS" delay={0} top="-3%" left="-6%" />
      <FloatingChip text="SCORED" delay={0.8} top="42%" right="-8%" />
      <FloatingChip text="L1 → L4 OK" delay={1.6} bottom="-4%" left="20%" />
    </div>
  );
}

function buildPath(points: PulsePoint[], pick: (p: PulsePoint) => number, w: number, h: number) {
  if (points.length === 0) return "";
  // y-axis: 0..1.5 ms → invert
  const dx = w / (points.length - 1);
  return points
    .map((p, i) => {
      const x = i * dx;
      const v = clamp(pick(p), 0, 1.5);
      const y = h - (v / 1.5) * (h - 8) - 4;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function formatTps(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return `${n}`;
}

function KpiCell({
  label,
  value,
  unit,
  color,
  lastCell = false,
}: {
  label: string;
  value: string;
  unit: string;
  color: string;
  lastCell?: boolean;
}) {
  return (
    <div className={`px-4 py-3 ${lastCell ? "" : "border-r border-[rgba(0,212,255,0.08)]"}`}>
      <div className="text-[9px] font-mono uppercase tracking-wider text-[var(--ink-500)]">
        {label}
      </div>
      <div className="text-base font-mono font-bold tabnum mt-0.5" style={{ color }}>
        {value}
        <span className="text-[10px] font-normal text-[var(--ink-400)] ml-1">{unit}</span>
      </div>
    </div>
  );
}

interface FloatingChipProps {
  text: string;
  delay: number;
  top?: string;
  left?: string;
  right?: string;
  bottom?: string;
}

function FloatingChip({ text, delay, top, left, right, bottom }: FloatingChipProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: [0, 1, 1, 0.6, 1], y: [6, 0, -3, 2, 0] }}
      transition={{
        duration: 6,
        repeat: Infinity,
        delay,
        ease: "easeInOut",
      }}
      className="absolute z-20 pointer-events-none px-2.5 py-1 rounded-full border border-[rgba(0,212,255,0.2)] bg-[rgba(7,17,31,0.95)] backdrop-blur-sm text-[9px] font-mono uppercase tracking-wider text-[var(--plasma)] shadow-[0_0_16px_rgba(0,212,255,0.2)]"
      style={{ top, left, right, bottom }}
    >
      {text}
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Pipeline animation (full-width section below the hero)
// ─────────────────────────────────────────────────────────────────────────────

const PIPELINE_STAGES = [
  { id: "upload",    label: "Upload",     sub: "Source accepted, hash recorded" },
  { id: "build",     label: "Build",      sub: "Sandboxed compile, static link" },
  { id: "deploy",    label: "Deploy",     sub: "Network-isolated container" },
  { id: "benchmark", label: "Benchmark",  sub: "Async bot fleet, LOBSTER replay" },
  { id: "validate",  label: "Validate",   sub: "L1–L4 correctness, GED diff" },
  { id: "score",     label: "Score",      sub: "Composite + ML anomaly check" },
];

function PipelineStrip() {
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });

  useEffect(() => {
    const interval = setInterval(() => {
      setActive((prev) => (prev + 1) % PIPELINE_STAGES.length);
    }, 1500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div ref={ref} className="relative">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3"
      >
        {PIPELINE_STAGES.map((stage, i) => {
          const isActive = i === active;
          const isDone = i < active;
          return (
            <motion.div
              key={stage.id}
              animate={{
                borderColor: isActive
                  ? "rgba(0,212,255,0.5)"
                  : isDone
                  ? "rgba(22,199,132,0.3)"
                  : "rgba(255,255,255,0.06)",
                backgroundColor: isActive
                  ? "rgba(0,212,255,0.06)"
                  : isDone
                  ? "rgba(22,199,132,0.03)"
                  : "rgba(7,17,31,0.4)",
                boxShadow: isActive
                  ? "0 0 24px rgba(0,212,255,0.18)"
                  : "0 0 0px rgba(0,0,0,0)",
              }}
              transition={{ duration: 0.4 }}
              className="rounded-lg border p-4 backdrop-blur-sm"
            >
              <div className="flex items-center justify-between mb-2">
                <span
                  className="text-[10px] font-mono uppercase tracking-wider"
                  style={{
                    color: isActive
                      ? "var(--plasma)"
                      : isDone
                      ? "var(--bid)"
                      : "var(--ink-500)",
                  }}
                >
                  {String(i + 1).padStart(2, "0")} · {stage.label}
                </span>
                {isActive && (
                  <motion.span
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1.2, repeat: Infinity }}
                    className="w-1.5 h-1.5 rounded-full bg-[var(--plasma)]"
                  />
                )}
                {isDone && (
                  <CheckCircle className="w-3 h-3 text-[var(--bid)]" />
                )}
              </div>
              <div className="text-[11px] font-mono text-[var(--ink-300)] leading-snug">
                {stage.sub}
              </div>
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Feature cards
// ─────────────────────────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: Lock,
    title: "Hardened Sandbox",
    desc: "Every submission compiles and runs inside a network-isolated gVisor container with a deny-by-default seccomp policy. No host escape, no lateral movement.",
    color: "plasma",
  },
  {
    icon: Bot,
    title: "Distributed Bot Fleet",
    desc: "An async fleet replays deterministic LOBSTER tape against your engine across REST and FIX, applying chaos events to surface real failure modes.",
    color: "bid",
  },
  {
    icon: Radio,
    title: "Nanosecond Telemetry",
    desc: "Envoy timestamps every order at the proxy edge; metrics land in TimescaleDB and stream to the leaderboard via Redis Pub/Sub in real time.",
    color: "plasma",
  },
  {
    icon: LayoutDashboard,
    title: "Live Leaderboard",
    desc: "SSE pushes rank changes the moment a benchmark scores. The composite formula rewards throughput and correctness while punishing tail latency.",
    color: "bid",
  },
];

function FeatureCard({
  icon: Icon,
  title,
  desc,
  color,
  index,
}: (typeof FEATURES)[0] & { index: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const c = color === "plasma" ? "var(--plasma)" : "var(--bid)";

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.08 }}
      whileHover={{ y: -3, transition: { duration: 0.2 } }}
      className="glass rounded-lg p-5 flex flex-col gap-3 group hover:border-[rgba(0,212,255,0.2)] transition-colors"
    >
      <div
        className="w-9 h-9 rounded flex items-center justify-center flex-shrink-0"
        style={{ background: `${c}15`, border: `1px solid ${c}25` }}
      >
        <Icon className="w-4 h-4" style={{ color: c }} />
      </div>
      <div>
        <h3 className="text-sm font-semibold text-[var(--ink-100)] mb-1">{title}</h3>
        <p className="text-xs text-[var(--ink-400)] leading-relaxed">{desc}</p>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Architecture section
// ─────────────────────────────────────────────────────────────────────────────

const ARCH_LAYERS = [
  {
    layer: "Submission & Sandbox",
    components: ["FastAPI", "BuildKit", "gVisor", "seccomp-bpf", "MinIO"],
    color: "plasma",
  },
  {
    layer: "Benchmark & Validation",
    components: ["Async Bot Fleet", "Reference LOB", "GED Engine", "LOBSTER Replay"],
    color: "bid",
  },
  {
    layer: "Telemetry & Scoring",
    components: ["Envoy Proxy", "TimescaleDB", "Isolation Forest", "PDF Reports"],
    color: "amber",
  },
  {
    layer: "Leaderboard & UI",
    components: ["Next.js 16", "Redis Pub/Sub", "SSE Stream", "ECharts"],
    color: "plasma",
  },
];

const colorToken: Record<string, string> = {
  plasma: "var(--plasma)",
  bid:    "var(--bid)",
  amber:  "#F0B90B",
};

function ArchLayer({
  layer,
  components,
  color,
  index,
}: (typeof ARCH_LAYERS)[0] & { index: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const c = colorToken[color];

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.45, delay: index * 0.1 }}
      className="flex items-start gap-4"
    >
      <div
        className="flex-shrink-0 w-1 self-stretch rounded-full"
        style={{ background: `linear-gradient(to bottom, ${c}, ${c}30)` }}
      />
      <div className="flex-1 pb-6">
        <div className="text-xs font-mono font-semibold text-[var(--ink-200)] mb-2">{layer}</div>
        <div className="flex flex-wrap gap-1.5">
          {components.map((comp) => (
            <span
              key={comp}
              className="px-2 py-0.5 rounded text-[10px] font-mono"
              style={{
                background: `${c}0D`,
                border: `1px solid ${c}20`,
                color: c,
              }}
            >
              {comp}
            </span>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Ticker
// ─────────────────────────────────────────────────────────────────────────────

const TICKER_ITEMS = [
  "p99 latency · 0.52ms",
  "throughput · 1.24M orders/sec",
  "correctness · 99.97%",
  "sandbox · gVisor + seccomp",
  "bot fleet · 10k async clients",
  "tape · deterministic LOBSTER replay",
  "score · throughput × correctness ÷ p99²",
  "validation · L1 priority · L2 lifecycle · L3 invariants · L4 GED",
];

function StatsTicker() {
  const doubled = [...TICKER_ITEMS, ...TICKER_ITEMS];
  return (
    <div className="overflow-hidden border-y border-[rgba(0,212,255,0.06)] py-2.5 bg-[var(--void-900)]">
      <motion.div
        animate={{ x: ["0%", "-50%"] }}
        transition={{ duration: 35, repeat: Infinity, ease: "linear" }}
        className="flex gap-8 whitespace-nowrap"
      >
        {doubled.map((item, i) => (
          <span key={i} className="flex items-center gap-2 text-[10px] font-mono text-[var(--ink-500)] uppercase tracking-wider">
            <span className="w-1 h-1 rounded-full bg-[var(--plasma)] flex-shrink-0" />
            {item}
          </span>
        ))}
      </motion.div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const heroRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const login = useAuthStore((s) => s.login);

  const handleDemo = () => {
    login(DEMO_USER, true);
    router.push("/dashboard");
  };

  return (
    <div className="min-h-screen bg-[var(--void-950)] text-[var(--ink-200)]">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-[rgba(255,255,255,0.05)] bg-[rgba(1,5,9,0.9)] backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-14 items-center justify-between">
            <Logo size="sm" />
            <div className="flex items-center gap-3">
              <StatusDot status="live" label="Platform online" />
              <Link href="/auth" className="btn-plasma text-xs px-4 py-2">
                Launch Console
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section
        ref={heroRef}
        className="relative pt-14 pb-20 flex flex-col overflow-hidden"
      >
        {/* Background layers */}
        <div className="absolute inset-0 bg-grid-plasma pointer-events-none" />
        <div className="absolute inset-0 plasma-glow-bg pointer-events-none" />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 70% 60% at 50% 10%, rgba(0,212,255,0.05) 0%, transparent 60%)",
          }}
        />

        <div className="relative z-10 mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 pt-16 pb-8">
          {/* 2-column hero */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-6">
              {/* Eyebrow */}
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="flex items-center gap-3 mb-6"
              >
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-[rgba(0,212,255,0.2)] bg-[rgba(0,212,255,0.05)] text-[10px] font-mono text-[var(--plasma)] tracking-wider uppercase">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--plasma)] animate-pulse" />
                  Matching Engine Benchmarks · Continuous Integration for HFT
                </span>
              </motion.div>

              {/* Headline */}
              <motion.h1
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.1 }}
                className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight text-[var(--ink-0)] leading-[1.05] mb-5"
              >
                Prove your{" "}
                <span
                  className="font-mono"
                  style={{
                    backgroundImage: "linear-gradient(135deg, #00D4FF 0%, #00AACC 100%)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                  }}
                >
                  matching engine
                </span>{" "}
                at microsecond scale.
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="text-sm sm:text-base text-[var(--ink-300)] mb-7 leading-relaxed max-w-xl"
              >
                Upload an order-matching engine. UORA isolates it in a hardened
                sandbox, replays deterministic LOBSTER market data through a
                distributed bot fleet, and streams nanosecond-grade telemetry
                to a ranked leaderboard — every benchmark, every commit.
              </motion.p>

              {/* CTA */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, delay: 0.3 }}
                className="flex flex-wrap items-center gap-3 mb-8"
              >
                <Link href="/auth" className="btn-plasma text-sm">
                  Submit Your Engine
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <button onClick={handleDemo} className="btn-ghost text-sm gap-2">
                  <PlayCircle className="w-4 h-4" />
                  View a Sample Run
                </button>
              </motion.div>

              {/* Inline mini stats */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.5 }}
                className="grid grid-cols-3 max-w-md gap-4 pt-6 border-t border-[rgba(255,255,255,0.06)]"
              >
                {[
                  { value: "0.52", unit: "ms", label: "p99 reference" },
                  { value: "1.24M", unit: "TPS", label: "peak throughput" },
                  { value: "99.97", unit: "%", label: "correctness" },
                ].map((s) => (
                  <div key={s.label}>
                    <div className="text-xl font-mono font-bold tabnum text-[var(--ink-100)] leading-none">
                      {s.value}
                      <span className="text-[10px] text-[var(--ink-400)] font-normal ml-0.5">
                        {s.unit}
                      </span>
                    </div>
                    <div className="text-[10px] font-mono text-[var(--ink-500)] uppercase tracking-wider mt-1.5">
                      {s.label}
                    </div>
                  </div>
                ))}
              </motion.div>
            </div>

            {/* Animated visual on the right */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.7, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="lg:col-span-6"
            >
              <LatencyVisual />
            </motion.div>
          </div>
        </div>
      </section>

      {/* Ticker */}
      <StatsTicker />

      {/* Pipeline strip */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-10 max-w-2xl">
            <div className="label-mono mb-3 text-[var(--plasma)]">Pipeline</div>
            <h2 className="text-2xl sm:text-3xl font-bold text-[var(--ink-100)] tracking-tight mb-3">
              Six stages, from source upload to ranked score.
            </h2>
            <p className="text-sm text-[var(--ink-400)] leading-relaxed">
              Every submission moves deterministically through the same six
              stages. Each transition is logged, validated, and observable in
              the console.
            </p>
          </div>
          <PipelineStrip />
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-[var(--void-900)]">
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 max-w-2xl">
            <div className="label-mono mb-3 text-[var(--plasma)]">Platform</div>
            <h2 className="text-2xl sm:text-3xl font-bold text-[var(--ink-100)] tracking-tight mb-3">
              Built for the realities of HFT testing.
            </h2>
            <p className="text-sm text-[var(--ink-400)] leading-relaxed">
              Untrusted code runs in production-grade isolation. Benchmarks are
              reproducible. Results are streamed live, not batched.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {FEATURES.map((f, i) => (
              <FeatureCard key={f.title} {...f} index={i} />
            ))}
          </div>
        </div>
      </section>

      {/* Architecture */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
            <div>
              <div className="label-mono mb-3 text-[var(--plasma)]">System Design</div>
              <h2 className="text-2xl sm:text-3xl font-bold text-[var(--ink-100)] tracking-tight mb-4">
                Four decoupled layers, communicating only by stream and pub/sub.
              </h2>
              <p className="text-sm text-[var(--ink-400)] leading-relaxed mb-6">
                Each layer can be scaled, replaced, or replayed independently.
                Submissions move through Redis Streams; metrics and rank events
                fan out through Pub/Sub. No layer holds in-memory state another
                layer depends on.
              </p>
              <div className="flex flex-wrap gap-3">
                {[
                  { icon: Globe, label: "Kubernetes-ready" },
                  { icon: GitBranch, label: "Terraform-managed" },
                  { icon: Cpu, label: "CPU-pinned sandboxes" },
                  { icon: Zap, label: "Sub-millisecond p99" },
                  { icon: ShieldCheck, label: "gVisor isolation" },
                  { icon: Code2, label: "C++ · Rust · Go · Python" },
                  { icon: CheckCircle, label: "Graph-edit-distance validation" },
                ].map(({ icon: Icon, label }) => (
                  <span
                    key={label}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded glass text-[11px] font-mono text-[var(--ink-300)]"
                  >
                    <Icon className="w-3 h-3 text-[var(--plasma)] opacity-70" />
                    {label}
                  </span>
                ))}
              </div>
            </div>
            <div>
              {ARCH_LAYERS.map((l, i) => (
                <ArchLayer key={l.layer} {...l} index={i} />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative py-24 px-4 sm:px-6 lg:px-8 overflow-hidden bg-[var(--void-900)]">
        <div className="absolute inset-0 bg-grid-faint pointer-events-none" />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 60% 60% at 50% 50%, rgba(0,212,255,0.05) 0%, transparent 70%)",
          }}
        />
        <div className="relative z-10 mx-auto max-w-3xl text-center">
          <div className="label-mono mb-4 text-[var(--plasma)]">Get started</div>
          <h2 className="text-3xl sm:text-4xl font-black text-[var(--ink-0)] tracking-tight mb-4">
            Run your first benchmark in two minutes.
          </h2>
          <p className="text-sm text-[var(--ink-400)] mb-8 max-w-lg mx-auto leading-relaxed">
            Drop a C++, Rust, Go, or Python source file into the console. The
            pipeline takes it from compile to scored leaderboard entry without
            you doing anything else.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link href="/auth" className="btn-plasma text-sm px-8 py-3">
              Launch the Console
              <ArrowRight className="w-4 h-4" />
            </Link>
            <button onClick={handleDemo} className="btn-ghost text-sm px-8 py-3 gap-2">
              <PlayCircle className="w-4 h-4" />
              View a Sample Run
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[rgba(255,255,255,0.05)] py-8 px-4 sm:px-6">
        <div className="mx-auto max-w-7xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <Logo size="xs" />
          <div className="text-[10px] font-mono text-[var(--ink-500)] uppercase tracking-wider">
            Unified Orderbook Resilience Architecture
          </div>
        </div>
      </footer>
    </div>
  );
}
