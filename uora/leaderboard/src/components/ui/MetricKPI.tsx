"use client";

import { cn } from "@/lib/utils";

interface MetricKPIProps {
  label: string;
  value: string | number;
  sub?: string;
  delta?: number;
  color?: "plasma" | "bid" | "ask" | "amber" | "white";
  icon?: React.ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg";
}

const colorMap = {
  plasma: "text-[var(--plasma)]",
  bid: "text-[var(--bid)]",
  ask: "text-[var(--ask)]",
  amber: "text-[#F0B90B]",
  white: "text-[var(--ink-100)]",
};

const sizeMap = {
  sm: "text-xl",
  md: "text-2xl",
  lg: "text-3xl sm:text-4xl",
};

export function MetricKPI({
  label,
  value,
  sub,
  delta,
  color = "white",
  icon,
  className,
  size = "md",
}: MetricKPIProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="label-mono flex items-center gap-1.5">
        {icon && <span className="opacity-60">{icon}</span>}
        {label}
      </div>
      <div className={cn("font-mono font-bold tabnum leading-none", colorMap[color], sizeMap[size])}>
        {value}
      </div>
      {(sub || delta !== undefined) && (
        <div className="flex items-center gap-2">
          {sub && <span className="text-xs text-[var(--ink-400)] font-mono">{sub}</span>}
          {delta !== undefined && (
            <span
              className={cn(
                "text-[10px] font-mono font-semibold",
                delta > 0 ? "text-[var(--bid)]" : delta < 0 ? "text-[var(--ask)]" : "text-[var(--ink-400)]"
              )}
            >
              {delta > 0 ? "+" : ""}
              {delta.toFixed(1)}%
            </span>
          )}
        </div>
      )}
    </div>
  );
}
