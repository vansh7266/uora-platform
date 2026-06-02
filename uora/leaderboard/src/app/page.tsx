"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { motion, useInView } from "framer-motion";
import {
  ArrowRight,
  Bot,
  CheckCircle,
  ChevronRight,
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

// ── Animated orderbook (left side of hero) ────────────────────────────────────

type Level = { price: number; size: number; total: number };

// `deterministic` produces a stable first paint so server and client HTML match
// (avoids a React hydration mismatch). After mount we re-randomize on an interval.
function generateBook(side: "bid" | "ask", midprice: number, deterministic = false): Level[] {
  const levels: Level[] = [];
  let total = 0;
  const sign = side === "bid" ? -1 : 1;
  for (let i = 0; i < 8; i++) {
    const tick = (i + 1) * 0.25;
    const price = midprice + sign * tick;
    const size = deterministic
      ? 200 + i * 55 // stable seed, identical on server + client
      : Math.floor(Math.random() * 600 + 100);
    total += size;
    levels.push({ price: parseFloat(price.toFixed(2)), size, total });
  }
  return side === "bid" ? levels : levels.reverse();
}

function LiveOrderbook() {
  const [midprice] = useState(18_432.5);
  // First paint is deterministic (matches SSR); randomized after mount.
  const [bids, setBids] = useState<Level[]>(() => generateBook("bid", 18_432.5, true));
  const [asks, setAsks] = useState<Level[]>(() => generateBook("ask", 18_432.5, true));
  const [lastTrade, setLastTrade] = useState<{ price: number; side: "bid" | "ask" }>({
    price: 18_432.5,
    side: "bid",
  });
  const [botStats, setBotStats] = useState<{ bots: number; ops: number }>({
    bots: 96,
    ops: 912,
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setBids(generateBook("bid", midprice));
      setAsks(generateBook("ask", midprice));
      const newPrice = midprice + (Math.random() - 0.5) * 2;
      setLastTrade({
        price: parseFloat(newPrice.toFixed(2)),
        side: Math.random() > 0.5 ? "bid" : "ask",
      });
      setBotStats({
        bots: Math.floor(Math.random() * 40 + 80),
        ops: Math.floor(Math.random() * 200 + 800),
      });
    }, 800);
    return () => clearInterval(interval);
  }, [midprice]);

  const maxTotal = Math.max(
    ...[...bids, ...asks].map((l) => l.total),
    1
  );

  const Row = ({
    level,
    side,
    maxT,
  }: {
    level: Level;
    side: "bid" | "ask";
    maxT: number;
  }) => {
    const pct = (level.total / maxT) * 100;
    const isBid = side === "bid";
    return (
      <motion.div
        key={`${level.price}`}
        layout
        className="relative flex items-center gap-2 px-3 py-[3px] font-mono text-[11px] hover:bg-[rgba(255,255,255,0.03)] transition-colors"
      >
        {/* Depth bar */}
        <div
          className={`absolute inset-y-0 ${isBid ? "right-0" : "left-0"} transition-all duration-500`}
          style={{
            width: `${pct}%`,
            background: isBid
              ? "rgba(22,199,132,0.08)"
              : "rgba(234,57,67,0.08)",
          }}
        />
        <span className="relative flex-1 tabnum text-right text-[var(--ink-400)] text-[10px]">
          {level.size.toLocaleString()}
        </span>
        <span
          className={`relative w-20 text-center font-semibold tabnum ${
            isBid ? "text-[var(--bid)]" : "text-[var(--ask)]"
          }`}
        >
          {level.price.toFixed(2)}
        </span>
        <span className="relative flex-1 tabnum text-[var(--ink-400)] text-[10px]">
          {level.size.toLocaleString()}
        </span>
      </motion.div>
    );
  };

  return (
    <div className="relative rounded-md overflow-hidden border border-[rgba(0,212,255,0.1)] bg-[var(--void-800)]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[rgba(0,212,255,0.07)]">
        <div className="flex items-center gap-2">
          <StatusDot status="live" label="LIVE" />
        </div>
        <span className="text-[10px] font-mono text-[var(--ink-400)] tracking-wider">ORDER BOOK · BTC/USD</span>
        <span className="text-[10px] font-mono text-[var(--ink-500)]">L2</span>
      </div>

      {/* Column headers */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[rgba(255,255,255,0.03)]">
        <span className="flex-1 text-right text-[9px] font-mono text-[var(--ink-500)] uppercase tracking-wider">Size</span>
        <span className="w-20 text-center text-[9px] font-mono text-[var(--ink-500)] uppercase tracking-wider">Price</span>
        <span className="flex-1 text-[9px] font-mono text-[var(--ink-500)] uppercase tracking-wider">Size</span>
      </div>

      {/* Asks (reversed so best ask is closest to mid) */}
      <div className="flex flex-col">
        {asks.map((level) => (
          <Row key={`ask-${level.price}`} level={level} side="ask" maxT={maxTotal} />
        ))}
      </div>

      {/* Spread / Last trade */}
      <div className="flex items-center justify-center gap-3 py-2 border-y border-[rgba(0,212,255,0.06)] bg-[var(--void-900)]">
        <span
          className={`text-base font-mono font-bold tabnum ${
            lastTrade.side === "bid" ? "text-[var(--bid)]" : "text-[var(--ask)]"
          }`}
        >
          {lastTrade.price.toFixed(2)}
        </span>
        <span className="text-[9px] font-mono text-[var(--ink-500)] uppercase">
          SPREAD: 0.25
        </span>
      </div>

      {/* Bids */}
      <div className="flex flex-col">
        {bids.map((level) => (
          <Row key={`bid-${level.price}`} level={level} side="bid" maxT={maxTotal} />
        ))}
      </div>

      {/* Bot activity strip */}
      <div className="px-3 py-2 border-t border-[rgba(0,212,255,0.07)] flex items-center gap-2">
        <Bot className="w-3 h-3 text-[var(--plasma)]" />
        <span className="text-[9px] font-mono text-[var(--ink-400)]">
          {botStats.bots} bots active · {botStats.ops.toLocaleString()} orders/s
        </span>
      </div>
    </div>
  );
}

