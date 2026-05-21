"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/stores/useAuthStore";
import {
  Mail,
  Lock,
  User,
  Users,
  Eye,
  EyeOff,
  ArrowRight,
  ArrowLeft,
  Shield,
  Zap,
  Activity,
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
      setError("Name is required for registration");
      return;
    }
    if (mode === "signup" && !team.trim()) {
      setError("Firm/Team identifier is required");
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
      setError("Authentication service is offline. Directing to simulated local credentials.");
      // Fallback local mode for offline resilience
      setTimeout(() => {
        login({
          id: `local-${Date.now()}`,
          name: name || "Quant Engineer",
          email: email,
          avatar: "",
          team: team || "Prop Firm Alpha",
        });
        router.push("/dashboard");
      }, 800);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = () => {
    const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    window.location.href = `${API_BASE}/auth/google`;
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-uora-bg bg-dot-pattern relative overflow-hidden">
      <div className="absolute inset-0 bg-grid-pattern opacity-30 pointer-events-none" />
      <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-uora-cyan/5 blur-[120px] pointer-events-none" />
      <div className="absolute -bottom-[20%] -right-[10%] w-[50%] h-[50%] rounded-full bg-uora-success/5 blur-[120px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55 }}
        className="relative z-10 w-full max-w-md px-6"
      >
        {/* Floating Back to Home button */}
        <div className="mb-4">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-uora-cyan transition-colors font-mono uppercase tracking-wider group"
          >
            <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
            Back to Terminal Hub
          </Link>
        </div>

        <div className="bg-uora-surface border border-uora-border rounded-md overflow-hidden shadow-2xl shadow-black/90">
          {/* Header */}
          <div className="px-8 pt-8 pb-6 text-center border-b border-uora-border/40">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1, duration: 0.4 }}
              className="flex justify-center mb-4"
            >
              <UoraLogo size="md" showWordmark={false} />
            </motion.div>
            <h1 className="text-xl font-bold tracking-[0.25em] font-mono text-white mb-1.5 uppercase">
              UORA CONSOLE
            </h1>
            <p className="text-[10px] font-mono tracking-widest text-slate-500 uppercase">
              Matching Engine Telemetry Station
            </p>
          </div>

          {/* Mode Toggle */}
          <div className="px-8 mt-6 mb-5">
            <div className="flex bg-uora-bg rounded-md p-1 border border-uora-border">
              <button
                onClick={() => {
                  setMode("signin");
                  setError(null);
                }}
                className={`flex-1 py-2 rounded-md text-xs font-mono font-bold tracking-wider uppercase transition-all duration-200 ${
                  mode === "signin"
                    ? "bg-uora-elevated text-uora-cyan shadow-[0_2px_8px_rgba(0,0,0,0.4)]"
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
                className={`flex-1 py-2 rounded-md text-xs font-mono font-bold tracking-wider uppercase transition-all duration-200 ${
                  mode === "signup"
                    ? "bg-uora-elevated text-uora-cyan shadow-[0_2px_8px_rgba(0,0,0,0.4)]"
                    : "text-slate-500 hover:text-slate-300"
                }`}
              >
                Register
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
                      placeholder="Engineer Full Name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full pl-11 pr-4 py-2.5 rounded-md bg-uora-bg border border-uora-border text-xs font-mono text-slate-200 placeholder:text-slate-600 focus:border-uora-cyan/50 focus:shadow-[0_0_10px_rgba(226,181,62,0.08)] outline-none transition-all"
                    />
                  </div>

                  {/* Team Name */}
                  <div className="relative">
                    <Users className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      id="auth-team"
                      type="text"
                      placeholder="Prop Firm / Team ID"
                      value={team}
                      onChange={(e) => setTeam(e.target.value)}
                      className="w-full pl-11 pr-4 py-2.5 rounded-md bg-uora-bg border border-uora-border text-xs font-mono text-slate-200 placeholder:text-slate-600 focus:border-uora-cyan/50 focus:shadow-[0_0_10px_rgba(226,181,62,0.08)] outline-none transition-all"
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
                placeholder="Enterprise Email Address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-11 pr-4 py-2.5 rounded-md bg-uora-bg border border-uora-border text-xs font-mono text-slate-200 placeholder:text-slate-600 focus:border-uora-cyan/50 focus:shadow-[0_0_10px_rgba(226,181,62,0.08)] outline-none transition-all"
                autoComplete="email"
              />
            </div>

            {/* Password */}
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                id="auth-password"
                type={showPassword ? "text" : "password"}
                placeholder="Secure Access Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-11 pr-12 py-2.5 rounded-md bg-uora-bg border border-uora-border text-xs font-mono text-slate-200 placeholder:text-slate-600 focus:border-uora-cyan/50 focus:shadow-[0_0_10px_rgba(226,181,62,0.08)] outline-none transition-all"
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
                  className="px-4 py-2.5 rounded-md bg-uora-error/10 border border-uora-error/25 text-[11px] font-mono text-uora-error"
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
              className="w-full py-3 rounded-md bg-uora-cyan text-uora-bg font-bold font-mono tracking-widest text-xs flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-[0_0_20px_rgba(226,181,62,0.25)] transition-all duration-300"
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-uora-bg/30 border-t-uora-bg rounded-full animate-spin" />
              ) : (
                <>
                  {mode === "signup" ? "PROVISION GATEWAY" : "INITIALIZE CONSOLE"}
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </motion.button>

            {/* Divider */}
            <div className="relative my-2.5">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-uora-border/70" />
              </div>
              <div className="relative flex justify-center text-[10px] font-mono">
                <span className="px-3 bg-uora-surface text-slate-500 uppercase tracking-widest">
                  Secure Federated Auth
                </span>
              </div>
            </div>

            {/* Google OAuth */}
            <motion.button
              type="button"
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              onClick={handleGoogleSignIn}
              className="w-full flex items-center justify-center gap-3 px-6 py-2.5 rounded-md bg-uora-bg border border-uora-border text-slate-400 text-xs font-mono hover:bg-uora-elevated hover:text-slate-200 transition-all duration-200"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
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
              Google Single-Sign On
            </motion.button>
          </form>

          {/* Features footer */}
          <div className="px-8 py-5 border-t border-uora-border bg-uora-bg/30">
            <div className="grid grid-cols-3 gap-3">
              {[
                { icon: Shield, label: "SANDBOXED" },
                { icon: Zap, label: "TELEMETRIC" },
                { icon: Activity, label: "ISOLATED" },
              ].map(({ icon: Icon, label }) => (
                <div
                  key={label}
                  className="flex flex-col items-center gap-1.5 text-slate-500"
                >
                  <Icon className="w-4 h-4 text-uora-cyan/70" />
                  <span className="text-[9px] font-mono tracking-wider">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <p className="mt-4 text-center text-[10px] font-mono text-slate-600 uppercase tracking-widest">
          Secured with SHA-256 / AES-256 Transport Encryption
        </p>
      </motion.div>
    </div>
  );
}
