"use client";

import { useCallback, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  Code2,
  FileCode2,
  FolderOpen,
  Loader2,
  Upload,
  X,
} from "lucide-react";
import { useAuthStore } from "@/stores/useAuthStore";
import { useLeaderboardStore, LeaderboardEntry } from "@/stores/useLeaderboardStore";
import { GlassPanel, PanelHeader, PanelTitle } from "@/components/ui/GlassPanel";
import { LanguageBadge, StatusBadge } from "@/components/ui/Badge";
import { DEMO_PIPELINE_STAGES } from "@/lib/demoData";

function relativeTime(ts: number): string {
  const diff = Math.max(0, Date.now() - ts);
  if (diff < 5_000) return "just now";
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function ScoreInline({ entry }: { entry: LeaderboardEntry }) {
  const fmtTps = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
    return `${n.toFixed(0)}`;
  };
  return (
    <div className="mt-2 grid grid-cols-4 gap-2 p-3 rounded border border-[rgba(0,212,255,0.15)] bg-[rgba(0,212,255,0.03)]">
      <div>
        <p className="text-[9px] font-mono uppercase tracking-wider text-[var(--ink-500)]">Score</p>
        <p className="text-base font-mono font-bold text-[var(--plasma)] tabular-nums">
          {entry.composite_score.toFixed(1)}
        </p>
      </div>
      <div>
        <p className="text-[9px] font-mono uppercase tracking-wider text-[var(--ink-500)]">P99 Latency</p>
        <p className="text-base font-mono font-bold text-[var(--ink-100)] tabular-nums">
          {entry.p99_latency_ms.toFixed(2)}<span className="text-[10px] font-normal text-[var(--ink-400)] ml-0.5">ms</span>
        </p>
      </div>
      <div>
        <p className="text-[9px] font-mono uppercase tracking-wider text-[var(--ink-500)]">Throughput</p>
        <p className="text-base font-mono font-bold text-[var(--ink-100)] tabular-nums">
          {fmtTps(entry.throughput)}<span className="text-[10px] font-normal text-[var(--ink-400)] ml-0.5">o/s</span>
        </p>
      </div>
      <div>
        <p className="text-[9px] font-mono uppercase tracking-wider text-[var(--ink-500)]">Correctness</p>
        <p className={`text-base font-mono font-bold tabular-nums ${entry.correctness_rate >= 0.95 ? "text-[var(--bid)]" : entry.correctness_rate >= 0.5 ? "text-[#F0B90B]" : "text-[var(--ask)]"}`}>
          {(entry.correctness_rate * 100).toFixed(1)}<span className="text-[10px] font-normal text-[var(--ink-400)] ml-0.5">%</span>
        </p>
      </div>
    </div>
  );
}

const LANG_EXT: Record<string, string> = {
  ".cpp": "cpp", ".cc": "cpp", ".cxx": "cpp",
  ".rs": "rust",
  ".go": "go",
  ".py": "python",
};

const LANG_LABEL: Record<string, string> = {
  cpp: "C++20 · GCC 13",
  rust: "Rust · rustc 1.75",
  go: "Go · 1.21",
  python: "Python · 3.13",
};

function detectLang(filename: string): string | null {
  const n = filename.toLowerCase();
  if (n.endsWith(".tar.gz") || n.endsWith(".tgz") || n.endsWith(".zip")) return "cpp";
  const ext = n.substring(n.lastIndexOf("."));
  return LANG_EXT[ext] || null;
}

const PIPELINE_STEPS = [
  { id: "queued",      label: "Queued" },
  { id: "building",    label: "Build" },
  { id: "deployed",    label: "Deploy" },
  { id: "benchmarking",label: "Benchmark" },
  { id: "validating",  label: "Validate" },
  { id: "scored",      label: "Score" },
];

const STEP_ORDER = PIPELINE_STEPS.map((s) => s.id);

