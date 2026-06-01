import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        void: {
          950: "#010509",
          900: "#03090F",
          800: "#060E1A",
          700: "#0A1525",
          600: "#0E1D33",
          500: "#132540",
          400: "#1A3050",
        },
        plasma: {
          DEFAULT: "#00D4FF",
          50: "rgba(0,212,255,0.05)",
          100: "rgba(0,212,255,0.10)",
          200: "rgba(0,212,255,0.20)",
          300: "rgba(0,212,255,0.30)",
          400: "#33DCFF",
          500: "#00D4FF",
          600: "#00AACC",
          700: "#007F99",
        },
        bid: {
          DEFAULT: "#16C784",
          dim: "rgba(22,199,132,0.12)",
          border: "rgba(22,199,132,0.25)",
        },
        ask: {
          DEFAULT: "#EA3943",
          dim: "rgba(234,57,67,0.12)",
          border: "rgba(234,57,67,0.25)",
        },
        signal: {
          amber: "#F0B90B",
          violet: "#7C3AED",
          sky: "#38BDF8",
        },
        ink: {
          0: "#FFFFFF",
          100: "#F0F6FC",
          200: "#C9D1D9",
          300: "#8B949E",
          400: "#6E7681",
          500: "#484F58",
          600: "#30363D",
          700: "#21262D",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains)", "JetBrains Mono", "monospace"],
      },
      backgroundImage: {
        "dot-grid": "radial-gradient(rgba(0,212,255,0.07) 1px, transparent 1px)",
        "plasma-glow":
          "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(0,212,255,0.08) 0%, transparent 70%)",
        "bid-glow":
          "radial-gradient(ellipse 60% 40% at 20% 50%, rgba(22,199,132,0.06) 0%, transparent 70%)",
        "ask-glow":
          "radial-gradient(ellipse 60% 40% at 80% 50%, rgba(234,57,67,0.06) 0%, transparent 70%)",
      },
      backgroundSize: {
        "dot-24": "24px 24px",
        "dot-32": "32px 32px",
        "dot-40": "40px 40px",
      },
      borderRadius: {
        "2": "2px",
        "3": "3px",
      },
      boxShadow: {
        plasma:
          "0 0 0 1px rgba(0,212,255,0.15), 0 0 20px rgba(0,212,255,0.08)",
        "plasma-lg":
          "0 0 0 1px rgba(0,212,255,0.2), 0 0 40px rgba(0,212,255,0.12)",
        "plasma-ring": "0 0 0 2px rgba(0,212,255,0.4)",
        bid: "0 0 0 1px rgba(22,199,132,0.2), 0 0 16px rgba(22,199,132,0.08)",
        ask: "0 0 0 1px rgba(234,57,67,0.2), 0 0 16px rgba(234,57,67,0.08)",
        panel:
          "0 1px 0 0 rgba(255,255,255,0.04), 0 4px 24px rgba(0,0,0,0.5)",
        "panel-lg":
          "0 1px 0 0 rgba(255,255,255,0.04), 0 8px 48px rgba(0,0,0,0.6)",
        inner: "inset 0 1px 0 0 rgba(255,255,255,0.04)",
      },
      animation: {
        "pulse-plasma": "pulse-plasma 2s ease-in-out infinite",
        "pulse-bid": "pulse-bid 2s ease-in-out infinite",
        "pulse-ask": "pulse-ask 2s ease-in-out infinite",
        "blink": "blink 1.2s step-end infinite",
        "scan-line": "scan-line 4s linear infinite",
        "float-up": "float-up 0.35s ease-out",
        "float-down": "float-down 0.35s ease-out",
        "fade-in": "fade-in 0.4s ease-out forwards",
        "slide-up": "slide-up 0.4s ease-out forwards",
        "slide-down": "slide-down 0.3s ease-out forwards",
        "glow-border": "glow-border 3s ease-in-out infinite",
        "ticker": "ticker 20s linear infinite",
        "number-flash": "number-flash 0.6s ease-out",
      },
      keyframes: {
        "pulse-plasma": {
          "0%, 100%": { opacity: "0.7", boxShadow: "0 0 8px rgba(0,212,255,0.3)" },
          "50%": { opacity: "1", boxShadow: "0 0 20px rgba(0,212,255,0.6)" },
        },
        "pulse-bid": {
          "0%, 100%": { boxShadow: "0 0 6px rgba(22,199,132,0.2)" },
          "50%": { boxShadow: "0 0 16px rgba(22,199,132,0.5)" },
        },
        "pulse-ask": {
          "0%, 100%": { boxShadow: "0 0 6px rgba(234,57,67,0.2)" },
          "50%": { boxShadow: "0 0 16px rgba(234,57,67,0.5)" },
        },
        blink: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0" },
        },
        "scan-line": {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100vh)" },
        },
        "float-up": {
          "0%": { transform: "translateY(0)", opacity: "1" },
          "100%": { transform: "translateY(-12px)", opacity: "0" },
        },
        "float-down": {
          "0%": { transform: "translateY(0)", opacity: "1" },
          "100%": { transform: "translateY(12px)", opacity: "0" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "slide-up": {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "slide-down": {
          "0%": { opacity: "0", transform: "translateY(-8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "glow-border": {
          "0%, 100%": { borderColor: "rgba(0,212,255,0.12)" },
          "50%": { borderColor: "rgba(0,212,255,0.35)" },
        },
        ticker: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        "number-flash": {
          "0%": { color: "#00D4FF" },
          "100%": { color: "inherit" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
