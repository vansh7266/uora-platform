"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { LogOut, Radio } from "lucide-react";
import { useAuthStore } from "@/stores/useAuthStore";
import { useLeaderboardStore } from "@/stores/useLeaderboardStore";
import { Logo } from "@/components/ui/Logo";
import { StatusDot } from "@/components/ui/StatusDot";

export function TopBar() {
  const { user, isAuthenticated, logout } = useAuthStore();
  const { connected, lastUpdated } = useLeaderboardStore();

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-12 flex items-center border-b border-[rgba(255,255,255,0.05)] bg-[rgba(1,5,9,0.95)] backdrop-blur-xl">
      <div className="flex items-center h-full px-4 border-r border-[rgba(255,255,255,0.05)] w-[200px] flex-shrink-0">
        <Link href="/">
          <Logo size="xs" />
        </Link>
      </div>

      <div className="flex-1 flex items-center justify-between px-4 min-w-0">
        {/* Status indicators */}
        <div className="flex items-center gap-4">
          <StatusDot
            status={connected ? "live" : "offline"}
            label={connected ? "SSE LIVE" : "OFFLINE"}
          />
          {lastUpdated && (
            <span className="hidden sm:block text-[10px] font-mono text-[var(--ink-500)]">
              TICK:{" "}
              <span className="text-[var(--ink-400)]">
                {new Date(lastUpdated).toLocaleTimeString("en-US", {
                  hour12: false,
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </span>
            </span>
          )}
        </div>

        {/* User */}
        {isAuthenticated && user ? (
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded glass text-[11px] font-mono">
              <span className="w-5 h-5 rounded bg-[rgba(0,212,255,0.12)] border border-[rgba(0,212,255,0.2)] flex items-center justify-center text-[9px] font-bold text-[var(--plasma)] flex-shrink-0">
                {(user.name || user.email)[0]?.toUpperCase()}
              </span>
              <span className="text-[var(--ink-300)] max-w-[120px] truncate">{user.name || user.email}</span>
            </div>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={logout}
              title="Sign out"
              className="p-1.5 rounded text-[var(--ink-500)] hover:text-[var(--ink-200)] hover:bg-[var(--void-700)] transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
            </motion.button>
          </div>
        ) : (
          <Link href="/auth" className="btn-ghost text-[10px] px-3 py-1.5">
            Sign In
          </Link>
        )}
      </div>
    </header>
  );
}
