"use client";

import { cn } from "@/lib/utils";

type BadgeVariant = "plasma" | "bid" | "ask" | "amber" | "violet" | "neutral" | "ghost";

const variants: Record<BadgeVariant, string> = {
  plasma:  "bg-[rgba(0,212,255,0.1)] text-[var(--plasma)] border border-[rgba(0,212,255,0.2)]",
  bid:     "bg-[rgba(22,199,132,0.1)] text-[var(--bid)] border border-[rgba(22,199,132,0.2)]",
  ask:     "bg-[rgba(234,57,67,0.1)] text-[var(--ask)] border border-[rgba(234,57,67,0.2)]",
  amber:   "bg-[rgba(240,185,11,0.1)] text-[#F0B90B] border border-[rgba(240,185,11,0.2)]",
  violet:  "bg-[rgba(124,58,237,0.1)] text-[#A78BFA] border border-[rgba(124,58,237,0.2)]",
  neutral: "bg-[rgba(255,255,255,0.05)] text-[var(--ink-300)] border border-[rgba(255,255,255,0.08)]",
  ghost:   "bg-transparent text-[var(--ink-400)] border border-[rgba(255,255,255,0.06)]",
};

const langVariants: Record<string, BadgeVariant> = {
  cpp:  "plasma",
  rust: "ask",
  go:   "bid",
};

const statusVariants: Record<string, BadgeVariant> = {
  queued:      "neutral",
  building:    "amber",
  built:       "amber",
  deployed:    "amber",
  benchmarking:"plasma",
  validating:  "plasma",
  scored:      "bid",
  failed:      "ask",
};

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
  size?: "xs" | "sm";
}

export function Badge({ children, variant = "neutral", className, size = "xs" }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded font-mono font-semibold uppercase tracking-wider",
        size === "xs" ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-1 text-[10px]",
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  );
}

export function LanguageBadge({ lang }: { lang: string }) {
  const variant = langVariants[lang.toLowerCase()] ?? "neutral";
  return <Badge variant={variant}>{lang}</Badge>;
}

export function StatusBadge({ status }: { status: string }) {
  const variant = statusVariants[status.toLowerCase()] ?? "neutral";
  return <Badge variant={variant}>{status}</Badge>;
}
