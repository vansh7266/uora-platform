import { cn } from "@/lib/utils";

interface UoraLogoProps {
  size?: "sm" | "md" | "lg";
  showWordmark?: boolean;
  className?: string;
}

const sizeMap = {
  sm: { box: "h-8 w-8", text: "text-lg" },
  md: { box: "h-10 w-10", text: "text-xl" },
  lg: { box: "h-14 w-14", text: "text-3xl" },
};

export function UoraLogo({ size = "md", showWordmark = true, className }: UoraLogoProps) {
  const token = sizeMap[size];

  return (
    <div className={cn("flex items-center gap-3", className)} aria-label="UORA">
      <div className={cn("relative grid place-items-center", token.box)}>
        <div className="relative h-full w-full overflow-hidden rounded-md border border-[#2b3b51] bg-[#0b111a] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
          <svg viewBox="0 0 48 48" className="h-full w-full" role="img" aria-hidden>
            <path
              d="M14 12v15.2c0 5.4 3.8 8.8 10 8.8s10-3.4 10-8.8V12"
              fill="none"
              stroke="#39D5C3"
              strokeLinecap="round"
              strokeWidth="3.6"
            />
            <path
              d="M10 26h5.5l3-6.5 5 13 4-9.5 3.4 3H38"
              fill="none"
              stroke="#E6FBFF"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.2"
              opacity="0.92"
            />
          </svg>
        </div>
      </div>
      {showWordmark && (
        <div className="leading-none">
          <div className={cn("font-mono font-semibold tracking-[0.16em] text-slate-100", token.text)}>
            UORA
          </div>
          <div className="mt-1 text-[9px] font-medium uppercase tracking-[0.22em] text-slate-500">
            Benchmarking
          </div>
        </div>
      )}
    </div>
  );
}
