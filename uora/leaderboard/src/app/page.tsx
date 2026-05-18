"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import {
  Shield,
  Zap,
  Brain,
  Calculator,
  ArrowRight,
  ChevronRight,
  Terminal,
  Activity,
} from "lucide-react";

const features = [
  {
    icon: Shield,
    title: "Absolute Security Sandbox",
    description:
      "gVisor userspace kernel + rootless BuildKit + seccomp-bpf deny-by-default profiles. Zero host kernel access for untrusted submitted binaries.",
    color: "from-uora-cyan to-blue-500",
    glow: "group-hover:shadow-[0_0_30px_rgba(6,182,212,0.15)]",
  },
  {
    icon: Zap,
    title: "Hyper-Scale Throughput",
    description:
      "69,348 orders/sec demonstrated via vertically scaled asyncio Bot Fleet orchestrator with circuit breakers and exponential backoff.",
    color: "from-yellow-400 to-orange-500",
    glow: "group-hover:shadow-[0_0_30px_rgba(245,158,11,0.15)]",
  },
  {
    icon: Brain,
    title: "ML Anomaly Detection",
    description:
      "Isolation Forest tracking 8 entropy and latency features to instantly flag hardcoded cheating, memory leaks, or erratic engine crashes.",
    color: "from-purple-400 to-pink-500",
    glow: "group-hover:shadow-[0_0_30px_rgba(168,85,247,0.15)]",
  },
  {
    icon: Calculator,
    title: "Mathematical Correctness",
    description:
      "Real-time cross-validation against a shadow reference LOB using Graph Edit Distance on L3 states — strict Price-Time priority guaranteed.",
    color: "from-uora-success to-emerald-500",
    glow: "group-hover:shadow-[0_0_30px_rgba(16,185,129,0.15)]",
  },
];

const stats = [
  { label: "Orders/sec", value: "69,348", suffix: "" },
  { label: "Validation Levels", value: "4", suffix: " (L1-L4)" },
  { label: "Anomaly Features", value: "8", suffix: " tracked" },
  { label: "Sandbox Layers", value: "3", suffix: " deep" },
];

