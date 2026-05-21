"use client";

import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  Activity,
  BarChart3,
  LayoutDashboard,
  Radar,
  Upload,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

const sidebarLinks = [
  {
    href: "/dashboard",
    label: "Leaderboard",
    icon: LayoutDashboard,
    section: "overview",
  },
  {
    href: "/dashboard",
    label: "Latency",
    icon: Activity,
    section: "latency",
  },
  {
    href: "/dashboard",
    label: "Throughput",
    icon: BarChart3,
    section: "throughput",
  },
  {
    href: "/dashboard",
    label: "Anomaly",
    icon: Radar,
    section: "anomaly",
  },
  {
    href: "/dashboard",
    label: "Market Replay",
    icon: TrendingUp,
    section: "market",
  },
  {
    href: "/dashboard",
    label: "Submit",
    icon: Upload,
    section: "submit",
  },
];

interface SidebarProps {
  activeSection: string;
  onSectionChange: (section: string) => void;
}

export function Sidebar({ activeSection, onSectionChange }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  if (pathname !== "/dashboard") return null;

  return (
    <motion.aside
      initial={{ x: -20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      className="fixed left-0 top-16 bottom-0 z-40 hidden lg:flex flex-col border-r border-[#1b2533] bg-[#080d13]/95 backdrop-blur-xl"
      style={{ width: collapsed ? 68 : 224 }}
    >
      {!collapsed && (
        <div className="border-b border-[#1b2533] px-4 py-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">
            Operations
          </div>
        </div>
      )}
      <div className="flex-1 py-4 space-y-1 px-2 overflow-y-auto">
        {sidebarLinks.map((link) => {
          const isActive = activeSection === link.section;
          return (
            <button
              key={link.section}
              onClick={() => onSectionChange(link.section)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                isActive
                  ? "text-uora-cyan bg-uora-cyan/10 shadow-[inset_3px_0_0_rgba(6,182,212,0.85),inset_0_0_0_1px_rgba(6,182,212,0.16)]"
                  : "text-slate-400 hover:text-slate-200 hover:bg-[#101722]"
              )}
            >
              <link.icon className="w-4 h-4 flex-shrink-0" />
              {!collapsed && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.05 }}
                >
                  {link.label}
                </motion.span>
              )}
            </button>
          );
        })}
      </div>

      {/* Collapse Toggle */}
      <div className="p-2 border-t border-uora-border">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center justify-center p-2 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-uora-elevated transition-colors"
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </button>
      </div>
    </motion.aside>
  );
}
