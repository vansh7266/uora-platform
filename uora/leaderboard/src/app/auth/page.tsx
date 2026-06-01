"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ArrowRight, Eye, EyeOff, Lock, Mail, Users } from "lucide-react";
import { useAuthStore } from "@/stores/useAuthStore";
import { DEMO_EMAIL, DEMO_PASSWORD, DEMO_USER } from "@/lib/demoData";
import { Logo } from "@/components/ui/Logo";
import { StatusDot } from "@/components/ui/StatusDot";

type Mode = "signin" | "signup";

function GoogleIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57C21.36 18.42 22.56 15.56 22.56 12.25z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

export default function AuthPage() {
  const router = useRouter();
  const { login, setLoading, isLoading } = useAuthStore();

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [team, setTeam] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validateEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email || !password) { setError("Email and password are required"); return; }
    if (!validateEmail(email)) { setError("Enter a valid email address"); return; }

    const isDemo =
      email.trim().toLowerCase() === DEMO_EMAIL && password === DEMO_PASSWORD;

    if (!isDemo && password.length < 10) {
      setError("Password must be at least 10 characters");
      return;
    }
    if (mode === "signup" && !name.trim()) { setError("Full name is required"); return; }
    if (mode === "signup" && !team.trim()) { setError("Team identifier is required"); return; }

    setLoading(true);
    try {
      if (isDemo && mode === "signin") {
        login(DEMO_USER, true);
        router.push("/dashboard");
        return;
      }

      const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const endpoint = mode === "signup" ? `${API}/auth/register` : `${API}/auth/login`;
      const body = mode === "signup"
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
      setError("Authentication service unavailable");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = () => {
    const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    window.location.href = `${API}/auth/google`;
  };

  return (
    <div className="min-h-screen bg-[var(--void-950)] bg-grid-faint flex items-center justify-center p-4 relative overflow-hidden">
      {/* Ambient glow */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] pointer-events-none"
        style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(0,212,255,0.07) 0%, transparent 70%)" }}
      />

      <div className="relative z-10 w-full max-w-[400px]">
        {/* Back link */}
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-[10px] font-mono text-[var(--ink-500)] hover:text-[var(--plasma)] transition-colors uppercase tracking-wider mb-6 group"
        >
          <ArrowLeft className="w-3 h-3 group-hover:-translate-x-0.5 transition-transform" />
          Back to Terminal Hub
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="glass-elevated rounded-lg overflow-hidden shadow-panel-lg"
        >
          {/* Header */}
          <div className="px-8 pt-8 pb-6 text-center border-b border-[rgba(0,212,255,0.07)]">
            <div className="flex justify-center mb-5">
              <Logo size="md" wordmark={false} />
            </div>
            <h1 className="text-lg font-bold font-mono tracking-[0.2em] text-[var(--ink-0)] uppercase mb-1">
              UORA Console
            </h1>
            <p className="text-[10px] font-mono text-[var(--ink-500)] tracking-widest uppercase">
              Matching Engine Benchmarking Platform
            </p>

            {/* Demo hint */}
            <div className="mt-5 px-4 py-3 rounded bg-[rgba(0,212,255,0.04)] border border-[rgba(0,212,255,0.1)]">
              <div className="flex items-center justify-center gap-1.5 mb-1.5">
                <StatusDot status="idle" showLabel={false} />
                <span className="text-[9px] font-mono text-[var(--plasma)] tracking-wider uppercase">Demo Access</span>
              </div>
              <p className="text-[11px] font-mono text-[var(--ink-400)]">
                {DEMO_EMAIL} / {DEMO_PASSWORD}
              </p>
            </div>
          </div>

          {/* Mode toggle */}
          <div className="px-8 pt-6 pb-2">
            <div className="flex bg-[var(--void-800)] rounded p-0.5 border border-[rgba(255,255,255,0.05)]">
              {(["signin", "signup"] as Mode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => { setMode(m); setError(null); }}
                  className={`flex-1 py-2 rounded text-[11px] font-mono font-semibold tracking-wider uppercase transition-all duration-200 ${
                    mode === m
                      ? "bg-[var(--void-600)] text-[var(--plasma)] shadow-inner"
                      : "text-[var(--ink-500)] hover:text-[var(--ink-300)]"
                  }`}
                >
                  {m === "signin" ? "Sign In" : "Register"}
                </button>
              ))}
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="px-8 py-5 space-y-3">
            <AnimatePresence>
              {mode === "signup" && (
                <motion.div
                  key="signup-extra"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-3 overflow-hidden"
                >
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Full name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="input-void"
                    />
                  </div>
                  <div className="relative">
                    <Users className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--ink-500)]" />
                    <input
                      type="text"
                      placeholder="Team ID"
                      value={team}
                      onChange={(e) => setTeam(e.target.value)}
                      className="input-void pl-10"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--ink-500)]" />
              <input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                className="input-void pl-10"
              />
            </div>

            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--ink-500)]" />
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                className="input-void pl-10 pr-11"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--ink-500)] hover:text-[var(--ink-200)] transition-colors"
              >
                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>

            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="px-3.5 py-2.5 rounded bg-[var(--ask-dim)] border border-[var(--ask-border)] text-[11px] font-mono text-[var(--ask)]"
                >
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            <button
              type="submit"
              disabled={isLoading}
              className="btn-plasma w-full mt-1"
            >
              {isLoading ? (
                <div className="w-3.5 h-3.5 border-2 border-[var(--void-950)]/30 border-t-[var(--void-950)] rounded-full animate-spin" />
              ) : (
                <>
                  {mode === "signup" ? "Create Account" : "Sign In"}
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>

            <div className="relative flex items-center gap-3 py-1">
              <div className="flex-1 h-px bg-[rgba(255,255,255,0.06)]" />
              <span className="text-[10px] font-mono text-[var(--ink-500)] uppercase tracking-wider">or</span>
              <div className="flex-1 h-px bg-[rgba(255,255,255,0.06)]" />
            </div>

            <button
              type="button"
              onClick={handleGoogle}
              className="btn-ghost w-full text-xs gap-2.5"
            >
              <GoogleIcon />
              Continue with Google
            </button>
          </form>
        </motion.div>

        <p className="mt-5 text-center text-[9px] font-mono text-[var(--ink-500)] uppercase tracking-widest">
          UORA · IICPC 2026 · SHA-256 / AES-256
        </p>
      </div>
    </div>
  );
}
