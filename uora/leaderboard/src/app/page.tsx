"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Activity,
  ArrowRight,
  Bot,
  Boxes,
  Gauge,
  LineChart,
  LockKeyhole,
  Radio,
  ShieldCheck,
  UploadCloud,
  Cpu,
  Binary,
  FileCode,
  Zap,
} from "lucide-react";
import { UoraLogo } from "@/components/ui/UoraLogo";

// Native Stateful HFT Telemetry Dashboard Widget
function TelemetryConsoleWidget() {
  const [mounted, setMounted] = useState(false);
  const [throughput, setThroughput] = useState(69348);
  const [latency, setLatency] = useState(8.42);
  const [cpu, setCpu] = useState(18.4);
  const [logs, setLogs] = useState<string[]>([
    "SYS_INIT // BOOTING GVISOR SECURE CONTAINER",
    "SYS_LOAD // REPLAYING HISTORICAL NASDAQ LOBSTER EVENT FEED",
    "SYS_READY // CPU AFFINITY PINNED TO CORE 4 & 5",
  ]);
  const [bids, setBids] = useState([78, 62, 45, 91, 55]);
  const [asks, setAsks] = useState([82, 48, 69, 58, 73]);

  useEffect(() => {
    const mountTimer = setTimeout(() => {
      setMounted(true);
    }, 0);
    
    const interval = setInterval(() => {
      setThroughput(prev => {
        const delta = Math.floor(Math.random() * 200) - 95;
        return Math.max(68000, Math.min(71000, prev + delta));
      });
      setLatency(prev => {
        const delta = (Math.random() * 0.1) - 0.05;
        return parseFloat(Math.max(7.9, Math.min(9.2, prev + delta)).toFixed(3));
      });
      setCpu(prev => {
        const delta = (Math.random() * 2) - 0.9;
        return parseFloat(Math.max(12, Math.min(25, prev + delta)).toFixed(1));
      });
      setBids(prev => prev.map(w => Math.max(20, Math.min(100, w + (Math.floor(Math.random() * 15) - 7)))));
      setAsks(prev => prev.map(w => Math.max(20, Math.min(100, w + (Math.floor(Math.random() * 15) - 7)))));
    }, 450);

    const logTemplates = [
      "ORDER_NEW B ID={id} PRICE={p} QTY={q}",
      "ORDER_MATCH PRICE={p} QTY={q} (BUY={id1} SELL={id2})",
      "ORDER_NEW A ID={id} PRICE={p} QTY={q}",
      "ORDER_CANCEL ID={id} PRICE={p} REASON=USER_REQ",
      "MATCH_ENGINE // PRIORITIZING PRICE-TIME FIFO",
      "ANOMALY_MONITOR // ISOLATION_FOREST SPECS OK",
      "AUDIT_LEDGER // HASH FINGERPRINT GENERATED",
    ];

    let logId = 189425;
    const logInterval = setInterval(() => {
      const template = logTemplates[Math.floor(Math.random() * logTemplates.length)];
      const price = (142.80 + Math.random() * 1.5).toFixed(2);
      const qty = (Math.floor(Math.random() * 8) + 1) * 50;
      
      const newLog = template
        .replace("{id}", logId.toString())
        .replace("{id1}", (logId - 2).toString())
        .replace("{id2}", (logId - 1).toString())
        .replace("{p}", price)
        .replace("{q}", qty.toString());
      
      logId++;
      
      setLogs(prev => {
        const next = [...prev, `[${new Date().toLocaleTimeString()}] ${newLog}`];
        if (next.length > 6) next.shift();
        return next;
      });
    }, 900);

    return () => {
      clearTimeout(mountTimer);
      clearInterval(interval);
      clearInterval(logInterval);
    };
  }, []);

  return (
    <div className="bg-[#08090C] rounded-md border border-uora-border p-4 h-full flex flex-col font-mono text-[10px] text-slate-300 select-none overflow-hidden relative aspect-[16/10] w-full min-h-[360px] shadow-2xl justify-between">
      {/* Top Console Bar */}
      <div className="flex items-center justify-between border-b border-uora-border/60 pb-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-uora-success animate-pulse" />
          <span className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">UORA_MATCH_NODE_D // ACTIVE</span>
        </div>
        <div className="flex gap-4 text-slate-500 text-[8px] uppercase tracking-widest">
          <span>CPU: <span className="text-uora-cyan font-bold">{mounted ? `${cpu}%` : "18.4%"}</span></span>
          <span>MEM: <span className="text-slate-300 font-bold">128MB</span></span>
        </div>
      </div>

      {/* Main Console Split */}
      <div className="grid grid-cols-[1.15fr_0.85fr] gap-3.5 flex-1 min-h-0">
        
        {/* Left Side: Dynamic Scrolling Transaction Feed */}
        <div className="border border-uora-border bg-uora-bg/60 p-3 rounded flex flex-col justify-between overflow-hidden">
          <div className="text-[8px] text-slate-500 uppercase tracking-widest border-b border-uora-border/40 pb-1.5 mb-2 font-bold flex justify-between items-center">
            <span>Transaction Loop Console</span>
            <span className="text-uora-cyan text-[7px] animate-pulse">STREAMING</span>
          </div>
          
          <div className="flex-1 flex flex-col gap-1.5 font-mono text-[8.5px] text-slate-400 overflow-hidden pr-1 justify-end leading-normal">
            {logs.map((log, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -5 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.15 }}
                className={`truncate ${
                  log.includes("MATCH") 
                    ? "text-uora-success font-bold" 
                    : log.includes("ANOMALY") 
                      ? "text-uora-cyan font-bold" 
                      : log.includes("INIT") || log.includes("READY")
                        ? "text-slate-500" 
                        : "text-slate-400"
                }`}
              >
                {log}
              </motion.div>
            ))}
          </div>
        </div>

        {/* Right Side: Dynamic Orderbook Depth bars */}
        <div className="border border-uora-border bg-uora-bg/60 p-3 rounded flex flex-col justify-between overflow-hidden">
          <div className="text-[8px] text-slate-500 uppercase tracking-widest border-b border-uora-border/40 pb-1.5 mb-2 font-bold flex justify-between items-center">
            <span>L3 LOB top-of-book</span>
            <span className="text-uora-success text-[7px] font-bold">LIVE_MATCH</span>
          </div>

          <div className="flex-1 flex flex-col justify-around gap-1 font-mono text-[8px]">
            {/* Sell Orders (Asks) - Red bars */}
            <div className="flex flex-col gap-1 border-b border-uora-border/30 pb-2">
              {asks.map((width, idx) => (
                <div key={idx} className="flex items-center justify-between gap-2">
                  <span className="text-slate-600 w-8">{(143.50 - idx * 0.1).toFixed(2)}</span>
                  <div className="flex-1 h-2 bg-uora-surface border border-uora-border/40 rounded-sm overflow-hidden flex justify-end">
                    <motion.div
                      animate={{ width: `${width}%` }}
                      transition={{ duration: 0.4, ease: "easeOut" }}
                      className="bg-red-500/15 border-l border-red-500/50 h-full"
                    />
                  </div>
                  <span className="text-red-400/80 w-6 text-right font-bold">{(width * 10).toLocaleString()}</span>
                </div>
              ))}
            </div>

            {/* Buy Orders (Bids) - Green bars */}
            <div className="flex flex-col gap-1 pt-1">
              {bids.map((width, idx) => (
                <div key={idx} className="flex items-center justify-between gap-2">
                  <span className="text-slate-600 w-8">{(142.70 - idx * 0.1).toFixed(2)}</span>
                  <div className="flex-1 h-2 bg-uora-surface border border-uora-border/40 rounded-sm overflow-hidden">
                    <motion.div
                      animate={{ width: `${width}%` }}
                      transition={{ duration: 0.4, ease: "easeOut" }}
                      className="bg-emerald-500/15 border-r border-emerald-500/50 h-full"
                    />
                  </div>
                  <span className="text-emerald-400/80 w-6 text-right font-bold">{(width * 10).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>

      {/* Bottom Telemetry Metrics grid */}
      <div className="grid grid-cols-3 gap-3 border-t border-uora-border/60 pt-3 mt-3 text-center">
        <div className="border border-uora-border bg-uora-bg/30 p-2 rounded">
          <div className="text-[11px] font-bold text-uora-cyan tabular-nums tracking-wide">
            {mounted ? throughput.toLocaleString() : "69,348"}
          </div>
          <div className="text-[7px] text-slate-500 uppercase tracking-widest mt-1">Ingest loops/s</div>
        </div>
        <div className="border border-uora-border bg-uora-bg/30 p-2 rounded">
          <div className="text-[11px] font-bold text-uora-success tabular-nums tracking-wide">
            {mounted ? `${latency}μs` : "8.420μs"}
          </div>
          <div className="text-[7px] text-slate-500 uppercase tracking-widest mt-1">p99 latency</div>
        </div>
        <div className="border border-uora-border bg-uora-bg/30 p-2 rounded">
          <div className="text-[11px] font-bold text-slate-300 tracking-wide uppercase">
            LOCKFREE_FIFO
          </div>
          <div className="text-[7px] text-slate-500 uppercase tracking-widest mt-1">Priority Rule</div>
        </div>
      </div>
    </div>
  );
}

// Stagger entry configurations
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.04,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12, scale: 0.99 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.5,
      ease: [0.16, 1, 0.3, 1] as const,
    },
  },
};

