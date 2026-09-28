import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/** Type any number of minutes (1 to 600). Commits on blur or Enter. */
export function MinutesInput({ id, value, onChange, className }: { id?: string; value: number; onChange: (m: number) => void; className?: string }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const n = Math.round(Number(text));
    if (!Number.isFinite(n) || n < 1) return setText(String(value));
    const m = Math.min(600, n);
    setText(String(m));
    if (m !== value) onChange(m);
  };
  return (
    <span className={cn("inline-flex h-9 items-center gap-1.5 rounded-lg border bg-card pl-3 pr-2.5 text-sm focus-within:ring-2 focus-within:ring-ring/40", className)}>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        aria-label="Minutes"
        value={text}
        onChange={(e) => setText(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), commit())}
        className="w-10 bg-transparent text-right tabular-nums outline-none"
      />
      <span className="text-muted-foreground">min</span>
    </span>
  );
}