const letterVariants = {
  hidden: { opacity: 0, y: 20, filter: "blur(8px)" },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: {
      delay: 0.8 + i * 0.08,
      duration: 0.4,
      ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number],
    },
  }),
};

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-uora-bg text-slate-100 overflow-hidden">
      {/* Animated grid background */}
      <div className="fixed inset-0 bg-grid-pattern opacity-60 pointer-events-none" />
      <div className="fixed inset-0 bg-gradient-to-b from-uora-cyan/[0.03] via-transparent to-transparent pointer-events-none" />

      {/* Scan line */}
      <div className="fixed inset-0 scanline-effect pointer-events-none z-10" />

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center px-6">
        <div className="max-w-5xl mx-auto text-center relative z-10">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-uora-surface border border-uora-border-light text-xs font-mono text-slate-400 mb-8"
          >
            <div className="w-1.5 h-1.5 rounded-full bg-uora-cyan animate-pulse" />
            UORA Open-Source HFT Challenge
          </motion.div>

          {/* Title with glitch reveal */}
          <h1 className="text-6xl sm:text-7xl md:text-8xl lg:text-9xl font-bold tracking-tighter mb-6 flex items-center justify-center">
            {"UORA".split("").map((letter, i) => (
              <motion.span
                key={i}
                custom={i}
                variants={letterVariants}
                initial="hidden"
                animate="visible"
                className="inline-block bg-gradient-to-b from-white via-slate-200 to-slate-400 bg-clip-text text-transparent"
              >
                {letter}
              </motion.span>
            ))}
          </h1>

          {/* Tagline */}
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.2, duration: 0.6 }}
            className="text-lg sm:text-xl text-slate-400 max-w-2xl mx-auto mb-4 font-light"
          >
            Unified Orderbook Resilience Architecture
          </motion.p>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.5, duration: 0.6 }}
            className="text-sm text-slate-500 max-w-xl mx-auto mb-12"
          >
            A distributed, production-grade benchmarking platform that rigorously
            evaluates High-Frequency Trading matching engines using deterministic
            LOBSTER data replay, mathematical state validation, and ML anomaly
            detection.
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.8, duration: 0.5 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Link href="/dashboard">
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className="group relative px-8 py-4 rounded-xl bg-gradient-to-r from-uora-cyan to-uora-blue text-white font-semibold text-sm tracking-wide flex items-center gap-2 overflow-hidden"
              >
                <span className="relative z-10 flex items-center gap-2">
                  <Activity className="w-4 h-4" />
                  Live Dashboard
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                </span>
                <div className="absolute inset-0 bg-gradient-to-r from-uora-cyan to-uora-blue opacity-0 group-hover:opacity-100 blur-xl transition-opacity" />
              </motion.button>
            </Link>

            <Link href="/auth">
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className="px-8 py-4 rounded-xl border border-uora-border-light text-slate-300 font-medium text-sm flex items-center gap-2 hover:bg-uora-elevated/50 hover:border-uora-cyan/30 transition-all"
              >
                <Terminal className="w-4 h-4" />
                Get Started
              </motion.button>
            </Link>
          </motion.div>

          {/* Breathing border decoration */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 2.0 }}
            className="absolute -inset-16 border border-uora-cyan/10 rounded-3xl animate-breathing pointer-events-none"
          />
        </div>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2.5 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-slate-600"
        >
          <span className="text-xs font-mono">Scroll</span>
          <motion.div
            animate={{ y: [0, 6, 0] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="w-px h-6 bg-gradient-to-b from-slate-600 to-transparent"
          />
        </motion.div>
      </section>

      {/* Stats Bar */}
      <section className="relative border-y border-uora-border bg-uora-surface/50 backdrop-blur-sm py-8">
        <div className="max-w-5xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8">
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.5 }}
              className="text-center"
            >
              <div className="text-3xl sm:text-4xl font-bold font-mono text-uora-cyan tabular-nums">
                {stat.value}
              </div>
              <div className="text-xs text-slate-500 mt-1 font-mono">
                {stat.label}
                <span className="text-slate-600">{stat.suffix}</span>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Feature Cards */}
      <section className="relative py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Core{" "}
              <span className="bg-gradient-to-r from-uora-cyan to-uora-blue bg-clip-text text-transparent">
                Architecture
              </span>
            </h2>
            <p className="text-slate-400 max-w-xl mx-auto text-sm">
              Four pillars of deterministic HFT benchmarking — rigorous validation,
              zero trust, and mathematical correctness.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {features.map((feature, i) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.12, duration: 0.5 }}
                className={`group relative bg-uora-surface border border-uora-border rounded-2xl p-8 transition-all duration-300 hover:border-uora-border-light ${feature.glow}`}
              >
                <div
                  className={`w-12 h-12 rounded-xl bg-gradient-to-br ${feature.color} flex items-center justify-center mb-5`}
                >
                  <feature.icon className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-lg font-semibold mb-3 text-slate-100">
                  {feature.title}
                </h3>
                <p className="text-sm text-slate-400 leading-relaxed">
                  {feature.description}
                </p>
                <ChevronRight className="absolute top-8 right-6 w-4 h-4 text-slate-600 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Tech Stack */}
      <section className="relative py-16 px-6 border-t border-uora-border bg-uora-surface/30">
        <div className="max-w-5xl mx-auto text-center">
          <p className="text-xs font-mono text-slate-500 mb-8 tracking-widest uppercase">
            Powered By
          </p>
          <div className="flex flex-wrap items-center justify-center gap-8 text-slate-500">
            {[
              "gVisor",
              "TimescaleDB",
              "Redis",
              "Polars",
              "asyncio",
              "Next.js",
              "ECharts",
              "Terraform",
            ].map((tech, i) => (
              <motion.span
                key={tech}
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
                className="text-sm font-mono px-4 py-2 rounded-lg bg-uora-elevated/50 border border-uora-border/50"
              >
                {tech}
              </motion.span>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-uora-border py-8 px-6">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-600">
          <span className="font-mono">UORA Platform</span>
          <span>Built with precision. Benchmarked with rigor.</span>
        </div>
      </footer>
    </div>
  );
}
