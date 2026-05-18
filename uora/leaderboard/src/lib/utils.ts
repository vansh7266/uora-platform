import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatLatency(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(0)}μs`;
  if (ms < 1000) return `${ms.toFixed(2)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function formatThroughput(tps: number): string {
  if (tps >= 1_000_000) return `${(tps / 1_000_000).toFixed(1)}M`;
  if (tps >= 1_000) return `${(tps / 1_000).toFixed(1)}K`;
  return tps.toFixed(0);
}

export function formatScore(score: number): string {
  return score.toFixed(2);
}

export function getScoreColor(score: number): string {
  if (score >= 90) return "text-uora-cyan";
  if (score >= 70) return "text-uora-success";
  if (score >= 50) return "text-uora-warning";
  return "text-uora-error";
}

export function getLatencyColor(ms: number): string {
  if (ms <= 1) return "text-uora-success";
  if (ms <= 5) return "text-uora-cyan";
  if (ms <= 20) return "text-uora-warning";
  return "text-uora-error";
}

export function getLanguageColor(lang: string): string {
  switch (lang.toLowerCase()) {
    case "c++":
    case "cpp":
      return "#3B82F6";
    case "rust":
      return "#F97316";
    case "go":
      return "#06B6D4";
    default:
      return "#94A3B8";
  }
}

export function getLanguageBg(lang: string): string {
  switch (lang.toLowerCase()) {
    case "c++":
    case "cpp":
      return "bg-blue-500/10 text-blue-400 border-blue-500/20";
    case "rust":
      return "bg-orange-500/10 text-orange-400 border-orange-500/20";
    case "go":
      return "bg-cyan-500/10 text-cyan-400 border-cyan-500/20";
    default:
      return "bg-slate-500/10 text-slate-400 border-slate-500/20";
  }
}
