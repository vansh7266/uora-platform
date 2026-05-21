"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/useAuthStore";
import {
  Mail,
  Lock,
  User,
  Users,
  Eye,
  EyeOff,
  ArrowRight,
  Shield,
  Zap,
  Brain,
} from "lucide-react";
import { UoraLogo } from "@/components/ui/UoraLogo";

type AuthMode = "signin" | "signup";

export default function AuthPage() {
  const router = useRouter();
  const { login, setLoading, isLoading } = useAuthStore();

  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [team, setTeam] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validateEmail = (email: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!email || !password) {
      setError("Email and password are required");
      return;
    }
    if (!validateEmail(email)) {
      setError("Please enter a valid email address");
      return;
    }
    if (password.length < 10) {
      setError("Password must be at least 10 characters");
      return;
    }
    if (mode === "signup" && !name.trim()) {
      setError("Name is required for sign up");
      return;
    }
    if (mode === "signup" && !team.trim()) {
      setError("Team name is required for sign up");
      return;
    }

    setLoading(true);

    try {
      const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const endpoint =
        mode === "signup"
          ? `${API_BASE}/auth/register`
          : `${API_BASE}/auth/login`;

      const body =
        mode === "signup"
          ? { email, password, name: name.trim(), team: team.trim() }
          : { email, password };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const data = await res.json();
        login({
          id: data.user?.id || `user-${Date.now()}`,
          name: data.user?.name || name || email.split("@")[0],
          email: data.user?.email || email,
          avatar: "",
          team: data.user?.team || team || "Solo",
        });
        router.push("/dashboard");
        return;
      }

      const errData = await res.json().catch(() => null);
      setError(errData?.detail || `Authentication failed (${res.status})`);
    } catch {
      setError("Authentication service is unavailable. Please try again after the API is healthy.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = () => {
    const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    window.location.href = `${API_BASE}/auth/google`;
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#060a0f] bg-grid-pattern relative overflow-hidden">
      <div className="absolute inset-0 bg-grid-pattern opacity-50" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(6,182,212,0.08)_0%,rgba(6,10,15,0)_38%,rgba(16,185,129,0.04)_100%)]" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative z-10 w-full max-w-md px-6"
      >
        <div className="bg-[#0d131c] border border-[#1f2d3d] rounded-lg overflow-hidden shadow-2xl shadow-black/50">
          {/* Header */}
          <div className="px-8 pt-8 pb-6 text-center">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="flex justify-center mb-4"
            >
              <UoraLogo size="lg" showWordmark={false} />
            </motion.div>
            <h1 className="text-2xl font-bold tracking-wider font-mono mb-1">
              UORA
            </h1>
            <p className="text-sm text-slate-400">
              Unified Orderbook Resilience Architecture
            </p>
          </div>

          {/* Mode Toggle */}
          <div className="px-8 mb-6">
            <div className="flex bg-[#070b11] rounded-lg p-1 border border-[#1f2d3d]">
              <button
                onClick={() => {
                  setMode("signin");
                  setError(null);
                }}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  mode === "signin"
                    ? "bg-uora-elevated text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-300"
                }`}
              >
                Sign In
              </button>
              <button
                onClick={() => {
                  setMode("signup");
                  setError(null);
                }}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  mode === "signup"
                    ? "bg-uora-elevated text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-300"
                }`}
              >
                Sign Up
              </button>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="px-8 pb-6 space-y-4">
            <AnimatePresence mode="wait">
              {mode === "signup" && (
                <motion.div
                  key="signup-fields"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-4 overflow-hidden"
                >
                  {/* Full Name */}
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      id="auth-name"
                      type="text"
                      placeholder="Full Name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full pl-11 pr-4 py-3 rounded-xl bg-uora-bg border border-uora-border text-sm text-slate-200 placeholder:text-slate-600 focus:border-uora-cyan/50 focus:ring-1 focus:ring-uora-cyan/20 outline-none transition-all"
                    />
                  </div>

                  {/* Team Name */}
                  <div className="relative">
                    <Users className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      id="auth-team"
                      type="text"
                      placeholder="Team Name"
                      value={team}
                      onChange={(e) => setTeam(e.target.value)}
                      className="w-full pl-11 pr-4 py-3 rounded-xl bg-uora-bg border border-uora-border text-sm text-slate-200 placeholder:text-slate-600 focus:border-uora-cyan/50 focus:ring-1 focus:ring-uora-cyan/20 outline-none transition-all"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Email */}
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                id="auth-email"
                type="email"
                placeholder="Email Address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-11 pr-4 py-3 rounded-xl bg-uora-bg border border-uora-border text-sm text-slate-200 placeholder:text-slate-600 focus:border-uora-cyan/50 focus:ring-1 focus:ring-uora-cyan/20 outline-none transition-all"
                autoComplete="email"
              />
            </div>

            {/* Password */}
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                id="auth-password"
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-11 pr-12 py-3 rounded-xl bg-uora-bg border border-uora-border text-sm text-slate-200 placeholder:text-slate-600 focus:border-uora-cyan/50 focus:ring-1 focus:ring-uora-cyan/20 outline-none transition-all"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>

            {/* Error */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  className="px-4 py-2.5 rounded-xl bg-uora-error/10 border border-uora-error/20 text-xs text-uora-error"
                >
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Submit */}
            <motion.button
              type="submit"
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              disabled={isLoading}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-uora-cyan to-uora-blue text-white font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:shadow-[0_0_25px_rgba(6,182,212,0.3)]"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  {mode === "signup" ? "Create Account" : "Sign In"}
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </motion.button>

            {/* Divider */}
            <div className="relative my-2">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-uora-border" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="px-3 bg-uora-surface text-slate-500">
                  or continue with
                </span>
              </div>
            </div>

            {/* Google OAuth */}
            <motion.button
              type="button"
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              onClick={handleGoogleSignIn}
              className="w-full flex items-center justify-center gap-3 px-6 py-3 rounded-xl bg-white/5 border border-uora-border text-slate-300 text-sm hover:bg-white/10 hover:border-uora-border-light transition-all"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              Sign in with Google
            </motion.button>
          </form>

          {/* Features footer */}
          <div className="px-8 py-5 border-t border-uora-border bg-uora-bg/30">
            <div className="grid grid-cols-3 gap-3">
              {[
                { icon: Shield, label: "Sandboxed" },
                { icon: Zap, label: "Real-time" },
                { icon: Brain, label: "ML Detection" },
              ].map(({ icon: Icon, label }) => (
                <div
                  key={label}
                  className="flex flex-col items-center gap-1.5 text-slate-500"
                >
                  <Icon className="w-4 h-4 text-uora-cyan/60" />
                  <span className="text-[10px] font-mono">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-slate-600">
          By continuing, you agree to the UORA Platform Terms of Service
        </p>
      </motion.div>
    </div>
  );
}