// ── Pipeline animation (right side of hero) ───────────────────────────────────

const PIPELINE_STAGES = [
  { id: "upload",    label: "Upload",     sub: "Source code accepted",          icon: "↑", color: "plasma" },
  { id: "build",     label: "Build",      sub: "gVisor sandbox compile",         icon: "⚙", color: "amber" },
  { id: "deploy",    label: "Deploy",     sub: "Container isolation enforced",   icon: "⬡", color: "plasma" },
  { id: "benchmark", label: "Benchmark",  sub: "10k bots · LOBSTER replay",      icon: "⚡", color: "bid" },
  { id: "validate",  label: "Validate",   sub: "Price-time priority + GED",      icon: "✓", color: "bid" },
  { id: "score",     label: "Score",      sub: "Composite + ML anomaly",         icon: "★", color: "plasma" },
];

const colorToken: Record<string, string> = {
  plasma: "var(--plasma)",
  bid:    "var(--bid)",
  amber:  "#F0B90B",
};

function PipelineAnimation() {
  const [active, setActive] = useState(0);
  const [completed, setCompleted] = useState<Set<number>>(new Set());

  useEffect(() => {
    const interval = setInterval(() => {
      setActive((prev) => {
        const next = (prev + 1) % PIPELINE_STAGES.length;
        if (next === 0) setCompleted(new Set());
        else setCompleted((c) => new Set([...c, prev]));
        return next;
      });
    }, 1400);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative rounded-md overflow-hidden border border-[rgba(0,212,255,0.1)] bg-[var(--void-800)] p-4">
      <div className="label-mono mb-4">Benchmark Pipeline</div>

      <div className="flex flex-col gap-0">
        {PIPELINE_STAGES.map((stage, i) => {
          const isActive = active === i;
          const isDone = completed.has(i);
          const color = colorToken[stage.color];

          return (
            <div key={stage.id} className="flex items-stretch gap-3">
              {/* Connector line */}
              <div className="flex flex-col items-center w-6 flex-shrink-0">
                <motion.div
                  animate={{
                    backgroundColor: isActive ? color : isDone ? colorToken.bid : "rgba(255,255,255,0.06)",
                    boxShadow: isActive ? `0 0 8px ${color}` : "none",
                  }}
                  transition={{ duration: 0.3 }}
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-mono font-bold flex-shrink-0"
                  style={{ color: isActive || isDone ? "#000" : "var(--ink-500)" }}
                >
                  {isDone ? "✓" : stage.icon}
                </motion.div>
                {i < PIPELINE_STAGES.length - 1 && (
                  <motion.div
                    animate={{
                      backgroundColor: isDone ? colorToken.bid : "rgba(255,255,255,0.05)",
                    }}
                    transition={{ duration: 0.4 }}
                    className="w-[1px] flex-1 my-0.5"
                  />
                )}
              </div>

              {/* Stage info */}
              <div className="pb-3 flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className="text-xs font-mono font-semibold"
                    style={{ color: isActive ? color : isDone ? colorToken.bid : "var(--ink-300)" }}
                  >
                    {stage.label}
                  </span>
                  {isActive && (
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: [0, 1, 0] }}
                      transition={{ duration: 1, repeat: Infinity }}
                      className="text-[9px] font-mono tracking-wider"
                      style={{ color }}
                    >
                      RUNNING
                    </motion.span>
                  )}
                </div>
                <p className="text-[10px] text-[var(--ink-500)] font-mono mt-0.5 truncate">
                  {stage.sub}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Score reveal at end */}
      <motion.div
        animate={{
          opacity: active === PIPELINE_STAGES.length - 1 ? 1 : 0.3,
          scale: active === PIPELINE_STAGES.length - 1 ? 1 : 0.97,
        }}
        className="mt-2 p-3 rounded bg-[var(--void-900)] border border-[rgba(0,212,255,0.08)] flex items-center justify-between"
      >
        <span className="text-[10px] font-mono text-[var(--ink-400)]">COMPOSITE SCORE</span>
        <span className="text-lg font-mono font-bold text-[var(--plasma)] tabnum">
          {active === PIPELINE_STAGES.length - 1 ? "94.7" : "—"}
        </span>
      </motion.div>
    </div>
  );
}

// ── Feature cards ─────────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: Lock,
    title: "Secure Sandboxing",
    desc: "gVisor runtime + seccomp-bpf deny-by-default. Every submission runs in a sealed container with CPU and memory constraints. Zero host escape.",
    color: "plasma",
  },
  {
    icon: Bot,
    title: "Distributed Bot Fleet",
    desc: "Asyncio-powered fleet replaying deterministic LOBSTER order flow. Thousands of concurrent bots. FIX + REST protocol support.",
    color: "bid",
  },
  {
    icon: Radio,
    title: "Real-Time Telemetry",
    desc: "Envoy ingests every tick into TimescaleDB. p50/p90/p99 latency, max TPS, correctness rate — all streamed live via Redis Pub/Sub.",
    color: "plasma",
  },
  {
    icon: LayoutDashboard,
    title: "Live Leaderboard",
    desc: "Server-Sent Events push rank updates to the dashboard the moment a benchmark completes. Composite score = throughput × correctness / latency².",
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
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, delay: index * 0.08 }}
      className="glass rounded-md p-5 flex flex-col gap-3 group hover:border-[rgba(0,212,255,0.2)] transition-colors"
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

