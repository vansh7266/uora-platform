"use client";

import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface UoraLogoProps {
  size?: "sm" | "md" | "lg";
  showWordmark?: boolean;
  className?: string;
}

const sizeMap = {
  sm: { box: "h-10 w-10", text: "text-xl", sub: "text-[8px]" },
  md: { box: "h-12 w-12", text: "text-2xl", sub: "text-[9px]" },
  lg: { box: "h-16 w-16", text: "text-4xl", sub: "text-[10px]" },
};

export function UoraLogo({ size = "md", showWordmark = true, className }: UoraLogoProps) {
  const token = sizeMap[size];

  return (
    <div className={cn("flex items-center gap-3.5 select-none", className)} aria-label="UORA">
      <div className={cn("relative grid place-items-center", token.box)}>
        {/* Outer pulsing gold/mint ring aura */}
        <motion.div
          className="absolute inset-0 rounded-lg border border-uora-cyan/40 bg-gradient-to-br from-uora-cyan/10 to-uora-cyan/5 shadow-[0_0_30px_rgba(16,185,129,0.2)]"
          animate={{
            scale: [1, 1.08, 1],
            opacity: [0.5, 0.8, 0.5],
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />

        <div className="relative h-full w-full overflow-hidden rounded-lg border border-uora-border/50 bg-gradient-to-br from-slate-900 to-slate-800 shadow-[inset_0_2px_4px_rgba(0,0,0,0.3),0_0_20px_rgba(16,185,129,0.1)] hover:border-uora-cyan/60 hover:shadow-[0_0_30px_rgba(16,185,129,0.3)] transition-all duration-500">
          <svg viewBox="0 0 48 48" className="h-full w-full p-2" role="img" aria-hidden>
            <defs>
              <linearGradient id="logo-gold-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#F59E0B" />
                <stop offset="50%" stopColor="#FBBF24" />
                <stop offset="100%" stopColor="#FCD34D" />
              </linearGradient>
              <linearGradient id="logo-mint-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#059669" />
                <stop offset="50%" stopColor="#10B981" />
                <stop offset="100%" stopColor="#34D399" />
              </linearGradient>
              <linearGradient id="logo-core-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#06B6D4" />
                <stop offset="100%" stopColor="#22D3EE" />
              </linearGradient>
              <filter id="glow-logo" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="2" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <filter id="inner-glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="1" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Technical grid crosshairs */}
            <line x1="24" y1="3" x2="24" y2="45" stroke="#334155" strokeWidth="0.5" strokeDasharray="3 6" opacity="0.5" />
            <line x1="3" y1="24" x2="45" y2="24" stroke="#334155" strokeWidth="0.5" strokeDasharray="3 6" opacity="0.5" />
            
            {/* Faint circles */}
            <circle cx="24" cy="24" r="19" stroke="#334155" strokeWidth="0.5" fill="none" opacity="0.3" />
            <circle cx="24" cy="24" r="12" stroke="#334155" strokeWidth="0.5" strokeDasharray="2 4" fill="none" opacity="0.3" />

            {/* Outer Glowing Gold U Path (Base layer) */}
            <path
              d="M 13 10 L 13 27 C 13 36, 17 40, 24 40 C 31 40, 35 36, 35 27 L 35 10"
              fill="none"
              stroke="url(#logo-gold-grad)"
              strokeWidth="3.5"
              strokeLinecap="round"
              opacity="0.3"
            />

            {/* Clockwise Animated Glowing Tracer (Outer Track) */}
            <motion.path
              d="M 13 10 L 13 27 C 13 36, 17 40, 24 40 C 31 40, 35 36, 35 27 L 35 10"
              fill="none"
              stroke="url(#logo-gold-grad)"
              strokeWidth="3.5"
              strokeLinecap="round"
              filter="url(#glow-logo)"
              initial={{ pathLength: 0.3, pathOffset: 0 }}
              animate={{
                pathOffset: [0, 1],
              }}
              transition={{
                duration: 3.5,
                repeat: Infinity,
                ease: "linear",
              }}
            />

            {/* Inner Glowing Mint U Path (Base layer) */}
            <path
              d="M 18 12 L 18 27 C 18 33, 20 35, 24 35 C 28 35, 30 33, 30 27 L 30 12"
              fill="none"
              stroke="url(#logo-mint-grad)"
              strokeWidth="2.5"
              strokeLinecap="round"
              opacity="0.25"
            />

            {/* Counter-Clockwise Animated Glowing Tracer (Inner Track) */}
            <motion.path
              d="M 18 12 L 18 27 C 18 33, 20 35, 24 35 C 28 35, 30 33, 30 27 L 30 12"
              fill="none"
              stroke="url(#logo-mint-grad)"
              strokeWidth="2.5"
              strokeLinecap="round"
              filter="url(#inner-glow)"
              initial={{ pathLength: 0.25, pathOffset: 1 }}
              animate={{
                pathOffset: [1, 0],
              }}
              transition={{
                duration: 2.5,
                repeat: Infinity,
                ease: "linear",
              }}
            />

            {/* Central Core Node representing matching engine */}
            <motion.circle
              cx="24"
              cy="24"
              r="2"
              fill="url(#logo-core-grad)"
              filter="url(#glow-logo)"
              animate={{
                scale: [1, 1.2, 1],
                opacity: [0.8, 1, 0.8],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
            
            {/* Orbiting particles */}
            <motion.circle
              cx="24"
              cy="24"
              r="0.8"
              fill="#FBBF24"
              animate={{
                cx: [24, 36, 24, 12, 24],
                cy: [24, 24, 36, 24, 12],
              }}
              transition={{
                duration: 4,
                repeat: Infinity,
                ease: "linear",
              }}
            />
          </svg>
        </div>
      </div>
      {showWordmark && (
        <div className="leading-none select-none">
          <div className={cn("font-mono font-bold tracking-[0.32em] text-slate-100 flex items-center gap-0.5", token.text)}>
            <span>UO</span>
            <span className="text-uora-cyan font-black">R</span>
            <span>A</span>
          </div>
          <div className={cn("mt-2 font-semibold uppercase tracking-[0.32em] text-slate-400", token.sub)}>
            QUANT ENGINE BENCHMARK
          </div>
        </div>
      )}
    </div>
  );
}