// Premium features grid stagger configurations
const gridContainerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.02,
    },
  },
};

const gridItemVariants = {
  hidden: { opacity: 0, y: 10, scale: 0.99 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.4,
      ease: [0.16, 1, 0.3, 1] as const,
    },
  },
};

const pipeline = [
  {
    label: "Code Validation",
    detail: "Submit optimized C++20, Rust, or Go source files representing low-latency matching engines.",
    icon: UploadCloud,
    tone: "text-uora-cyan",
  },
  {
    label: "gVisor Jail Sandbox",
    detail: "Containers are locked within a secure userspace kernel context running seccomp-bpf syscall security rules.",
    icon: LockKeyhole,
    tone: "text-uora-success",
  },
  {
    label: "Market Replay Feed",
    detail: "Replays real historical LOBSTER high-frequency trading logs into the isolated engine instances.",
    icon: Bot,
    tone: "text-uora-warning",
  },
  {
    label: "Telemetry Scoring",
    detail: "Measures throughput and ticks latencies down to the nanosecond, producing composite scores.",
    icon: Gauge,
    tone: "text-uora-blue",
  },
];

const uoraFeatures = [
  {
    title: "Secure Isolation Sandbox",
    icon: ShieldCheck,
    desc: "Matching engines submitted to the harness run within a hyper-isolated environment using Google's gVisor userspace kernel. This completely traps malicious execution, preventing host kernel leaks while allowing strict seccomp-bpf validation.",
  },
  {
    title: "Deterministic LOBSTER Replay",
    icon: Activity,
    desc: "We feed engine binaries with real-world, nanosecond-stamped orderbook events from Nasdaq historical LOBSTER logs. This replicates extreme high-density market situations to test engine reliability under pressure.",
  },
  {
    title: "ML Anomaly Classification",
    icon: Cpu,
    desc: "An Isolation Forest unsupervised ML detector analyzes 8 dimensional metric vectors (including memory growth, throughput peaks, and latency variance) to instantly flag hardcoded cheat codes, sleep loops, or memory leaks.",
  },
  {
    title: "Graph Edit Distance Validation",
    icon: Binary,
    desc: "Ensures strict Price-Time priority. Submissions are compared in real-time against a shadow reference Orderbook. Any structural discrepancies are detected using advanced Graph Edit Distance (GED) on L3/L4 order topologies.",
  },
  {
    title: "High-Frequency Telemetry",
    icon: Radio,
    desc: "TimescaleDB telemetry databases store and aggregate tick measurements. Custom Envoy network proxies intercept and stamp transaction packets, which are pushed in real-time to the Next.js console via Redis Pub/Sub SSE nodes.",
  },
  {
    title: "Automated Audit Signatures",
    icon: Boxes,
    desc: "Every successful deployment generates a signed cryptographic audit report containing comprehensive latency histograms, throughput graphs, and verification fingerprints suitable for institutional compliance review.",
  },
];