// ── Architecture section ──────────────────────────────────────────────────────

const ARCH_LAYERS = [
  {
    layer: "Submission & Sandbox",
    components: ["FastAPI", "BuildKit", "gVisor", "seccomp-bpf", "MinIO"],
    color: "plasma",
  },
  {
    layer: "Benchmark & Validation",
    components: ["Bot Fleet", "Reference LOB", "GED Engine", "LOBSTER Replay"],
    color: "bid",
  },
  {
    layer: "Telemetry & Scoring",
    components: ["Envoy Proxy", "TimescaleDB", "Isolation Forest", "PDF Scorer"],
    color: "amber",
  },
  {
    layer: "Leaderboard & UI",
    components: ["Next.js 15", "Redis Pub/Sub", "SSE Stream", "ECharts"],
    color: "plasma",
  },
];

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
      animate={inView ? { opacity: 1, x: 0 } : {}}
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

// ── Stats ticker ──────────────────────────────────────────────────────────────

const TICKER_ITEMS = [
  "p99 latency · 0.52ms",
  "throughput · 1.24M TPS",
  "correctness · 99.97%",
  "sandbox isolation · gVisor + seccomp",
  "bot fleet · async 10k concurrent",
  "LOBSTER replay · deterministic",
  "scoring formula · (TPS × correctness) / p99²",
  "validation levels · L1 → L4",
];