function PipelineTracker({ status }: { status: string }) {
  const idx = STEP_ORDER.indexOf(status);
  return (
    <div className="flex items-center gap-0">
      {PIPELINE_STEPS.map((step, i) => {
        const done = i < idx || status === "scored";
        const active = i === idx && status !== "failed" && status !== "scored";
        const failed = status === "failed" && i === idx;
        return (
          <div key={step.id} className="flex items-center">
            <div className="flex flex-col items-center gap-1">
              <motion.div
                animate={{
                  backgroundColor: failed
                    ? "rgba(234,57,67,0.2)"
                    : done || status === "scored"
                    ? "rgba(22,199,132,0.15)"
                    : active
                    ? "rgba(0,212,255,0.15)"
                    : "rgba(255,255,255,0.03)",
                  borderColor: failed
                    ? "rgba(234,57,67,0.5)"
                    : done || status === "scored"
                    ? "rgba(22,199,132,0.4)"
                    : active
                    ? "rgba(0,212,255,0.5)"
                    : "rgba(255,255,255,0.1)",
                }}
                className="w-6 h-6 rounded-full border flex items-center justify-center text-[9px] font-mono font-bold"
              >
                {failed ? (
                  <span style={{ color: "var(--ask)" }}>✗</span>
                ) : done || status === "scored" ? (
                  <span style={{ color: "var(--bid)" }}>✓</span>
                ) : active ? (
                  <Loader2
                    className="w-3 h-3 animate-spin"
                    style={{ color: "var(--plasma)" }}
                  />
                ) : (
                  <span style={{ color: "var(--ink-500)" }}>{i + 1}</span>
                )}
              </motion.div>
              <span
                className="text-[8px] font-mono uppercase tracking-wide whitespace-nowrap"
                style={{
                  color: done || status === "scored"
                    ? "var(--bid)"
                    : active
                    ? "var(--plasma)"
                    : "var(--ink-500)",
                }}
              >
                {step.label}
              </span>
            </div>
            {i < PIPELINE_STEPS.length - 1 && (
              <motion.div
                animate={{ backgroundColor: done ? "rgba(22,199,132,0.3)" : "rgba(255,255,255,0.06)" }}
                className="h-px w-6 mx-0.5 mb-4"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

interface SubmissionPortalProps { isDemo?: boolean }

export function SubmissionPortal({ isDemo = false }: SubmissionPortalProps) {
  const { user } = useAuthStore();
  const { addSubmission, updateSubmissionStatus, submissions, entries } = useLeaderboardStore();
  const [file, setFile] = useState<File | null>(null);
  const [lang, setLang] = useState<string | null>(null);
  const [badType, setBadType] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const selectFile = useCallback((f: File) => {
    const detected = detectLang(f.name);
    setBadType(!detected);
    setFile(f);
    setLang(detected);
    setError(null);
    setSuccess(null);
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) selectFile(f);
  };

  const clearFile = () => {
    setFile(null);
    setLang(null);
    setBadType(false);
    setError(null);
    setSuccess(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleSubmit = async () => {
    if (!file || !lang || badType) return;
    setError(null);
    setSuccess(null);

    if (isDemo) {
      const demoId = `demo-${Date.now()}`;
      addSubmission({ id: demoId, team: user?.team || "Demo", language: lang, status: "queued", submittedAt: Date.now() });
      const stages = DEMO_PIPELINE_STAGES;
      for (const stage of stages) {
        setTimeout(() => updateSubmissionStatus(demoId, stage.status as never), stage.delay);
      }
      setSuccess(demoId);
      setFile(null);
      setLang(null);
      return;
    }

    setSubmitting(true);
    try {
      const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const form = new FormData();
      form.append("file", file, file.name);

      // The backend accepts `language` as a query parameter (FastAPI default
      // — not annotated with Form). Putting it in the form body is silently
      // dropped, leading to auto-detect failures for tarballs / .py files.
      const url = new URL(`${API}/api/v1/submit`);
      url.searchParams.set("language", lang);

      const res = await fetch(url.toString(), {
        method: "POST",
        credentials: "include",
        body: form,
      });

      if (res.ok) {
        const data = await res.json();
        addSubmission({
          id: data.submission_id,
          team: user?.team || user?.name || "Unknown",
          language: lang,
          status: "queued",
          submittedAt: Date.now(),
        });
        setSuccess(data.submission_id);
        setFile(null);
        setLang(null);
      } else {
        const err = await res.json().catch(() => null);
        setError(err?.detail || `Submission failed (${res.status})`);
      }
    } catch {
      setError("Submission service unavailable");
    } finally {
      setSubmitting(false);
    }
  };

  const recentSubmissions = submissions.slice(0, 5);

  return (
    <div className="space-y-4">
      {/* Upload panel */}
      <GlassPanel>
        <PanelHeader>
          <PanelTitle icon={<Upload className="w-3.5 h-3.5" />}>Submit Engine</PanelTitle>
          {isDemo && (
            <span className="text-[9px] font-mono px-2 py-1 rounded bg-[rgba(240,185,11,0.08)] border border-[rgba(240,185,11,0.2)] text-[#F0B90B] uppercase tracking-wider">
              Demo Mode
            </span>
          )}
        </PanelHeader>

        <div className="p-5 space-y-4">
          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => !file && fileRef.current?.click()}
            className={`
              relative rounded border-2 border-dashed transition-all duration-200 cursor-pointer
              flex flex-col items-center justify-center gap-3 p-8 text-center min-h-[160px]
              ${dragging
                ? "border-[rgba(0,212,255,0.5)] bg-[rgba(0,212,255,0.04)]"
                : file
                ? "border-[rgba(0,212,255,0.2)] bg-[rgba(0,212,255,0.02)] cursor-default"
                : "border-[rgba(255,255,255,0.08)] hover:border-[rgba(0,212,255,0.25)] hover:bg-[rgba(0,212,255,0.02)]"
              }
            `}
          >
            <input
              ref={fileRef}
              type="file"
              className="sr-only"
              accept=".cpp,.cc,.cxx,.rs,.go,.py,.tar.gz,.tgz,.zip"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) selectFile(f); }}
            />
            <AnimatePresence mode="wait">
              {file ? (
                <motion.div
                  key="file"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center gap-2"
                >
                  <FileCode2 className="w-8 h-8 text-[var(--plasma)]" />
                  <div>
                    <p className="text-sm font-mono font-medium text-[var(--ink-100)] truncate max-w-xs">
                      {file.name}
                    </p>
                    <p className="text-[11px] text-[var(--ink-400)] mt-0.5">
                      {(file.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                  {lang && <LanguageBadge lang={lang} />}
                  {badType && (
                    <span className="text-[11px] font-mono text-[var(--ask)]">
                      Unsupported file type
                    </span>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); clearFile(); }}
                    className="mt-1 p-1 rounded text-[var(--ink-500)] hover:text-[var(--ask)] transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </motion.div>
              ) : (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col items-center gap-2"
                >
                  <div className="w-10 h-10 rounded-full bg-[rgba(0,212,255,0.06)] border border-[rgba(0,212,255,0.12)] flex items-center justify-center">
                    <Upload className="w-4 h-4 text-[var(--plasma)]" />
                  </div>
                  <div>
                    <p className="text-sm text-[var(--ink-100)] font-mono">
                      Drop your engine here
                    </p>
                    <p className="text-[11px] text-[var(--ink-400)] mt-0.5">
                      .cpp .rs .go .py .tar.gz .zip · Max 50 MB
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}
                    className="btn-ghost text-xs px-3 py-1.5 mt-1"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    Browse files
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Language info */}
          {lang && (
            <div className="flex items-center gap-2 p-3 rounded bg-[var(--void-800)] border border-[rgba(0,212,255,0.08)]">
              <Code2 className="w-3.5 h-3.5 text-[var(--plasma)] flex-shrink-0" />
              <span className="text-[11px] font-mono text-[var(--ink-300)]">
                Detected: <span className="text-[var(--plasma)]">{LANG_LABEL[lang]}</span>
              </span>
            </div>
          )}

          {/* Feedback */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-start gap-2 p-3 rounded bg-[rgba(234,57,67,0.06)] border border-[rgba(234,57,67,0.2)] text-[11px] font-mono text-[var(--ask)]"
              >
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                {error}
              </motion.div>
            )}
            {success && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-start gap-2 p-3 rounded bg-[rgba(22,199,132,0.06)] border border-[rgba(22,199,132,0.2)] text-[11px] font-mono text-[var(--bid)]"
              >
                <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                Queued · ID: {success.slice(0, 12)}…
              </motion.div>
            )}
          </AnimatePresence>

          <button
            onClick={handleSubmit}
            disabled={!file || !lang || badType || submitting}
            className="btn-plasma w-full"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Upload className="w-4 h-4" />
                Submit Engine
              </>
            )}
          </button>
        </div>
      </GlassPanel>

      {/* Recent submissions */}
      {recentSubmissions.length > 0 && (
        <GlassPanel>
          <PanelHeader>
            <PanelTitle>Recent Submissions</PanelTitle>
          </PanelHeader>
          <div className="divide-y divide-[rgba(255,255,255,0.04)]">
            {recentSubmissions.map((sub) => {
              const entry = entries.find((e) => e.submission_id === sub.id);
              return (
                <div key={sub.id} className="px-5 py-3.5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <LanguageBadge lang={sub.language} />
                      <span className="text-[11px] font-mono text-[var(--ink-400)] truncate">
                        {sub.id.slice(0, 14)}…
                      </span>
                      <span className="text-[10px] font-mono text-[var(--ink-500)] flex-shrink-0">
                        · {relativeTime(sub.submittedAt)}
                      </span>
                    </div>
                    <StatusBadge status={sub.status} />
                  </div>
                  {sub.status !== "scored" && sub.status !== "failed" && (
                    <PipelineTracker status={sub.status} />
                  )}
                  {sub.status === "scored" && entry && <ScoreInline entry={entry} />}
                  {sub.status === "scored" && !entry && (
                    <p className="text-[10px] font-mono text-[var(--ink-400)] italic">
                      Awaiting leaderboard sync…
                    </p>
                  )}
                  {sub.error && (
                    <div className="flex items-start gap-2 p-2.5 rounded bg-[rgba(234,57,67,0.06)] border border-[rgba(234,57,67,0.2)]">
                      <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5 text-[var(--ask)]" />
                      <p className="text-[10px] font-mono text-[var(--ask)] leading-relaxed">{sub.error}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </GlassPanel>
      )}
    </div>
  );
}
