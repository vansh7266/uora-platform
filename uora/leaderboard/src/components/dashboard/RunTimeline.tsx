"use client";

import { motion } from "framer-motion";
import { useLeaderboardStore } from "@/stores/useLeaderboardStore";
import {
  CheckCircle2,
  XCircle,
  Clock,
  Compass,
  Cpu,
  Layers,
  ShieldCheck,
  TrendingUp,
  Server,
} from "lucide-react";
import { cn } from "@/lib/utils";

const STAGES = [
  { id: "queued", label: "Queued", detail: "Registered in queue", icon: Clock },
  { id: "building", label: "Building", detail: "Compiling source binaries", icon: Layers },
  { id: "built", label: "Built", detail: "Binary compilation nominal", icon: Cpu },
  { id: "deployed", label: "Deployed", detail: "Isolated in secure gVisor", icon: ShieldCheck },
  { id: "benchmarking", label: "Benchmarking", detail: "Simulating FIX/WS load", icon: TrendingUp },
  { id: "validating", label: "Validating", detail: "Checking priority matching", icon: Compass },
  { id: "scored", label: "Scored", detail: "Telemetry metrics indexed", icon: Server },
];

export function RunTimeline() {
  const { submissions, entries } = useLeaderboardStore();

  // Helper to map current status + store entries to the 8 timeline stages
  const getStageStatus = (subStatus: string, subId: string, stageId: string) => {
    const isFailed = subStatus === "failed";
    const order = ["queued", "building", "built", "deployed", "benchmarking", "validating", "scored"];
    
    // Check if scored (i.e. entry exists in leaderboard entries)
    const isScored = entries.some((e) => e.submission_id === subId);
    
    let currentStageIndex = order.indexOf(subStatus);
    if (isScored) {
      currentStageIndex = order.indexOf("scored");
    } else if (subStatus === "deployed") {
      // If deployed but not scored yet, we are benchmarking/validating
      // Let's dynamically simulate that we're between deployed, benchmarking and validating
      currentStageIndex = order.indexOf("benchmarking");
    }

    const stageIndex = order.indexOf(stageId);

    if (isFailed && stageIndex === currentStageIndex) {
      return "failed";
    }

    if (stageIndex < currentStageIndex || (isScored && stageId === "scored")) {
      return "completed";
    }

    if (stageIndex === currentStageIndex && !isFailed) {
      return "active";
    }

    return "pending";
  };

  const getSubTitleColor = (status: string) => {
    switch (status) {
      case "deployed":
      case "scored":
        return "text-uora-success";
      case "failed":
        return "text-uora-error";
      case "building":
      case "built":
        return "text-uora-warning";
      default:
        return "text-slate-400";
    }
  };

  if (submissions.length === 0) {
    return (
      <div className="bg-uora-surface border border-uora-border rounded-md p-10 text-center shadow-lg">
        <Server className="w-10 h-10 text-slate-700 mx-auto mb-4" />
        <h3 className="text-sm font-semibold font-mono tracking-wider text-slate-400 uppercase mb-1.5">
          Telemetry Timeline Offline
        </h3>
        <p className="text-xs text-slate-500 font-sans max-w-md mx-auto">
          No matching engine runs currently active in queue. Transmit source files via the Submit portal to initialize the 8-stage validation pipeline.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {submissions.map((sub) => {
        const matchingEntry = entries.find((e) => e.submission_id === sub.id);
        const finalStatus = matchingEntry ? "scored" : sub.status;
        
        return (
          <div
            key={sub.id}
            className="bg-uora-surface border border-uora-border rounded-md p-6 shadow-lg relative overflow-hidden"
          >
            {/* Top Info Bar */}
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-uora-border/60 pb-4 mb-6">
              <div>
                <span className="text-[10px] font-mono font-bold tracking-widest text-uora-cyan uppercase">
                  ACTIVE PIPELINE MONITOR
                </span>
                <h4 className="text-base font-semibold text-white font-mono mt-1">
                  {sub.team} <span className="text-xs font-normal text-slate-500 font-mono">({sub.id.slice(0, 12)})</span>
                </h4>
              </div>
              <div className="flex items-center gap-4 text-xs font-mono">
                <div>
                  <span className="text-slate-500 uppercase tracking-wider text-[10px] mr-1.5">COMPILER:</span>
                  <span className="text-slate-300 uppercase">{sub.language === "cpp" ? "C++20" : sub.language}</span>
                </div>
                <div>
                  <span className="text-slate-500 uppercase tracking-wider text-[10px] mr-1.5">STATUS:</span>
                  <span className={cn("font-bold uppercase tracking-wider", getSubTitleColor(finalStatus))}>
                    {finalStatus}
                  </span>
                </div>
                {matchingEntry && (
                  <div className="px-2.5 py-1 rounded border border-uora-cyan/30 bg-uora-cyan/5 text-uora-cyan font-bold">
                    SCORE: {matchingEntry.composite_score.toFixed(1)}
                  </div>
                )}
              </div>
            </div>

            {/* Horizontal Timeline Track */}
            <div className="grid grid-cols-1 md:grid-cols-7 gap-6 relative">
              {STAGES.map((stage, idx) => {
                const status = getStageStatus(sub.status, sub.id, stage.id);
                const Icon = stage.icon;

                return (
                  <div key={stage.id} className="relative flex flex-col items-center md:items-start text-center md:text-left group">
                    {/* Connecting line for desktop layout */}
                    {idx < STAGES.length - 1 && (
                      <div className="hidden md:block absolute left-[26px] top-[14px] right-0 h-[2px] bg-uora-border/60 z-0">
                        <motion.div
                          className="h-full bg-gradient-to-r from-uora-success to-uora-cyan"
                          initial={{ width: 0 }}
                          animate={{ width: status === "completed" ? "100%" : "0%" }}
                          transition={{ duration: 0.5 }}
                        />
                      </div>
                    )}

                    {/* Step Icon Indicator */}
                    <div className="relative z-10 flex items-center justify-center">
                      <div
                        className={cn(
                          "w-8 h-8 rounded-full border flex items-center justify-center font-mono text-xs transition-all duration-300",
                          status === "completed"
                            ? "bg-uora-success/10 border-uora-success text-uora-success shadow-[0_0_12px_rgba(16,185,129,0.15)]"
                            : status === "active"
                            ? "bg-uora-cyan/15 border-uora-cyan text-uora-cyan animate-pulse shadow-[0_0_15px_rgba(226,181,62,0.25)]"
                            : status === "failed"
                            ? "bg-uora-error/10 border-uora-error text-uora-error shadow-[0_0_12px_rgba(239,68,68,0.15)]"
                            : "bg-uora-bg border-uora-border text-slate-500"
                        )}
                      >
                        {status === "completed" ? (
                          <CheckCircle2 className="w-4 h-4 text-uora-success" />
                        ) : status === "failed" ? (
                          <XCircle className="w-4 h-4 text-uora-error" />
                        ) : (
                          <Icon className="w-3.5 h-3.5" />
                        )}
                      </div>
                    </div>

                    {/* Step Label */}
                    <div className="mt-3">
                      <div
                        className={cn(
                          "text-xs font-mono font-bold tracking-wide uppercase transition-colors",
                          status === "active"
                            ? "text-uora-cyan"
                            : status === "completed"
                            ? "text-slate-200"
                            : status === "failed"
                            ? "text-uora-error"
                            : "text-slate-600"
                        )}
                      >
                        {stage.label}
                      </div>
                      <p className="text-[10px] text-slate-500 font-sans mt-0.5 max-w-[130px] leading-relaxed mx-auto md:mx-0">
                        {stage.detail}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Simulated Live Console Stream for active compiling/benchmarking */}
            {finalStatus !== "failed" && finalStatus !== "scored" && (
              <div className="mt-6 p-4 bg-uora-bg border border-uora-border rounded-md font-mono text-[10px] text-slate-500 select-none overflow-hidden h-24 flex flex-col justify-end">
                <div className="text-uora-success mb-1">&gt; uora-bench@isolate-host: INITIALIZING HARNESS</div>
                <div>&gt; Spinning up gVisor secure containment network context... OK</div>
                <div className="animate-pulse">&gt; {finalStatus === "building" ? "Compiling translation units (gcc -O3 -std=c++20)..." : "Simulating high-concurrency order replay load tests..."}</div>
              </div>
            )}

            {finalStatus === "failed" && (
              <div className="mt-6 p-4 bg-uora-error/5 border border-uora-error/20 rounded-md font-mono text-[10px] text-uora-error overflow-hidden">
                <div>&gt; uora-bench@compile-host: CRITICAL ENGINE BUILD FAILURE</div>
                <div>&gt; compilation error: reference to undefined symbol &apos;match_limit_exceeded&apos;</div>
                <div>&gt; deployment halted. check source binary exports and resubmit.</div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
