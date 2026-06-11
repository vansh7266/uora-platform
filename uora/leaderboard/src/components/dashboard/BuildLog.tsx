"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Terminal } from "lucide-react";
import { useLeaderboardStore } from "@/stores/useLeaderboardStore";
import { GlassPanel, PanelHeader, PanelTitle } from "@/components/ui/GlassPanel";

// Simulated build log lines for demo mode. Real submissions stream their
// actual compiler output through `submission.buildLog`; demo mode plays this
// scripted sequence to mimic the same flow without running a real build.
const DEMO_LOG_LINES: { delay: number; text: string; type: LineType }[] = [
  { delay: 0,    type: "info",    text: "[UORA] Submission received · language=cpp" },
  { delay: 300,  type: "cmd",     text: "$ buildctl build --frontend=dockerfile.v0 --local context=src" },
  { delay: 800,  type: "info",    text: "  → Unpacking source archive (247 KB)" },
  { delay: 1100, type: "info",    text: "  → Resolving gcc:13-bullseye base image" },
  { delay: 1800, type: "cmd",     text: "$ g++ -std=c++20 -O3 -march=native -o engine matching_engine.cpp" },
  { delay: 3200, type: "info",    text: "  In function 'OrderBook::submit_order':" },
  { delay: 3300, type: "warn",    text: "  warning: comparison of integer expressions of different signedness [-Wsign-compare]" },
  { delay: 4000, type: "success", text: "  → Compilation succeeded (3.2s)" },
  { delay: 4200, type: "cmd",     text: "$ gvisor-wrap --profile=seccomp.json --cpus=2 --memory=512m ./engine" },
  { delay: 4600, type: "info",    text: "  → Sandbox: gVisor runtime enforced" },
  { delay: 4800, type: "info",    text: "  → seccomp-bpf: 312 syscalls allowed, 1026 denied" },
  { delay: 5100, type: "success", text: "  → Container healthy · port 9000 open" },
  { delay: 5400, type: "cmd",     text: "$ benchmark-worker --bots=500 --duration=60s --replay=lobster_sample" },
  { delay: 5700, type: "info",    text: "  → Spawning 500 async bot workers" },
  { delay: 6000, type: "info",    text: "  → LOBSTER replay: 847,231 order events" },
  { delay: 7500, type: "info",    text: "  → Latency: p50=0.19ms p90=0.33ms p99=0.61ms" },
  { delay: 8000, type: "info",    text: "  → Throughput: 1,204,511 orders/s peak" },
  { delay: 8300, type: "cmd",     text: "$ validator --lob-ref=reference.bin --ged-threshold=0.02" },
  { delay: 8600, type: "info",    text: "  → L1 price-time priority: PASS (100,000/100,000)" },
  { delay: 8800, type: "info",    text: "  → L2 state machine: PASS" },
  { delay: 9000, type: "info",    text: "  → L3 market invariants: PASS" },
  { delay: 9200, type: "info",    text: "  → L4 GED determinism: 0.0031 (threshold 0.02): PASS" },
  { delay: 9500, type: "success", text: "  → Correctness rate: 99.97%" },
  { delay: 9700, type: "cmd",     text: "$ scorer --formula='(tps * correctness) / (p99^2 + resource_penalty)'" },
  { delay: 10200,type: "success", text: "  → Composite score: 94.7 / 100.0" },
  { delay: 10400,type: "info",    text: "  → ML anomaly score: 0.031 (CLEAN)" },
  { delay: 10600,type: "success", text: "[UORA] Benchmark complete · results published to leaderboard" },
];

type LineType = "info" | "success" | "warn" | "error" | "cmd";

const typeColor: Record<LineType, string> = {
  info:    "var(--ink-400)",
  success: "var(--bid)",
  warn:    "#F0B90B",
  error:   "var(--ask)",
  cmd:     "var(--plasma)",
};

interface RenderLine {
  text: string;
  type: LineType;
}

/** Heuristic classifier so a stdout/stderr text blob lights up readably. */
function classify(line: string): LineType {
  const l = line.toLowerCase();
  if (l.startsWith("$ ")) return "cmd";
  if (l.startsWith("→") || l.startsWith("✓") || l.includes("success") || l.includes("ok"))
    return "success";
  if (l.includes("error") || l.includes("failed") || l.includes("fatal"))
    return "error";
  if (l.includes("warning") || l.includes("warn:")) return "warn";
  return "info";
}

