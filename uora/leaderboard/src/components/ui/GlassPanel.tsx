"use client";

import { cn } from "@/lib/utils";

interface GlassPanelProps {
  children: React.ReactNode;
  className?: string;
  glow?: boolean;
  elevated?: boolean;
  as?: React.ElementType;
}

export function GlassPanel({
  children,
  className,
  glow = false,
  elevated = false,
  as: Tag = "div",
}: GlassPanelProps) {
  return (
    <Tag
      className={cn(
        "rounded-md overflow-hidden",
        elevated ? "glass-elevated" : "glass",
        glow && "glow-plasma",
        className
      )}
    >
      {children}
    </Tag>
  );
}

export function PanelHeader({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 px-5 py-3.5 border-b border-[rgba(0,212,255,0.07)]",
        className
      )}
    >
      {children}
    </div>
  );
}

export function PanelTitle({
  children,
  icon,
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5">
      {icon && (
        <span className="text-[var(--plasma)] flex-shrink-0 opacity-80">{icon}</span>
      )}
      <span className="label-mono">{children}</span>
    </div>
  );
}