function StatsTicker() {
  const doubled = [...TICKER_ITEMS, ...TICKER_ITEMS];
  return (
    <div className="overflow-hidden border-y border-[rgba(0,212,255,0.06)] py-2.5 bg-[var(--void-900)]">
      <motion.div
        animate={{ x: ["0%", "-50%"] }}
        transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
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

// ── Main page ─────────────────────────────────────────────────────────────────

export default function HomePage() {
  const heroRef = useRef<HTMLDivElement>(null);
  const inView = useInView(heroRef, { once: true });
  const router = useRouter();
  const login = useAuthStore((s) => s.login);

  const handleDemo = () => {
    // One-click into the simulated demo workspace. The real console is /auth.
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
              <div className="hidden sm:flex items-center gap-1 text-[10px] font-mono text-[var(--ink-500)] border-l border-[rgba(255,255,255,0.06)] pl-3">
                <span>IICPC</span>
                <ChevronRight className="w-3 h-3" />
                <span>2026</span>
              </div>
              <Link
                href="/auth"
                className="btn-plasma text-xs px-4 py-2"
              >
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
        className="relative min-h-screen pt-14 flex flex-col overflow-hidden"
      >
        {/* Background */}
        <div className="absolute inset-0 bg-grid-plasma pointer-events-none" />
        <div className="absolute inset-0 plasma-glow-bg pointer-events-none" />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 70% 60% at 50% 10%, rgba(0,212,255,0.05) 0%, transparent 60%)",
          }}
        />

        <div className="relative z-10 mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 pt-16 pb-12 flex-1 flex flex-col">
          {/* Eyebrow */}
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5 }}
            className="flex items-center gap-3 mb-6"
          >
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-[rgba(0,212,255,0.2)] bg-[rgba(0,212,255,0.05)] text-[10px] font-mono text-[var(--plasma)] tracking-wider uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--plasma)] animate-pulse" />
              IICPC Summer Hackathon 2026
            </span>
          </motion.div>

          {/* Headline */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="max-w-4xl mb-4"
          >
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight text-[var(--ink-0)] leading-[1.08]">
              Benchmark Your{" "}
              <span
                className="font-mono"
                style={{
                  backgroundImage: "linear-gradient(135deg, #00D4FF 0%, #00AACC 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                Matching Engine
              </span>
              <br />
              at Microsecond Scale
            </h1>
          </motion.div>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-sm sm:text-base text-[var(--ink-300)] max-w-2xl mb-8 leading-relaxed"
          >
            Upload your trading infrastructure. UORA containerizes it inside a gVisor
            sandbox, bombards it with a distributed fleet of bots replaying real LOBSTER
            order flow, and streams live latency + correctness telemetry to a ranked
            leaderboard.
          </motion.p>

          {/* CTA */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.45, delay: 0.3 }}
            className="flex flex-wrap items-center gap-3 mb-12"
          >
            <Link href="/auth" className="btn-plasma text-sm">
              Submit Your Engine
              <ArrowRight className="w-4 h-4" />
            </Link>
            <button onClick={handleDemo} className="btn-ghost text-sm gap-2">
              <PlayCircle className="w-4 h-4" />
              Try Live Demo
            </button>
          </motion.div>

          {/* Split hero panels */}
          <motion.div
            initial={{ opacity: 0, y: 32 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.65, delay: 0.4 }}
            className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1"
          >
            <div>
              <div className="label-mono mb-3 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--plasma)] animate-pulse" />
                Live Order Book · Simulated
              </div>
              <LiveOrderbook />
            </div>
            <div>
              <div className="label-mono mb-3 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--bid)] animate-pulse" />
                Benchmark Pipeline
              </div>
              <PipelineAnimation />
            </div>
          </motion.div>
        </div>
      </section>

      {/* Ticker */}
      <StatsTicker />

      {/* Features */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 text-center">
            <div className="label-mono mb-3 text-[var(--plasma)]">Platform Architecture</div>
            <h2 className="text-2xl sm:text-3xl font-bold text-[var(--ink-100)] tracking-tight">
              Four Components, One Pipeline
            </h2>
            <p className="mt-3 text-sm text-[var(--ink-400)] max-w-xl mx-auto">
              Every requirement from the IICPC spec, built to production standards
              with deterministic correctness guarantees.
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
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-[var(--void-900)]">
        <div className="mx-auto max-w-7xl">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
            <div>
              <div className="label-mono mb-3 text-[var(--plasma)]">System Design</div>
              <h2 className="text-2xl sm:text-3xl font-bold text-[var(--ink-100)] tracking-tight mb-4">
                Four-Layer Distributed Architecture
              </h2>
              <p className="text-sm text-[var(--ink-400)] leading-relaxed mb-6">
                UORA is fully decoupled across four horizontal layers. Each layer
                communicates via Redis Streams, Pub/Sub, or direct REST — designed
                for independent scaling and fault isolation.
              </p>
              <div className="flex flex-wrap gap-3">
                {[
                  { icon: Globe, label: "Kubernetes-ready" },
                  { icon: GitBranch, label: "IaC with Terraform" },
                  { icon: Cpu, label: "CPU-pinned sandboxes" },
                  { icon: Zap, label: "Sub-ms latency" },
                  { icon: ShieldCheck, label: "gVisor isolation" },
                  { icon: Code2, label: "C++ / Rust / Go" },
                  { icon: CheckCircle, label: "GED validation" },
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
      <section className="relative py-24 px-4 sm:px-6 lg:px-8 overflow-hidden">
        <div className="absolute inset-0 bg-grid-faint pointer-events-none" />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 60% 60% at 50% 50%, rgba(0,212,255,0.05) 0%, transparent 70%)",
          }}
        />
        <div className="relative z-10 mx-auto max-w-3xl text-center">
          <div className="label-mono mb-4 text-[var(--plasma)]">Ready to compete?</div>
          <h2 className="text-3xl sm:text-4xl font-black text-[var(--ink-0)] tracking-tight mb-4">
            Submit Your Matching Engine
          </h2>
          <p className="text-sm text-[var(--ink-400)] mb-8 max-w-lg mx-auto leading-relaxed">
            Supports C++20, Rust, and Go. Upload your source, watch the pipeline run,
            and see your name on the leaderboard in under two minutes.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link href="/auth" className="btn-plasma text-sm px-8 py-3">
              Launch the Console
              <ArrowRight className="w-4 h-4" />
            </Link>
            <button onClick={handleDemo} className="btn-ghost text-sm px-8 py-3 gap-2">
              <PlayCircle className="w-4 h-4" />
              Try Live Demo
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[rgba(255,255,255,0.05)] py-8 px-4 sm:px-6">
        <div className="mx-auto max-w-7xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <Logo size="xs" />
          <div className="flex items-center gap-4 text-[10px] font-mono text-[var(--ink-500)] uppercase tracking-wider">
            <span>IICPC Summer Hackathon 2026</span>
            <span>·</span>
            <span>Unified Orderbook Resilience Architecture</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