interface BuildLogProps {
  isDemo?: boolean;
}

export function BuildLog({ isDemo = false }: BuildLogProps) {
  const { submissions } = useLeaderboardStore();
  const [demoLines, setDemoLines] = useState<RenderLine[]>([]);
  const [running, setRunning] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // ── DEMO: play scripted lines on each demo submission ───────────────────
  useEffect(() => {
    if (!isDemo) return;
    const demoSub = submissions.find(
      (s) => s.id.startsWith("demo-") && s.status !== "failed",
    );
    if (!demoSub || running) return;

    setDemoLines([]);
    setRunning(true);

    const timeouts: ReturnType<typeof setTimeout>[] = [];
    for (const line of DEMO_LOG_LINES) {
      const t = setTimeout(() => {
        setDemoLines((prev) => [...prev, { text: line.text, type: line.type }]);
      }, line.delay);
      timeouts.push(t);
    }
    const endT = setTimeout(
      () => setRunning(false),
      DEMO_LOG_LINES[DEMO_LOG_LINES.length - 1].delay + 500,
    );
    timeouts.push(endT);

    return () => timeouts.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissions.length, isDemo]);

  // ── REAL: render the latest active submission's actual buildLog ─────────
  const latestReal = useMemo(() => {
    return submissions
      .filter((s) => !s.id.startsWith("demo-"))
      .sort((a, b) => b.submittedAt - a.submittedAt)[0];
  }, [submissions]);

  const realLines: RenderLine[] = useMemo(() => {
    if (!latestReal || !latestReal.buildLog) return [];
    return latestReal.buildLog
      .split("\n")
      .filter((l) => l.trim().length > 0)
      .map((l) => ({ text: l, type: classify(l) }));
  }, [latestReal]);

  const realRunning =
    !!latestReal &&
    !["scored", "failed"].includes(latestReal.status);

  // Choose source by mode
  const lines = isDemo ? demoLines : realLines;
  const isRunning = isDemo ? running : realRunning;
  const isFailed = !isDemo && latestReal?.status === "failed";

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  return (
    <GlassPanel>
      <PanelHeader>
        <PanelTitle icon={<Terminal className="w-3.5 h-3.5" />}>
          Live Build Log
        </PanelTitle>
        <div className="flex items-center gap-2">
          {isRunning && (
            <span className="flex items-center gap-1.5 text-[10px] font-mono text-[var(--plasma)]">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--plasma)] animate-pulse" />
              RUNNING
            </span>
          )}
          {!isRunning && lines.length > 0 && !isFailed && (
            <span className="text-[10px] font-mono text-[var(--bid)]">DONE</span>
          )}
          {isFailed && (
            <span className="text-[10px] font-mono text-[var(--ask)]">FAILED</span>
          )}
        </div>
      </PanelHeader>

      <div className="bg-[var(--void-950)] p-4 font-mono text-[11px] min-h-[200px] max-h-[320px] overflow-y-auto rounded-b-md">
        {lines.length === 0 ? (
          <p className="text-[var(--ink-600)]">
            {isDemo
              ? "Submit an engine to stream build logs here."
              : latestReal
              ? `Awaiting compiler output for ${latestReal.id.slice(0, 8)}…`
              : "Awaiting submission…"}
          </p>
        ) : (
          <AnimatePresence>
            {lines.map((line, i) => (
              <motion.div
                key={`${i}-${line.text.slice(0, 24)}`}
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.15 }}
                className="leading-relaxed whitespace-pre-wrap break-all"
                style={{ color: typeColor[line.type] }}
              >
                {line.text}
              </motion.div>
            ))}
          </AnimatePresence>
        )}
        {isRunning && (
          <span
            className="inline-block w-2 h-3.5 bg-[var(--plasma)] animate-blink ml-0.5"
            style={{ verticalAlign: "text-bottom" }}
          />
        )}
        <div ref={bottomRef} />
      </div>
    </GlassPanel>
  );
}
