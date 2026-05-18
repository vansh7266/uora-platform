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
        uora: {
          bg: "#0A0E1A",
          surface: "#111827",
          elevated: "#1E293B",
          cyan: "#06B6D4",
          blue: "#3B82F6",
          success: "#10B981",
          warning: "#F59E0B",
          error: "#EF4444",
          border: "#1E293B",
          "border-light": "#334155",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains)", "JetBrains Mono", "monospace"],
      },
      animation: {
        "glitch": "glitch 0.3s ease-in-out",
        "glitch-reveal": "glitch-reveal 0.5s ease-out forwards",
        "breathing": "breathing 4s ease-in-out infinite",
        "liquid-fill": "liquid-fill 1.5s ease-out forwards",
        "pulse-cyan": "pulse-cyan 2s ease-in-out infinite",
        "pulse-red": "pulse-red 1s ease-in-out infinite",
        "float-up": "float-up 0.4s ease-out",
        "float-down": "float-down 0.4s ease-out",
        "fade-up": "fade-up 0.6s ease-out forwards",
        "fade-in": "fade-in 0.5s ease-out forwards",
        "slide-in-right": "slide-in-right 0.3s ease-out",
        "screen-shake": "screen-shake 0.3s ease-in-out",
        "score-reveal": "score-reveal 1s ease-out forwards",
        "grid-flow": "grid-flow 20s linear infinite",
      },
      keyframes: {
        glitch: {
          "0%": { transform: "translate(0)" },
          "20%": { transform: "translate(-2px, 2px)" },
          "40%": { transform: "translate(-2px, -2px)" },
          "60%": { transform: "translate(2px, 2px)" },
          "80%": { transform: "translate(2px, -2px)" },
          "100%": { transform: "translate(0)" },
        },
        "glitch-reveal": {
          "0%": { opacity: "0", transform: "translateY(10px)", filter: "blur(4px)" },
          "50%": { opacity: "1", filter: "blur(0px)" },
          "60%": { transform: "translateX(-2px)", filter: "blur(1px)" },
          "70%": { transform: "translateX(2px)" },
          "100%": { opacity: "1", transform: "translateY(0)", filter: "blur(0px)" },
        },
        breathing: {
          "0%, 100%": { borderColor: "rgba(6, 182, 212, 0.2)", boxShadow: "0 0 10px rgba(6, 182, 212, 0.1)" },
          "50%": { borderColor: "rgba(6, 182, 212, 0.5)", boxShadow: "0 0 20px rgba(6, 182, 212, 0.2)" },
        },
        "liquid-fill": {
          "0%": { clipPath: "inset(100% 0 0 0)" },
          "100%": { clipPath: "inset(0 0 0 0)" },
        },
        "pulse-cyan": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(6, 182, 212, 0.4)" },
          "50%": { boxShadow: "0 0 20px 5px rgba(6, 182, 212, 0.2)" },
        },
        "pulse-red": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(239, 68, 68, 0.4)" },
          "50%": { boxShadow: "0 0 30px 10px rgba(239, 68, 68, 0.3)" },
        },
        "float-up": {
          "0%": { transform: "translateY(0)", opacity: "1" },
          "100%": { transform: "translateY(-8px)", opacity: "1" },
        },
        "float-down": {
          "0%": { transform: "translateY(0)", opacity: "1" },
          "100%": { transform: "translateY(8px)", opacity: "1" },
        },
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "slide-in-right": {
          "0%": { transform: "translateX(20px)", opacity: "0" },
          "100%": { transform: "translateX(0)", opacity: "1" },
        },
        "screen-shake": {
          "0%, 100%": { transform: "translateX(0)" },
          "10%": { transform: "translateX(-3px)" },
          "20%": { transform: "translateX(3px)" },
          "30%": { transform: "translateX(-2px)" },
          "40%": { transform: "translateX(2px)" },
          "50%": { transform: "translateX(-1px)" },
        },
        "score-reveal": {
          "0%": { opacity: "0", transform: "scale(0.5)" },
          "60%": { opacity: "1", transform: "scale(1.1)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        "grid-flow": {
          "0%": { transform: "translateY(0)" },
          "100%": { transform: "translateY(-50%)" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
