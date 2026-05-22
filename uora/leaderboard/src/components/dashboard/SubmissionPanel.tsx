"use client";

import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  FileCode2,
  CheckCircle2,
  Loader2,
  Code2,
  AlertCircle,
  FolderOpen,
  X,
  AlertTriangle,
  FlaskConical,
} from "lucide-react";
import { useAuthStore } from "@/stores/useAuthStore";
import { useLeaderboardStore } from "@/stores/useLeaderboardStore";
import { cn, getLanguageBg } from "@/lib/utils";
import { DEMO_PIPELINE_STAGES } from "@/lib/demoData";

type SubmissionStatus =
  | "queued"
  | "building"
  | "built"
  | "deployed"
  | "benchmarking"
  | "validating"
  | "scored"
  | "failed";

const LANGUAGE_MAP: Record<string, string> = {
  ".cpp": "cpp",
  ".cc": "cpp",
  ".cxx": "cpp",
  ".rs": "rust",
  ".go": "go",
};

const LANGUAGE_LABEL: Record<string, string> = {
  cpp: "C++ (GCC 13)",
  rust: "Rust (rustc 1.75)",
  go: "Go (go1.21)",
};

function detectLanguage(filename: string): string | null {
  const ext = filename.substring(filename.lastIndexOf("."));
  return LANGUAGE_MAP[ext] || null;
}

function getNowTimestamp(queuedAt?: string): number {
  return queuedAt ? Date.parse(queuedAt) : Date.now();
}

interface SubmissionPanelProps {
  isDemo?: boolean;
}

