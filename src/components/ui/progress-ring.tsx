import { cn } from "@/lib/utils";

/** A small circle that fills up as you go, with the percentage in the middle. */
export function ProgressRing({ pct, size = 44, stroke = 4, className, label }: { pct: number; size?: number; stroke?: number; className?: string; label?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, pct));
  return (
    <span className={cn("relative inline-grid shrink-0 place-items-center", className)} style={{ width: size, height: size }} role="img" aria-label={label ?? `${p}% covered`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-muted" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          className="stroke-brand transition-[stroke-dashoffset] duration-700 ease-out"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - p / 100)}
          style={{ opacity: p ? 1 : 0 }}
        />
      </svg>
      <span className="absolute text-[11px] font-semibold tabular-nums">{p}%</span>
    </span>
  );
}
