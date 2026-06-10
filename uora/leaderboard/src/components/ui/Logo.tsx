"use client";

interface LogoProps {
  size?: "xs" | "sm" | "md" | "lg";
  wordmark?: boolean;
  className?: string;
}

const sizes = {
  xs: { mark: 22, text: "text-sm tracking-[0.22em]" },
  sm: { mark: 28, text: "text-base tracking-[0.24em]" },
  md: { mark: 38, text: "text-xl tracking-[0.26em]" },
  lg: { mark: 56, text: "text-3xl tracking-[0.28em]" },
};

export function Logo({ size = "sm", wordmark = true, className = "" }: LogoProps) {
  const s = sizes[size];
  return (
    <div className={`inline-flex items-center gap-2.5 select-none ${className}`}>
      {/* Mark: LOB market-depth staircase — bid (left, green) + ask (right, red) — the literal shape of an order book. */}
      <svg
        width={s.mark}
        height={s.mark}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/* Subtle frame */}
        <rect
          x="1.5"
          y="1.5"
          width="29"
          height="29"
          rx="4"
          stroke="rgba(0,212,255,0.18)"
          strokeWidth="1"
        />

        {/* Bid staircase (left) — green, ascending toward the mid */}
        <path
          d="M3 26 L3 22 L7 22 L7 18 L11 18 L11 14 L15 14 L15 26 Z"
          fill="rgba(22,199,132,0.18)"
          stroke="#16C784"
          strokeWidth="1.1"
          strokeLinejoin="round"
        />

        {/* Ask staircase (right) — red, descending from the mid */}
        <path
          d="M29 26 L29 22 L25 22 L25 18 L21 18 L21 14 L17 14 L17 26 Z"
          fill="rgba(234,57,67,0.18)"
          stroke="#EA3943"
          strokeWidth="1.1"
          strokeLinejoin="round"
        />

        {/* Mid-price marker — plasma cyan vertical line */}
        <line
          x1="16"
          y1="5"
          x2="16"
          y2="14"
          stroke="#00D4FF"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
        <circle cx="16" cy="5" r="1.6" fill="#00D4FF" />
      </svg>

      {wordmark && (
        <span
          className={`font-mono font-bold uppercase ${s.text}`}
          style={{ color: "#F0F6FC" }}
        >
          UORA
        </span>
      )}
    </div>
  );
}