export function SubmissionPanel({ isDemo = false }: SubmissionPanelProps) {
  const { isAuthenticated, user } = useAuthStore();
  const { addSubmission, updateSubmissionStatus } = useLeaderboardStore();
  const [file, setFile] = useState<File | null>(null);
  const [language, setLanguage] = useState<string | null>(null);
  const [unsupportedType, setUnsupportedType] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback((selectedFile: File) => {
    const detected = detectLanguage(selectedFile.name);
    setUnsupportedType(!detected);
    setFile(selectedFile);
    setLanguage(detected);
    setSubmitError(null);
    setSubmitSuccess(null);
  }, []);

  const handleClearFile = useCallback(() => {
    setFile(null);
    setLanguage(null);
    setUnsupportedType(false);
    setSubmitError(null);
    setSubmitSuccess(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile) handleFileSelect(droppedFile);
    },
    [handleFileSelect]
  );

  const handleBrowseClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const pollSubmissionStatus = useCallback((id: string, apiBase: string) => {
    let attempts = 0;
    const poll = setInterval(async () => {
      attempts++;
      if (attempts > 60) {
        clearInterval(poll);
        return;
      }
      try {
        const res = await fetch(`${apiBase}/api/v1/status/${id}`, {
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          const status = data.status as SubmissionStatus;
          
          let failedStage: string | undefined = undefined;
          if (status === "failed") {
            if (!data.built_at) failedStage = "building";
            else if (!data.deployed_at) failedStage = "deployed";
            else if (!data.benchmarking_at) failedStage = "benchmarking";
            else if (!data.validating_at) failedStage = "validating";
            else failedStage = "scored";
          }

          updateSubmissionStatus(id, status, data.error, failedStage);
          if (status === "scored" || status === "failed") {
            clearInterval(poll);
          }
        }
      } catch {
        // Polling failure, skip to avoid breaking UI
      }
    }, 2000);
  }, [updateSubmissionStatus]);

  // ── Demo pipeline simulation ───────────────────────────────────────────────
  const runDemoPipeline = useCallback(
    async (submissionId: string) => {
      for (const stage of DEMO_PIPELINE_STAGES) {
        await new Promise((r) => setTimeout(r, stage.delay));
        updateSubmissionStatus(submissionId, stage.status as SubmissionStatus);
      }
    },
    [updateSubmissionStatus]
  );

  const handleSubmit = useCallback(async () => {
    if (!file || !language) return;
    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(null);

    // ── Demo mode: simulate the full pipeline client-side ─────────────────
    if (isDemo) {
      const demoId = `demo-live-${Date.now().toString(16)}`;
      addSubmission({
        id: demoId,
        team: user?.team || "UORA Demo Desk",
        language: language!,
        status: "queued",
        submittedAt: Date.now(),
      });
      setSubmitSuccess(`[DEMO] Submission ${demoId.slice(0, 8)} queued — simulating pipeline…`);
      setFile(null);
      setLanguage(null);
      setUnsupportedType(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setIsSubmitting(false);
      // Run pipeline simulation in background
      runDemoPipeline(demoId);
      return;
    }

    // ── Real mode: hit the actual API ────────────────────────────────────
    try {
      const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

      const formData = new FormData();
      formData.append("file", file);
      formData.append("language", language);

      const res = await fetch(`${API_BASE}/api/v1/submit`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        const realId = data.submission_id;
        if (!realId) {
          throw new Error("Submission API did not return a submission id");
        }

        addSubmission({
          id: realId,
          team: user?.team || "Unknown Firm",
          language,
          status: "queued",
          submittedAt: getNowTimestamp(data.queued_at),
        });

        setSubmitSuccess(`Submission ${realId.slice(0, 8)} queued for isolated evaluation.`);
        setFile(null);
        setLanguage(null);
        setUnsupportedType(false);
        if (fileInputRef.current) fileInputRef.current.value = "";

        pollSubmissionStatus(realId, API_BASE);
        return;
      }

      const errData = await res.json().catch(() => null);
      throw new Error(errData?.detail || `Upload failed (${res.status})`);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Submission failed");
    } finally {
      setIsSubmitting(false);
    }
  }, [file, language, isDemo, addSubmission, user, pollSubmissionStatus, runDemoPipeline]);

  if (!isAuthenticated) {
    return (
      <div className="bg-uora-surface border border-uora-border rounded-md p-8 shadow-lg">
        <div className="flex flex-col items-center text-center gap-4">
          <div className="w-14 h-14 rounded-md bg-uora-bg border border-uora-border flex items-center justify-center">
            <FileCode2 className="w-7 h-7 text-slate-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold font-mono tracking-wider text-slate-300 uppercase mb-2">
              Authentication Required
            </h3>
            <p className="text-xs text-slate-500 font-sans max-w-xs">
              You must sign in to submit matching engines to the secure benchmarking runtime.
            </p>
          </div>
          <a
            href="/auth"
            className="inline-flex items-center gap-2 mt-1 px-5 py-2.5 rounded-md bg-uora-cyan text-uora-bg font-mono font-bold text-xs tracking-widest hover:shadow-[0_0_15px_rgba(226,181,62,0.25)] transition-all"
          >
            Sign In to Submit
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-uora-surface border border-uora-border rounded-md overflow-hidden shadow-lg">
      <div className="px-5 py-4 border-b border-uora-border/60 flex items-center justify-between bg-uora-bg/30">
        <div className="flex items-center gap-2">
          <Upload className="w-4 h-4 text-uora-cyan animate-pulse" />
          <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300">
            Matching Engine Upload Portal
          </h3>
          {isDemo && (
            <span className="flex items-center gap-1 ml-1 px-2 py-0.5 rounded bg-uora-cyan/10 border border-uora-cyan/25 text-[9px] font-mono text-uora-cyan uppercase tracking-widest">
              <FlaskConical className="w-2.5 h-2.5" />
              Demo
            </span>
          )}
        </div>
        {file && (
          <button
            onClick={handleClearFile}
            className="flex items-center gap-1 text-[10px] font-mono text-slate-500 hover:text-uora-error transition-colors uppercase tracking-wider"
          >
            <X className="w-3 h-3" />
            Clear
          </button>
        )}
      </div>

      <div className="p-6 space-y-4">
        {/* Demo notice */}
        {isDemo && (
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-md bg-uora-cyan/5 border border-uora-cyan/20 text-[10px] font-mono text-uora-cyan/80">
            <FlaskConical className="w-3 h-3 flex-shrink-0 mt-0.5" />
            <span>
              Demo mode — upload any <b>.cpp</b>, <b>.rs</b>, or <b>.go</b> file. The pipeline will simulate building, deploying, benchmarking, and scoring with no real backend required.
            </span>
          </div>
        )}

        {/* Drop Zone */}
        <div
          onDrop={handleDrop}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          className={cn(
            "relative border border-dashed rounded-md p-8 text-center transition-all duration-300",
            isDragging
              ? "border-uora-cyan bg-uora-cyan/5 shadow-[0_0_15px_rgba(226,181,62,0.1)]"
              : file && !unsupportedType
              ? "border-uora-success/40 bg-uora-success/5"
              : unsupportedType
              ? "border-uora-error/40 bg-uora-error/5"
              : "border-uora-border hover:border-uora-cyan/40 hover:bg-uora-bg/10"
          )}
        >
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".cpp,.cc,.cxx,.rs,.go"
            onChange={(e) => {
              if (e.target.files?.[0]) handleFileSelect(e.target.files[0]);
            }}
            className="hidden"
          />

          {file ? (
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="space-y-3"
            >
              <Code2 className={cn("w-8 h-8 mx-auto", unsupportedType ? "text-uora-error" : "text-uora-success")} />
              <p className="text-xs font-mono text-slate-200 font-semibold truncate max-w-[240px] mx-auto">
                {file.name}
              </p>
              <p className="text-[10px] font-mono text-slate-500">
                {(file.size / 1024).toFixed(2)} KB
              </p>
              {language && !unsupportedType && (
                <span
                  className={cn(
                    "inline-block px-2.5 py-1 rounded text-[9px] font-mono border uppercase tracking-wider",
                    getLanguageBg(language)
                  )}
                >
                  {LANGUAGE_LABEL[language] || language}
                </span>
              )}
            </motion.div>
          ) : (
            <div className="space-y-3">
              <Upload className="w-8 h-8 text-slate-600 mx-auto opacity-70" />
              <p className="text-xs font-mono text-slate-400">
                Drag &amp; drop your matching engine source file here
              </p>
              <p className="text-[9px] font-mono text-slate-600">
                Supported: C++17/20 (.cpp, .cc, .cxx) · Rust (.rs) · Go (.go)
              </p>
            </div>
          )}
        </div>

        {/* Explicit Browse Button */}
        <button
          type="button"
          onClick={handleBrowseClick}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-md border border-uora-border bg-uora-bg text-xs font-mono text-slate-400 hover:border-uora-cyan/40 hover:text-uora-cyan hover:bg-uora-elevated transition-all duration-200"
        >
          <FolderOpen className="w-4 h-4" />
          {file ? "Change File..." : "Browse & Select File..."}
        </button>

        {/* Unsupported file type warning */}
        <AnimatePresence>
          {unsupportedType && (
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-start gap-2 px-4 py-2.5 rounded-md bg-uora-error/5 border border-uora-error/25 text-[11px] font-mono text-uora-error"
            >
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span>
                Unsupported file type: <span className="font-bold">{file?.name}</span>. Please upload a <span className="font-bold">.cpp</span>, <span className="font-bold">.cc</span>, <span className="font-bold">.rs</span>, or <span className="font-bold">.go</span> source file.
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Feedback Messages */}
        <AnimatePresence>
          {submitError && (
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-md bg-uora-error/5 border border-uora-error/25 text-[11px] font-mono text-uora-error"
            >
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              {submitError}
            </motion.div>
          )}
          {submitSuccess && (
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-md bg-uora-success/5 border border-uora-success/25 text-[11px] font-mono text-uora-success"
            >
              <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
              {submitSuccess}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Submit Button */}
        <motion.button
          whileHover={file && language && !isSubmitting ? { scale: 1.01 } : {}}
          whileTap={file && language && !isSubmitting ? { scale: 0.99 } : {}}
          onClick={handleSubmit}
          disabled={!file || !language || isSubmitting || unsupportedType}
          className={cn(
            "w-full py-3 rounded-md font-mono tracking-widest text-xs font-bold uppercase transition-all duration-300",
            file && language && !isSubmitting && !unsupportedType
              ? "bg-uora-cyan text-uora-bg hover:shadow-[0_0_15px_rgba(226,181,62,0.25)] cursor-pointer"
              : "bg-uora-elevated text-slate-600 border border-uora-border cursor-not-allowed"
          )}
        >
          {isSubmitting ? (
            <div className="flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-uora-bg" />
              DEPLOYING SOURCE...
            </div>
          ) : !file ? (
            "SELECT A FILE TO SUBMIT"
          ) : unsupportedType ? (
            "UNSUPPORTED FILE TYPE"
          ) : !language ? (
            "UNABLE TO DETECT LANGUAGE"
          ) : isDemo ? (
            "SIMULATE ENGINE EVALUATION →"
          ) : (
            "TRANSMIT ENGINE FOR EVALUATION"
          )}
        </motion.button>
      </div>
    </div>
  );
}
