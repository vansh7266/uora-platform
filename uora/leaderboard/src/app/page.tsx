"use client";

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
} from "lucide-react";
import { UoraLogo } from "@/components/ui/UoraLogo";

const pipeline = [
  { label: "Upload", detail: "C++ / Rust / Go", icon: UploadCloud, tone: "text-uora-cyan" },
  { label: "Isolate", detail: "gVisor runtime", icon: LockKeyhole, tone: "text-uora-success" },
  { label: "Load", detail: "REST / WS / FIX", icon: Bot, tone: "text-uora-warning" },
  { label: "Score", detail: "Latency + correctness", icon: Gauge, tone: "text-uora-blue" },
];

const proof = [
  { label: "Sandbox", value: "Non-root", icon: ShieldCheck },
  { label: "Telemetry", value: "Timescale", icon: Activity },
  { label: "Leaderboard", value: "SSE live", icon: Radio },
  { label: "Deploy", value: "K8s-ready", icon: Boxes },
];

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#05080d] text-slate-100">
      <div className="absolute inset-0 bg-grid-pattern opacity-80" />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-uora-cyan/70 to-transparent" />

      <div className="relative mx-auto flex min-h-screen max-w-[1500px] flex-col px-5 py-5 sm:px-8 lg:px-10">
        <header className="flex items-center justify-between">
          <UoraLogo size="md" />
          <div className="flex items-center gap-3">
            <Link
              href="/auth"
              className="hidden rounded-lg border border-[#2a3a50] bg-[#101823] px-4 py-2 text-sm font-medium text-slate-300 transition hover:border-uora-cyan/40 hover:text-white sm:inline-flex"
            >
              Sign In
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-lg border border-uora-cyan/35 bg-uora-cyan/12 px-4 py-2 text-sm font-semibold text-uora-cyan transition hover:bg-uora-cyan/20"
            >
              Open Dashboard
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </header>

        <section className="grid flex-1 items-center gap-10 py-12 lg:grid-cols-[0.92fr_1.08fr] lg:py-16">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: "easeOut" }}
            className="max-w-3xl"
          >
            <div className="mb-5 h-px w-28 bg-gradient-to-r from-uora-cyan to-transparent" />
            <h1 className="text-5xl font-semibold tracking-tight text-white sm:text-6xl lg:text-7xl">
              Benchmark trading engines under real market pressure.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
              UORA hosts untrusted matching-engine submissions, drives concurrent order flow,
              validates price-time priority, and streams live latency, throughput, and
              correctness scores.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/dashboard"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-uora-cyan px-5 py-3 text-sm font-bold text-[#041017] transition hover:bg-[#4de7d7]"
              >
                Launch Console
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/auth"
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#2a3a50] bg-[#101823] px-5 py-3 text-sm font-semibold text-slate-200 transition hover:border-uora-cyan/40"
              >
                Submit Engine
              </Link>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.12, duration: 0.55, ease: "easeOut" }}
            className="relative"
          >
            <div className="rounded-lg border border-[#26364b] bg-[#0b1119]/95 shadow-2xl shadow-black/40">
              <div className="flex items-center justify-between border-b border-[#223047] px-5 py-4">
                <div>
                  <div className="text-sm font-semibold text-slate-100">Benchmark Pipeline</div>
                  <div className="text-xs text-slate-500">Upload to live score stream</div>
                </div>
                <div className="flex items-center gap-2 rounded-md border border-uora-success/30 bg-uora-success/10 px-3 py-1.5 text-xs font-mono text-uora-success">
                  <span className="h-2 w-2 rounded-full bg-uora-success" />
                  READY
                </div>
              </div>

              <div className="grid gap-4 p-5 sm:grid-cols-2">
                {pipeline.map(({ label, detail, icon: Icon, tone }, index) => (
                  <div
                    key={label}
                    className="relative overflow-hidden rounded-lg border border-[#253449] bg-[#101823] p-4"
                  >
                    <div className="absolute right-4 top-4 font-mono text-xs text-slate-600">
                      0{index + 1}
                    </div>
                    <Icon className={`mb-5 h-5 w-5 ${tone}`} />
                    <div className="text-base font-semibold text-white">{label}</div>
                    <div className="mt-1 text-sm text-slate-500">{detail}</div>
                  </div>
                ))}
              </div>

              <div className="grid border-t border-[#223047] p-5 lg:grid-cols-[1fr_0.92fr]">
                <div className="min-h-[220px] rounded-lg border border-[#253449] bg-[#070c12] p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <div className="text-sm font-semibold">Latency Trace</div>
                    <LineChart className="h-4 w-4 text-uora-cyan" />
                  </div>
                  <svg viewBox="0 0 520 180" className="h-44 w-full" aria-hidden>
                    <defs>
                      <linearGradient id="trace-fill" x1="0" y1="0" x2="0" y2="1">
                        <stop stopColor="#39D5C3" stopOpacity="0.28" />
                        <stop offset="1" stopColor="#39D5C3" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path
                      d="M0 132 C 55 120, 74 82, 112 95 S 180 150, 229 110 S 301 56, 356 84 S 444 146, 520 66"
                      fill="none"
                      stroke="#39D5C3"
                      strokeWidth="4"
                      strokeLinecap="round"
                    />
                    <path
                      d="M0 132 C 55 120, 74 82, 112 95 S 180 150, 229 110 S 301 56, 356 84 S 444 146, 520 66 L520 180 L0 180 Z"
                      fill="url(#trace-fill)"
                    />
                    {[90, 180, 270, 360, 450].map((x) => (
                      <line key={x} x1={x} x2={x} y1="12" y2="168" stroke="#1b2a3b" strokeWidth="1" />
                    ))}
                  </svg>
                </div>
                <div className="grid gap-3 pt-4 lg:pl-4 lg:pt-0">
                  {proof.map(({ label, value, icon: Icon }) => (
                    <div
                      key={label}
                      className="flex items-center justify-between rounded-lg border border-[#253449] bg-[#101823] px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <Icon className="h-4 w-4 text-uora-cyan" />
                        <span className="text-sm text-slate-400">{label}</span>
                      </div>
                      <span className="font-mono text-sm font-semibold text-slate-100">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </section>
      </div>
    </main>
  );
}

