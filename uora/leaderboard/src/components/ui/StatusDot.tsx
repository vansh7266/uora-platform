"use client";

import { cn } from "@/lib/utils";

type StatusVariant = "live" | "offline" | "warning" | "building" | "idle";

const variantMap: Record<StatusVariant, { dot: string; label: string }> = {
  live:     { dot: "bg-[var(--bid)] animate-pulse-bid shadow-[0_0_6px_var(--bid)]", label: "text-[var(--bid)]" },
  offline:  { dot: "bg-[var(--ask)]", label: "text-[var(--ask)]" },
  warning:  { dot: "bg-[#F0B90B] animate-pulse", label: "text-[#F0B90B]" },
  building: { dot: "bg-[var(--plasma)] animate-pulse", label: "text-[var(--plasma)]" },
  idle:     { dot: "bg-[var(--ink-500)]", label: "text-[var(--ink-400)]" },
};

interface StatusDotProps {
  status: StatusVariant;
  label?: string;
  className?: string;
  showLabel?: boolean;
}

export function StatusDot({ status, label, className, showLabel = true }: StatusDotProps) {
  const v = variantMap[status];
  return (
    <div className={cn("inline-flex items-center gap-1.5", className)}>
      <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", v.dot)} />
      {showLabel && label && (
        <span className={cn("text-[10px] font-mono font-semibold tracking-wider uppercase", v.label)}>
          {label}
        </span>
      )}
    </div>
  );
}
