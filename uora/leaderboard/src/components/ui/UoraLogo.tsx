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
          className="absolute inset-0 rounded-md border border-uora-cyan/35 bg-uora-cyan/5 shadow-[0_0_20px_rgba(226,181,62,0.15)]"
          animate={{
            scale: [1, 1.06, 1],
            opacity: [0.4, 0.7, 0.4],
          }}
          transition={{
            duration: 3.5,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />

        <div className="relative h-full w-full overflow-hidden rounded-md border border-uora-border bg-uora-surface shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] hover:border-uora-cyan/50 hover:shadow-[0_0_25px_rgba(226,181,62,0.25)] transition-all duration-500">
          <svg viewBox="0 0 48 48" className="h-full w-full p-1.5" role="img" aria-hidden>
            <defs>
              <linearGradient id="logo-gold-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#E2B53E" />
                <stop offset="100%" stopColor="#FFD875" />
              </linearGradient>
              <linearGradient id="logo-mint-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#10B981" />
                <stop offset="100%" stopColor="#34D399" />
              </linearGradient>
              <filter id="glow-logo" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="1.8" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Technical grid crosshairs */}
            <line x1="24" y1="4" x2="24" y2="44" stroke="#1E293B" strokeWidth="0.5" strokeDasharray="2 4" />
            <line x1="4" y1="24" x2="44" y2="24" stroke="#1E293B" strokeWidth="0.5" strokeDasharray="2 4" />
            
            {/* Faint circles */}
            <circle cx="24" cy="24" r="18" stroke="#1E293B" strokeWidth="0.5" fill="none" />
            <circle cx="24" cy="24" r="10" stroke="#1E293B" strokeWidth="0.5" strokeDasharray="1 3" fill="none" />

            {/* Outer Glowing Gold U Path (Base layer) */}
            <path
              d="M 14 11 L 14 27 C 14 35, 18 39, 24 39 C 30 39, 34 35, 34 27 L 34 11"
              fill="none"
              stroke="url(#logo-gold-grad)"
              strokeWidth="3.2"
              strokeLinecap="round"
              opacity="0.25"
            />

            {/* Clockwise Animated Glowing Tracer (Outer Track) */}
            <motion.path
              d="M 14 11 L 14 27 C 14 35, 18 39, 24 39 C 30 39, 34 35, 34 27 L 34 11"
              fill="none"
              stroke="url(#logo-gold-grad)"
              strokeWidth="3.2"
              strokeLinecap="round"
              filter="url(#glow-logo)"
              initial={{ pathLength: 0.25, pathOffset: 0 }}
              animate={{
                pathOffset: [0, 1],
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: "linear",
              }}
            />

            {/* Inner Glowing Mint U Path (Base layer) */}
            <path
              d="M 19 13 L 19 27 C 19 32, 21 34, 24 34 C 27 34, 29 32, 29 27 L 29 13"
              fill="none"
              stroke="url(#logo-mint-grad)"
              strokeWidth="2.2"
              strokeLinecap="round"
              opacity="0.2"
            />

            {/* Counter-Clockwise Animated Glowing Tracer (Inner Track) */}
            <motion.path
              d="M 19 13 L 19 27 C 19 32, 21 34, 24 34 C 27 34, 29 32, 29 27 L 29 13"
              fill="none"
              stroke="url(#logo-mint-grad)"
              strokeWidth="2.2"
              strokeLinecap="round"
              filter="url(#glow-logo)"
              initial={{ pathLength: 0.2, pathOffset: 1 }}
              animate={{
                pathOffset: [1, 0],
              }}
              transition={{
                duration: 2.2,
                repeat: Infinity,
                ease: "linear",
              }}
            />

            {/* Central Node representing matching core */}
            <circle cx="24" cy="24" r="1.5" fill="#10B981" />
          </svg>
        </div>
      </div>
      {showWordmark && (
        <div className="leading-none select-none">
          <div className={cn("font-mono font-bold tracking-[0.28em] text-slate-100 flex items-center gap-0.5", token.text)}>
            <span>UO</span>
            <span className="text-uora-cyan font-black">R</span>
            <span>A</span>
          </div>
          <div className={cn("mt-2 font-medium uppercase tracking-[0.28em] text-slate-500", token.sub)}>
            QUANT ENGINE BENCHMARK
          </div>
        </div>
      )}
    </div>
  );
}
