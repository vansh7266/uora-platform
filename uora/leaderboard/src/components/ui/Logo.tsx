"use client";

interface LogoProps {
  size?: "xs" | "sm" | "md" | "lg";
  wordmark?: boolean;
  className?: string;
}

const sizes = {
  xs: { mark: 20, text: "text-sm tracking-[0.2em]" },
  sm: { mark: 26, text: "text-base tracking-[0.22em]" },
  md: { mark: 36, text: "text-xl tracking-[0.24em]" },
  lg: { mark: 52, text: "text-3xl tracking-[0.26em]" },
};

export function Logo({ size = "sm", wordmark = true, className = "" }: LogoProps) {
  const s = sizes[size];
  return (
    <div className={`inline-flex items-center gap-2.5 select-none ${className}`}>
      {/* Mark: stylised "U" with plasma accent */}
      <svg
        width={s.mark}
        height={s.mark}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/* Outer ring */}
        <circle cx="16" cy="16" r="15" stroke="rgba(0,212,255,0.25)" strokeWidth="1" />
        {/* U shape */}
        <path
          d="M9 8 L9 19 Q9 24 16 24 Q23 24 23 19 L23 8"
          stroke="#00D4FF"
          strokeWidth="2.2"
          strokeLinecap="round"
          fill="none"
        />
        {/* Inner accent bar */}
        <line x1="12" y1="8" x2="12" y2="16" stroke="rgba(0,212,255,0.4)" strokeWidth="1" strokeLinecap="round" />
        <line x1="20" y1="8" x2="20" y2="16" stroke="rgba(0,212,255,0.4)" strokeWidth="1" strokeLinecap="round" />
        {/* Plasma dot at bottom of U */}
        <circle cx="16" cy="24" r="2" fill="#00D4FF" />
      </svg>

      {wordmark && (
        <span
          className={`font-mono font-bold uppercase ${s.text}`}
          style={{ color: "#F0F6FC", letterSpacing: "0.22em" }}
        >
          UORA
        </span>
      )}
    </div>
  );
}
