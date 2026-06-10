"use client";

interface LogoProps {
  size?: "xs" | "sm" | "md" | "lg";
  wordmark?: boolean;  // kept for API compatibility; wordmark IS the logo
  className?: string;
}

const sizes = {
  xs: { letter: "text-[13px]", gap: "tracking-[0.18em]", dot: "w-1 h-1" },
  sm: { letter: "text-[15px]", gap: "tracking-[0.20em]", dot: "w-1 h-1" },
  md: { letter: "text-[22px]", gap: "tracking-[0.22em]", dot: "w-1.5 h-1.5" },
  lg: { letter: "text-[36px]", gap: "tracking-[0.24em]", dot: "w-2 h-2" },
};

export function Logo({ size = "sm", className = "" }: LogoProps) {
  const s = sizes[size];
  return (
    <div
      className={`inline-flex items-center gap-1.5 select-none font-mono font-bold uppercase leading-none ${className}`}
    >
      <span className={`${s.letter} ${s.gap} text-[#F0F6FC]`}>UORA</span>
      <span
        className={`${s.dot} rounded-full bg-[#00D4FF] shadow-[0_0_8px_rgba(0,212,255,0.7)]`}
        aria-hidden="true"
      />
    </div>
  );
}
