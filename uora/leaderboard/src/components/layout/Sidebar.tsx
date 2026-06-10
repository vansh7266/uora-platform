"use client";

import { motion } from "framer-motion";
import {
  Activity,
  BarChart2,
  Clock,
  FileText,
  LayoutDashboard,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type SidebarSection =
  | "submit"
  | "timeline"
  | "leaderboard"
  | "latency"
  | "validation"
  | "reports";

const LINKS: { id: SidebarSection; label: string; icon: React.ElementType; badge?: string }[] = [
  { id: "submit",      label: "Submit",      icon: Upload },
  { id: "timeline",    label: "Timeline",    icon: Clock },
  { id: "leaderboard", label: "Leaderboard", icon: LayoutDashboard },
  { id: "latency",     label: "Latency",     icon: Activity },
  { id: "validation",  label: "Validation",  icon: ShieldCheck },
  { id: "reports",     label: "Reports",     icon: FileText },
];

interface SidebarProps {
  active: SidebarSection;
  onChange: (s: SidebarSection) => void;
}

export function Sidebar({ active, onChange }: SidebarProps) {
  return (
    <aside className="fixed left-0 top-12 bottom-0 z-40 w-[200px] flex flex-col border-r border-[rgba(255,255,255,0.05)] bg-[rgba(3,9,15,0.98)]">
      <div className="px-3 py-4">
        <div className="label-mono mb-3 px-2">Operations</div>
        <nav className="flex flex-col gap-0.5">
          {LINKS.map((link) => {
            const isActive = active === link.id;
            return (
              <button
                key={link.id}
                onClick={() => onChange(link.id)}
                className={cn(
                  "relative w-full flex items-center gap-2.5 px-3 py-2 rounded text-sm font-mono transition-all duration-150 text-left",
                  isActive
                    ? "text-[var(--plasma)] bg-[rgba(0,212,255,0.06)]"
                    : "text-[var(--ink-400)] hover:text-[var(--ink-200)] hover:bg-[var(--void-700)]"
                )}
              >
                {isActive && (
                  <motion.div
                    layoutId="sidebar-indicator"
                    className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full bg-[var(--plasma)]"
                    transition={{ type: "spring", stiffness: 500, damping: 35 }}
                  />
                )}
                <link.icon className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="text-xs font-medium">{link.label}</span>
                {link.badge && (
                  <span className="ml-auto text-[9px] font-mono px-1.5 py-0.5 rounded bg-[rgba(0,212,255,0.1)] text-[var(--plasma)] border border-[rgba(0,212,255,0.15)]">
                    {link.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom section */}
      <div className="mt-auto p-3 border-t border-[rgba(255,255,255,0.04)]">
        <div className="px-3 py-2 rounded bg-[var(--void-700)] border border-[rgba(0,212,255,0.07)]">
          <div className="label-mono mb-1">Platform</div>
          <div className="text-[10px] font-mono text-[var(--ink-500)]">UORA v2.0</div>
          <div className="text-[10px] font-mono text-[var(--ink-500)]">Production build</div>
        </div>
      </div>
    </aside>
  );
}
