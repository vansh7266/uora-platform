"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/useAuthStore";

export function GoogleSignIn() {
  const router = useRouter();
  const { login, setLoading, isLoading } = useAuthStore();

  const handleGoogleSignIn = async () => {
    setLoading(true);

    // Simulate Google OAuth flow with mock user
    // In production, this would redirect to Google OAuth2 consent screen
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const mockUser = {
      id: "user-" + Math.random().toString(36).substr(2, 9),
      name: "Demo User",
      email: "demo@uora.dev",
      avatar: `https://api.dicebear.com/7.x/initials/svg?seed=DU&backgroundColor=06b6d4`,
      team: "Team Alpha",
    };

    login(mockUser);
    router.push("/dashboard");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-uora-bg bg-grid-pattern relative overflow-hidden">
      {/* Background grid animation */}
      <div className="absolute inset-0 bg-grid-pattern opacity-50" />
      <div className="absolute inset-0 bg-gradient-to-b from-uora-cyan/5 via-transparent to-transparent" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative z-10 w-full max-w-md px-6"
      >
        <div className="bg-uora-surface border border-uora-border rounded-2xl p-8 shadow-2xl shadow-black/50">
          {/* Logo */}
          <div className="text-center mb-8">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-uora-cyan to-uora-blue flex items-center justify-center mb-4"
            >
              <span className="text-white font-bold text-2xl font-mono">U</span>
            </motion.div>
            <h1 className="text-2xl font-bold tracking-wider font-mono mb-2">
              UORA
            </h1>
            <p className="text-sm text-slate-400">
              Unified Orderbook Resilience Architecture
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Secure Platform Access
            </p>
          </div>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-uora-border" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-3 bg-uora-surface text-slate-500">
                Sign in to continue
              </span>
            </div>
          </div>

          {/* Google Sign In Button */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleGoogleSignIn}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-3 px-6 py-3.5 rounded-xl bg-white text-gray-900 font-medium text-sm hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
            ) : (
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
            )}
            {isLoading ? "Signing in..." : "Sign in with Google"}
          </motion.button>

          {/* Info */}
          <div className="mt-6 space-y-3">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <div className="w-1.5 h-1.5 rounded-full bg-uora-success" />
              Real-time leaderboard access
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <div className="w-1.5 h-1.5 rounded-full bg-uora-cyan" />
              Code submission & benchmarking
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <div className="w-1.5 h-1.5 rounded-full bg-uora-blue" />
              Anomaly detection dashboard
            </div>
          </div>

          <p className="mt-6 text-center text-xs text-slate-600">
            By signing in, you agree to the UORA Platform Terms of Service
          </p>
        </div>
      </motion.div>
    </div>
  );
}
