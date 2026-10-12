import { levelInfo } from "@/lib/levels";
import { useCountUp } from "@/lib/count-up";

/** Your level and how far to the next one. */
export function LevelCard({ xp, compact }: { xp: number; compact?: boolean }) {
  const l = levelInfo(xp);
  const fill = useCountUp(l.pct * 100, 900);
  return (
    <section aria-label={`Level ${l.level}, ${l.name}`} className={compact ? "flex items-center gap-3.5 rounded-2xl border bg-card p-3.5 shadow-pop" : "flex items-center gap-4 rounded-2xl border bg-card p-4 sm:p-5"}>
      <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-b from-amber-400 to-orange-500 text-[24px] font-extrabold tabular-nums text-white shadow-sm">{l.level}</div>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">Level {l.level}</p>
        <p className="truncate text-[17px] font-bold">{l.name}</p>
        <div className="mt-2 flex items-center gap-2.5">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500" style={{ width: `${fill}%` }} />
          </div>
          <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">
            {l.into}/{l.next} XP
          </span>
        </div>
      </div>
    </section>
  );
}