export default function HomePage() {
  return (
    <main className="min-h-screen relative overflow-hidden bg-uora-bg text-slate-100 bg-dot-pattern">
      <div className="absolute inset-0 bg-grid-pattern opacity-40 pointer-events-none" />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-uora-cyan/50 to-transparent" />

      {/* Decorative radial glows */}
      <div className="absolute -top-[25%] -left-[10%] w-[55%] h-[55%] rounded-full bg-uora-cyan/5 blur-[140px] pointer-events-none" />
      <div className="absolute -bottom-[25%] -right-[10%] w-[55%] h-[55%] rounded-full bg-uora-success/5 blur-[140px] pointer-events-none" />

      <div className="relative mx-auto flex min-h-screen max-w-[1600px] flex-col px-6 py-6 sm:px-8 lg:px-12">
        {/* Navigation Header */}
        <motion.header
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex items-center justify-between border-b border-uora-border/60 pb-5"
        >
          <UoraLogo size="md" />
          <div className="flex items-center gap-3">
            <Link
              href="/auth"
              className="hidden rounded-md border border-uora-border bg-uora-surface px-4 py-2 text-xs font-mono tracking-wider text-slate-300 transition-all hover:border-uora-cyan/40 hover:text-white sm:inline-flex"
            >
              SIGN IN
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-md border border-uora-cyan/35 bg-uora-cyan/10 px-4 py-2 text-xs font-mono tracking-wider text-uora-cyan shadow-[0_0_15px_rgba(226,181,62,0.1)] transition-all hover:bg-uora-cyan/20"
            >
              LAUNCH CONSOLE
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </motion.header>

        {/* Hero Section */}
        <section className="grid flex-1 items-center gap-12 py-16 lg:grid-cols-[0.95fr_1.05fr] lg:py-24">
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="max-w-3xl"
          >
            <motion.div
              variants={itemVariants}
              className="inline-flex items-center gap-2 rounded-full border border-uora-cyan/20 bg-uora-cyan/5 px-3 py-1 text-[11px] font-mono tracking-widest text-uora-cyan mb-6 uppercase"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-uora-cyan animate-pulse" />
              Unified Orderbook Resilience Architecture
            </motion.div>
            
            <motion.h1
              variants={itemVariants}
              className="text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl font-sans leading-[1.1]"
            >
              Deterministic High-Concurrency Matching Engine Telemetry & Validation
            </motion.h1>
            
            <motion.p
              variants={itemVariants}
              className="mt-6 max-w-2xl text-base leading-relaxed text-slate-400"
            >
              UORA is an advanced distributed orchestrator that securely isolates, compiles, and 
              benchmarks proprietary matching engines. Running within secure userspace sandboxes, 
              we replay dense Nasdaq-LOBSTER order histories to rigorously evaluate mathematical 
              correctness and nano-latency compliance.
            </motion.p>
            
            <motion.div variants={itemVariants} className="mt-10 flex flex-wrap gap-4">
              <Link
                href="/dashboard"
                className="inline-flex items-center justify-center gap-2 rounded-md bg-uora-cyan px-6 py-3.5 text-xs font-mono tracking-widest font-bold text-uora-bg hover:opacity-90 shadow-[0_0_20px_rgba(226,181,62,0.2)] transition-all"
              >
                LAUNCH OPERATIONAL CONSOLE
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/auth"
                className="inline-flex items-center justify-center gap-2 rounded-md border border-uora-border bg-uora-surface px-6 py-3.5 text-xs font-mono tracking-widest font-semibold text-slate-200 hover:border-uora-cyan/40 hover:bg-uora-elevated transition-all"
              >
                SUBMIT ENGINE CODE
              </Link>
            </motion.div>
          </motion.div>

          {/* Right Hardware/Console Graphic Mockup */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2, duration: 0.6, ease: "easeOut" }}
            className="relative"
          >
            <div className="rounded-md border border-uora-border bg-uora-surface shadow-2xl shadow-black/80 overflow-hidden relative">
              
              {/* Animated scanline grid overlays */}
              <div className="absolute inset-0 bg-scanlines pointer-events-none opacity-20" />

              {/* Terminal Title Bar */}
              <div className="flex items-center justify-between border-b border-uora-border px-5 py-4 bg-uora-bg/60 relative z-10">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-uora-error/40" />
                    <span className="w-2.5 h-2.5 rounded-full bg-uora-warning/40" />
                    <span className="w-2.5 h-2.5 rounded-full bg-uora-success/40" />
                  </div>
                  <span className="text-xs font-mono text-slate-500 ml-2">UORA // TELEMETRY_STATION_A</span>
                </div>
                <div className="flex items-center gap-2 rounded border border-uora-success/30 bg-uora-success/5 px-2.5 py-1 text-[10px] font-mono text-uora-success uppercase">
                  <span className="h-1.5 w-1.5 rounded-full bg-uora-success animate-pulse mr-1" />
                  Live Core Feed
                </div>
              </div>

              {/* Steps Layout */}
              <div className="grid gap-4 p-6 sm:grid-cols-2 relative z-10">
                {pipeline.map(({ label, detail, icon: Icon, tone }, index) => (
                  <motion.div
                    key={label}
                    whileHover={{ y: -2, borderColor: "rgba(226, 181, 98, 0.3)", backgroundColor: "rgba(15, 17, 23, 0.8)" }}
                    className="relative overflow-hidden rounded-md border border-uora-border/60 bg-uora-bg/40 p-4 transition-all duration-300 group"
                  >
                    <div className="absolute right-4 top-4 font-mono text-[10px] text-slate-700 font-bold group-hover:text-uora-cyan transition-colors">
                      [0{index + 1}]
                    </div>
                    <Icon className={`mb-4 h-5 w-5 ${tone} opacity-85 group-hover:scale-105 transition-transform`} />
                    <div className="text-sm font-semibold text-white font-mono tracking-wide">{label}</div>
                    <div className="mt-1.5 text-xs text-slate-500 font-sans leading-relaxed">{detail}</div>
                  </motion.div>
                ))}
              </div>

              {/* Graphical Trace Flow & Statistics */}
              <div className="grid border-t border-uora-border bg-uora-bg/20 lg:grid-cols-[1.1fr_0.9fr] relative z-10">
                <div className="min-h-[220px] rounded-md border border-uora-border bg-uora-bg/80 p-5 m-6 flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">Nano-Latency Wave</span>
                    <LineChart className="h-3.5 w-3.5 text-uora-cyan animate-pulse" />
                  </div>
                  
                  {/* SVG Chart with dynamic dasharray animation simulating matching speed */}
                  <svg viewBox="0 0 520 180" className="h-36 w-full overflow-visible" aria-hidden>
                    <defs>
                      <linearGradient id="trace-fill" x1="0" y1="0" x2="0" y2="1">
                        <stop stopColor="#E2B53E" stopOpacity="0.25" />
                        <stop offset="1" stopColor="#E2B53E" stopOpacity="0" />
                      </linearGradient>
                      <filter id="glow-trace" x="-20%" y="-20%" width="140%" height="140%">
                        <feGaussianBlur stdDeviation="3" result="blur" />
                        <feMerge>
                          <feMergeNode in="blur" />
                          <feMergeNode in="SourceGraphic" />
                        </feMerge>
                      </filter>
                    </defs>
                    
                    {/* Gridlines */}
                    {[30, 60, 90, 120, 150].map((y) => (
                      <line key={y} x1="0" x2="520" y1={y} y2={y} stroke="#1b2533" strokeWidth="0.5" strokeDasharray="3 3" />
                    ))}
                    {[90, 180, 270, 360, 450].map((x) => (
                      <line key={x} x1={x} x2={x} y1="0" y2="180" stroke="#1b2533" strokeWidth="0.5" strokeDasharray="3 3" />
                    ))}

                    {/* Gradient area trace under baseline */}
                    <motion.path
                      d="M0 132 C 55 120, 74 82, 112 95 S 180 150, 229 110 S 301 56, 356 84 S 444 146, 520 66 L520 180 L0 180 Z"
                      fill="url(#trace-fill)"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.4, duration: 1 }}
                    />

                    {/* Gold Base trace */}
                    <motion.path
                      d="M0 132 C 55 120, 74 82, 112 95 S 180 150, 229 110 S 301 56, 356 84 S 444 146, 520 66"
                      fill="none"
                      stroke="#E2B53E"
                      strokeWidth="3"
                      strokeLinecap="round"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 0.8, ease: "easeOut" }}
                    />

                    {/* Cyber Mint animated flowing overlay trace (concurrency pulses) */}
                    <motion.path
                      d="M0 132 C 55 120, 74 82, 112 95 S 180 150, 229 110 S 301 56, 356 84 S 444 146, 520 66"
                      fill="none"
                      stroke="#10B981"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeDasharray="10 15"
                      opacity="0.8"
                      animate={{
                        strokeDashoffset: [0, -50],
                      }}
                      transition={{
                        duration: 3,
                        repeat: Infinity,
                        ease: "linear",
                      }}
                    />

                    {/* Oscilloscope glowing gold laser tracer dot */}
                    <motion.circle
                      r="4.5"
                      fill="#FFD875"
                      filter="url(#glow-trace)"
                    >
                      <animateMotion
                        path="M0 132 C 55 120, 74 82, 112 95 S 180 150, 229 110 S 301 56, 356 84 S 444 146, 520 66"
                        dur="3.5s"
                        repeatCount="indefinite"
                      />
                    </motion.circle>
                  </svg>
                  
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 border-t border-uora-border/60 pt-2">
                    <span className="text-uora-success">P99.9 Latency: 8.42μs</span>
                    <span className="text-slate-400">Scale: 69,348 tx/sec</span>
                  </div>
                </div>

                <div className="flex flex-col gap-3 py-6 pr-6 pl-6 lg:pl-0 justify-center">
                  {[
                    { label: "Isolation", value: "Secure gVisor VM", icon: ShieldCheck },
                    { label: "Telemetry", value: "Polars / Timescale", icon: Activity },
                    { label: "Speed", value: "Envoy Proxy Lua", icon: Zap },
                    { label: "Audit Ledger", value: "SHA-256 Signatures", icon: Boxes },
                  ].map(({ label, value, icon: Icon }) => (
                    <div
                      key={label}
                      className="flex items-center justify-between rounded-md border border-uora-border bg-uora-bg/40 px-4 py-3 hover:border-uora-cyan/35 hover:bg-uora-bg/75 transition-all duration-300"
                    >
                      <div className="flex items-center gap-3">
                        <Icon className="h-4 w-4 text-uora-cyan" />
                        <span className="text-xs font-mono text-slate-400 uppercase tracking-wide">{label}</span>
                      </div>
                      <span className="font-mono text-xs font-bold text-slate-200">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </section>

        {/* Telemetry Visual Console Section (Floating asset preview) */}
        <section className="py-20 border-t border-uora-border/60 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-uora-cyan/5 to-transparent pointer-events-none" />
          <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] items-center relative z-10">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="max-w-xl"
            >
              <div className="inline-flex items-center gap-2 rounded-full border border-uora-cyan/20 bg-uora-cyan/5 px-3 py-1 text-[10px] font-mono tracking-widest text-uora-cyan mb-4 uppercase">
                High-Frequency Operational View
              </div>
              <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl font-sans leading-tight">
                High-Frequency Telemetry Dashboards
              </h2>
              <p className="mt-5 text-sm leading-relaxed text-slate-400 font-sans">
                UORA parses transaction packets down to nanosecond resolution. The matching core reports 
                bids, asks, queue structures, and throughput metrics instantly, rendering them on a consolidated 
                real-time terminal. Spot bottlenecks, analyze latency jitter profiles, and inspect compiler execution pipelines.
              </p>
              
              <div className="mt-8 grid grid-cols-2 gap-4">
                <div className="border border-uora-border bg-uora-surface p-4 rounded-md">
                  <div className="text-xl font-mono font-bold text-uora-cyan">8.42μs</div>
                  <div className="text-[10px] font-mono text-slate-500 uppercase mt-1 tracking-wider">Median Latency</div>
                </div>
                <div className="border border-uora-border bg-uora-surface p-4 rounded-md">
                  <div className="text-xl font-mono font-bold text-uora-success">99.98%</div>
                  <div className="text-[10px] font-mono text-slate-500 uppercase mt-1 tracking-wider">CPU Efficiency</div>
                </div>
              </div>
            </motion.div>

            {/* Premium Floating Dashboard Preview Image */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 30 }}
              whileInView={{ opacity: 1, scale: 1, y: 0 }}
              viewport={{ once: true, amount: 0.15 }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] as const }}
              className="relative"
            >
              <div className="rounded-md border border-uora-border bg-uora-surface/30 p-2 shadow-[0_0_50px_rgba(0,0,0,0.8)] hover:border-uora-cyan/35 transition-colors duration-500 group animate-float relative overflow-hidden">
                {/* Corner tech lines */}
                <div className="absolute -top-px -left-px w-6 h-6 border-t-2 border-l-2 border-uora-cyan rounded-tl-md pointer-events-none z-10" />
                <div className="absolute -top-px -right-px w-6 h-6 border-t-2 border-r-2 border-uora-cyan rounded-tr-md pointer-events-none z-10" />
                <div className="absolute -bottom-px -left-px w-6 h-6 border-b-2 border-l-2 border-uora-cyan rounded-bl-md pointer-events-none z-10" />
                <div className="absolute -bottom-px -right-px w-6 h-6 border-b-2 border-r-2 border-uora-cyan rounded-br-md pointer-events-none z-10" />

                {/* Floating inner glow */}
                <div className="absolute inset-0 bg-gradient-to-tr from-uora-cyan/5 via-transparent to-uora-success/5 pointer-events-none opacity-40 group-hover:opacity-80 transition-opacity duration-700 rounded-md" />
                
                <TelemetryConsoleWidget />
              </div>
            </motion.div>
          </div>
        </section>

        {/* Dynamic Architectures Specifications Section */}
        <section className="py-20 border-t border-uora-border/60 relative">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-uora-surface/10 to-transparent pointer-events-none" />
          
          <div className="relative mb-14 text-center max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 rounded-full border border-uora-cyan/20 bg-uora-cyan/5 px-3 py-1 text-[10px] font-mono tracking-widest text-uora-cyan mb-4 uppercase">
              Robust Core Architecture
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl font-sans">
              Decoupled Multi-Layer Distributed Telemetry
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-slate-400">
              UORA is constructed using event-driven sandboxed microservices optimized for horizontal scaling, 
              ensuring zero impact on host machines while collecting deterministic execution logs.
            </p>
          </div>

          <motion.div
            variants={gridContainerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.20 }}
            className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
          >
            {uoraFeatures.map(({ title, icon: Icon, desc }, idx) => (
              <motion.div
                key={title}
                variants={gridItemVariants}
                whileHover={{ y: -3, borderColor: "rgba(226, 181, 62, 0.3)" }}
                className="bg-uora-surface border border-uora-border rounded-md p-6 flex flex-col justify-between hover:shadow-[0_4px_20px_rgba(0,0,0,0.4)] transition-all duration-300"
              >
                <div>
                  <div className="w-10 h-10 rounded-md bg-uora-bg border border-uora-border flex items-center justify-center mb-5">
                    <Icon className="w-5 h-5 text-uora-cyan" />
                  </div>
                  <h3 className="text-base font-semibold text-white font-mono tracking-wide mb-3">{title}</h3>
                  <p className="text-xs text-slate-400 font-sans leading-relaxed">{desc}</p>
                </div>
                
                <div className="border-t border-uora-border/60 pt-4 mt-6 flex justify-between items-center text-[10px] font-mono text-slate-500 uppercase tracking-widest">
                  <span>Audit Stage 0{idx + 1}</span>
                  <span className="text-uora-success">Status: SECURE</span>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </section>

        {/* Low Latency Quant C++ Benchmark Example */}
        <section className="py-16 border-t border-uora-border/60">
          <div className="grid gap-12 lg:grid-cols-2 items-center">
            
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-uora-cyan/20 bg-uora-cyan/5 px-3 py-1 text-[10px] font-mono tracking-widest text-uora-cyan mb-4 uppercase">
                Optimized SDK Execution
              </div>
              <h2 className="text-3xl font-bold tracking-tight text-white font-sans">
                Ultra-Low Latency Lock-Free Reference Models
              </h2>
              <p className="mt-5 text-sm leading-relaxed text-slate-400 font-sans">
                Our Contestant SDK includes C++20 and Rust baseline engines that showcase state-of-the-art ring 
                buffer patterns. Using cache-aligned data models and thread-pinned worker threads, submissions 
                consistently process high-throughput event loops at sub-microsecond bounds.
              </p>

              <div className="mt-8 space-y-4">
                <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-uora-cyan/10 border border-uora-cyan/25 flex items-center justify-center flex-shrink-0 text-xs font-bold font-mono text-uora-cyan">1</div>
                  <div>
                    <h4 className="text-xs font-mono font-bold text-white uppercase tracking-wider">Zero Dynamic Allocations</h4>
                    <p className="text-xs text-slate-500 mt-1 font-sans">Prevent heap interruptions during transaction evaluation loops.</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-uora-success/10 border border-uora-success/25 flex items-center justify-center flex-shrink-0 text-xs font-bold font-mono text-uora-success">2</div>
                  <div>
                    <h4 className="text-xs font-mono font-bold text-white uppercase tracking-wider">Lock-Free Queue Layout</h4>
                    <p className="text-xs text-slate-500 mt-1 font-sans">Leverage atomic memory barriers for lightning-fast inter-thread message processing.</p>
                  </div>
                </div>
              </div>
            </div>

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="rounded-md border border-uora-border bg-[#050608] shadow-2xl overflow-hidden font-mono text-[11px] text-slate-300"
            >
              <div className="flex items-center justify-between px-5 py-3 border-b border-uora-border bg-[#0D0F13]">
                <div className="flex items-center gap-2">
                  <FileCode className="w-3.5 h-3.5 text-uora-cyan" />
                  <span className="text-xs text-slate-400">LockFreeQueue.hpp</span>
                </div>
                <span className="text-[9px] text-slate-600 tracking-wider">C++20 COMPATIBLE</span>
              </div>
              <div className="p-5 overflow-x-auto leading-relaxed bg-[#050608]/90">
                <pre className="text-left font-mono">
                  <code>
{`#pragma once
#include <atomic>
#include <new>

template <typename T, size_t Capacity>
class LockFreeQueue {
private:
    static_assert((Capacity & (Capacity - 1)) == 0, "Capacity must be power of 2");
    
    struct alignas(64) Node {
        T data;
        std::atomic<size_t> sequence;
    };

    Node* const m_buffer;
    const size_t m_mask;
    
    alignas(64) std::atomic<size_t> m_enqueuePos;
    alignas(64) std::atomic<size_t> m_dequeuePos;

public:
    explicit LockFreeQueue()
        : m_buffer(new Node[Capacity])
        , m_mask(Capacity - 1)
        , m_enqueuePos(0)
        , m_dequeuePos(0)
    {
        for (size_t i = 0; i < Capacity; ++i) {
            m_buffer[i].sequence.store(i, std::memory_order_relaxed);
        }
    }
};`}
                  </code>
                </pre>
              </div>
            </motion.div>

          </div>
        </section>

        {/* Systems Statistics / Dynamic Counter Bar */}
        <section className="py-12 border-t border-uora-border/60">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            {[
              { stat: "69,348", label: "Max Ingested Orders/s", tone: "text-uora-cyan" },
              { stat: "< 240ns", label: "Kernel Execution Penalty", tone: "text-uora-success" },
              { stat: "100.0%", label: "L3 Priority Determinism", tone: "text-uora-warning" },
              { stat: "8-Vector", label: "ML Classification Dimensions", tone: "text-uora-blue" },
            ].map(({ stat, label, tone }) => (
              <div key={label} className="p-4 bg-uora-surface/20 border border-uora-border rounded-md">
                <div className={`text-2xl sm:text-3xl font-mono font-bold tracking-tight ${tone}`}>{stat}</div>
                <div className="text-[10px] font-mono uppercase text-slate-500 tracking-wider mt-2">{label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Footer */}
        <footer className="mt-auto border-t border-uora-border/60 pt-6 pb-2 text-center text-[10px] font-mono text-slate-600 uppercase tracking-[0.2em] flex flex-col sm:flex-row justify-between items-center gap-4">
          <span>&copy; {new Date().getFullYear()} UORA PLATFORM // ALL RIGHTS RESERVED</span>
          <span>SECURED BY GVISOR SANDBOXING TELEMETRY</span>
        </footer>
      </div>
    </main>
  );
}
