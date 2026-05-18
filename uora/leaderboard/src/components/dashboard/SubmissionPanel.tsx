"use client";

import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Upload,
  FileCode2,
  CheckCircle2,
  Loader2,
  XCircle,
  ChevronRight,
  Code2,
} from "lucide-react";
import { useAuthStore } from "@/stores/useAuthStore";
import { useLeaderboardStore } from "@/stores/useLeaderboardStore";
import { cn, getLanguageBg } from "@/lib/utils";

const PIPELINE_STAGES = ["queued", "building", "built", "deployed"] as const;

const LANGUAGE_MAP: Record<string, string> = {
  ".cpp": "C++",
  ".cc": "C++",
  ".cxx": "C++",
  ".rs": "Rust",
  ".go": "Go",
};

function detectLanguage(filename: string): string | null {
  const ext = filename.substring(filename.lastIndexOf("."));
  return LANGUAGE_MAP[ext] || null;
}

export function SubmissionPanel() {
  const { isAuthenticated, user } = useAuthStore();
  const { addSubmission, submissions, updateSubmissionStatus } =
    useLeaderboardStore();
  const [file, setFile] = useState<File | null>(null);
  const [language, setLanguage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleFileSelect = useCallback((selectedFile: File) => {
    setFile(selectedFile);
    const detected = detectLanguage(selectedFile.name);
    setLanguage(detected);
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

  const handleSubmit = async () => {
    if (!file || !language) return;
    setIsSubmitting(true);

    const submissionId =
      "sub-" + Math.random().toString(36).substr(2, 9);

    addSubmission({
      id: submissionId,
      team: user?.team || "Unknown Team",
      language,
      status: "queued",
      submittedAt: Date.now(),
    });

    setFile(null);
    setLanguage(null);
    setIsSubmitting(false);

    // Simulate pipeline progression
    let stageIndex = 0;
    const advanceStage = () => {
      if (stageIndex < PIPELINE_STAGES.length) {
        updateSubmissionStatus(
          submissionId,
          PIPELINE_STAGES[stageIndex] as typeof PIPELINE_STAGES[number]
        );
        stageIndex++;
        if (stageIndex < PIPELINE_STAGES.length) {
          setTimeout(advanceStage, 1500 + Math.random() * 2000);
        }
      }
    };

    setTimeout(advanceStage, 1000);
  };

  if (!isAuthenticated) {
    return (
      <div className="bg-uora-surface border border-uora-border rounded-xl p-8 text-center">
        <FileCode2 className="w-10 h-10 text-slate-600 mx-auto mb-3" />
        <h3 className="text-sm font-semibold text-slate-300 mb-1">
          Submit Your Code
        </h3>
        <p className="text-xs text-slate-500">
          Sign in to submit your trading engine for benchmarking
        </p>
      </div>
    );
  }

  return (
    <div className="bg-uora-surface border border-uora-border rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-uora-border flex items-center gap-2">
        <Upload className="w-4 h-4 text-uora-cyan" />
        <h3 className="text-sm font-semibold">Code Submission</h3>
      </div>

      <div className="p-5">
        {/* Drop Zone */}
        <div
          onDrop={handleDrop}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          className={cn(
            "relative border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200",
            isDragging
              ? "border-uora-cyan bg-uora-cyan/5"
              : "border-uora-border hover:border-uora-cyan/30"
          )}
        >
          <input
            type="file"
            accept=".cpp,.cc,.cxx,.rs,.go"
            onChange={(e) => {
              if (e.target.files?.[0]) handleFileSelect(e.target.files[0]);
            }}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />

          {file ? (
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="space-y-2"
            >
              <Code2 className="w-8 h-8 text-uora-cyan mx-auto" />
              <p className="text-sm text-slate-200 font-medium">{file.name}</p>
              <p className="text-xs text-slate-500">
                {(file.size / 1024).toFixed(1)} KB
              </p>
              {language && (
                <span
                  className={cn(
                    "inline-block px-2 py-0.5 rounded text-[10px] font-mono border mt-1",
                    getLanguageBg(language)
                  )}
                >
                  {language}
                </span>
              )}
            </motion.div>
          ) : (
            <div className="space-y-2">
              <Upload className="w-8 h-8 text-slate-600 mx-auto" />
              <p className="text-sm text-slate-400">
                Drop your code file here
              </p>
              <p className="text-[10px] text-slate-600">
                Supports C++ (.cpp, .cc, .cxx), Rust (.rs), Go (.go)
              </p>
            </div>
          )}
        </div>

        {/* Submit Button */}
        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          onClick={handleSubmit}
          disabled={!file || !language || isSubmitting}
          className={cn(
            "w-full mt-4 py-3 rounded-xl font-medium text-sm transition-all",
            file && language && !isSubmitting
              ? "bg-gradient-to-r from-uora-cyan to-uora-blue text-white glow-cyan-sm hover:shadow-[0_0_25px_rgba(6,182,212,0.3)]"
              : "bg-uora-elevated text-slate-500 cursor-not-allowed"
          )}
        >
          {isSubmitting ? (
            <div className="flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Submitting...
            </div>
          ) : (
            "Submit for Benchmarking"
          )}
        </motion.button>

        {/* Recent Submissions Pipeline */}
        {submissions.length > 0 && (
          <div className="mt-6 space-y-2">
            <h4 className="text-xs text-slate-500 font-medium uppercase tracking-wider">
              Recent Submissions
            </h4>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {submissions.slice(0, 5).map((sub) => (
                <div
                  key={sub.id}
                  className="flex items-center gap-3 p-3 rounded-lg bg-uora-bg border border-uora-border"
                >
                  {/* Pipeline stages */}
                  <div className="flex items-center gap-1">
                    {PIPELINE_STAGES.map((stage, idx) => {
                      const currentIdx = PIPELINE_STAGES.indexOf(
                        sub.status as typeof PIPELINE_STAGES[number]
                      );
                      const isCompleted = idx < currentIdx;
                      const isCurrent = idx === currentIdx;

                      return (
                        <div key={stage} className="flex items-center">
                          <div
                            className={cn(
                              "w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-mono transition-all",
                              isCompleted
                                ? "bg-uora-success text-white"
                                : isCurrent
                                ? "bg-uora-cyan text-white animate-pulse"
                                : "bg-uora-elevated text-slate-500"
                            )}
                          >
                            {isCompleted ? (
                              <CheckCircle2 className="w-3 h-3" />
                            ) : isCurrent &&
                              sub.status === "failed" ? (
                              <XCircle className="w-3 h-3" />
                            ) : (
                              idx + 1
                            )}
                          </div>
                          {idx < PIPELINE_STAGES.length - 1 && (
                            <ChevronRight className="w-3 h-3 text-slate-600 mx-0.5" />
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-slate-300 truncate">
                      {sub.team}
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono">
                      {sub.language} · {sub.id.slice(0, 8)}
                    </div>
                  </div>

                  <span
                    className={cn(
                      "text-[10px] font-mono uppercase",
                      sub.status === "deployed"
                        ? "text-uora-success"
                        : sub.status === "failed"
                        ? "text-uora-error"
                        : sub.status === "building"
                        ? "text-uora-warning"
                        : "text-slate-500"
                    )}
                  >
                    {sub.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
