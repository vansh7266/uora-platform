"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  LogOut,
  Menu,
  Shield,
  X,
} from "lucide-react";
import { useAuthStore } from "@/stores/useAuthStore";
import { useLeaderboardStore } from "@/stores/useLeaderboardStore";
import { cn } from "@/lib/utils";
import { useState } from "react";

const navLinks = [
  { href: "/", label: "Home", icon: Shield },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
];

export function Navbar() {
  const pathname = usePathname();
  const { user, isAuthenticated, logout } = useAuthStore();
  const { connected } = useLeaderboardStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-uora-border bg-uora-bg/80 backdrop-blur-xl">
      <div className="max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="relative">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-uora-cyan to-uora-blue flex items-center justify-center">
                <span className="text-white font-bold text-sm font-mono">U</span>
              </div>
              <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-uora-cyan to-uora-blue opacity-0 group-hover:opacity-50 blur-md transition-opacity" />
            </div>
            <span className="text-lg font-bold tracking-wider font-mono">
              UORA
            </span>
          </Link>

          {/* Desktop Nav Links */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "relative px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                    isActive
                      ? "text-uora-cyan"
                      : "text-slate-400 hover:text-slate-200 hover:bg-uora-elevated"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <link.icon className="w-4 h-4" />
                    {link.label}
                  </div>
                  {isActive && (
                    <motion.div
                      layoutId="navbar-indicator"
                      className="absolute bottom-0 left-2 right-2 h-0.5 bg-uora-cyan rounded-full"
                      transition={{ type: "spring", stiffness: 500, damping: 30 }}
                    />
                  )}
                </Link>
              );
            })}
          </div>

          {/* Right Section */}
          <div className="flex items-center gap-3">
            {/* Connection Status */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-uora-surface border border-uora-border">
              <div
                className={cn(
                  "w-2 h-2 rounded-full",
                  connected
                    ? "bg-uora-success animate-pulse"
                    : "bg-uora-error"
                )}
              />
              <span className="text-xs font-mono text-slate-400">
                {connected ? "LIVE" : "OFFLINE"}
              </span>
            </div>

            {/* User Section */}
            {isAuthenticated && user ? (
              <div className="flex items-center gap-3">
                <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-uora-surface border border-uora-border">
                  <Image
                    src={user.avatar}
                    alt={user.name}
                    width={20}
                    height={20}
                    className="w-5 h-5 rounded-full"
                  />
                  <span className="text-xs text-slate-300">{user.name}</span>
                </div>
                <button
                  onClick={logout}
                  className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-uora-elevated transition-colors"
                  title="Sign out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <Link
                href="/auth"
                className="px-4 py-2 rounded-lg bg-uora-cyan/10 border border-uora-cyan/20 text-uora-cyan text-sm font-medium hover:bg-uora-cyan/20 transition-colors"
              >
                Sign In
              </Link>
            )}

            {/* Mobile Menu Toggle */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-uora-elevated transition-colors"
            >
              {mobileMenuOpen ? (
                <X className="w-5 h-5" />
              ) : (
                <Menu className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden border-t border-uora-border bg-uora-bg/95 backdrop-blur-xl overflow-hidden"
          >
            <div className="px-4 py-3 space-y-1">
              {navLinks.map((link) => {
                const isActive = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                      isActive
                        ? "text-uora-cyan bg-uora-cyan/10"
                        : "text-slate-400 hover:text-slate-200 hover:bg-uora-elevated"
                    )}
                  >
                    <link.icon className="w-4 h-4" />
                    {link.label}
                  </Link>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
