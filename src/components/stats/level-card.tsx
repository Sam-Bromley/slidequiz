import { levelInfo } from "@/lib/levels";
import { useCountUp } from "@/lib/count-up";
import { cn } from "@/lib/utils";

/**
 * XP is always the same warm gold, everywhere it appears (badge, bar, "+10", level up). One consistent
 * colour for reward is what lets the brain link it with earning something: gold reads as value and prizes
 * (coins, medals, trophies), and warm, saturated yellows are the colours the eye is drawn to fastest.
 * Movement matters as much as colour, so the bar glows and fills smoothly each time XP comes in.
 */
/** The "+10" that floats up: the same gold, a shade deeper so it reads on white. */
export const XP_GOLD = "#f08c00";
const BADGE = "bg-[linear-gradient(180deg,#ffe066_0%,#fcc419_45%,#f59f00_100%)] text-[#5c3800] shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_2px_8px_-2px_rgba(245,159,0,0.55)]";
const FILL = "bg-[linear-gradient(90deg,#ffd43b_0%,#fcc419_50%,#f59f00_100%)] shadow-[0_0_10px_rgba(252,196,25,0.55)]";

/** The bar itself: fills up smoothly as XP comes in. */
function XpFill({ pct, duration }: { pct: number; xp: number; duration: number }) {
  const fill = useCountUp(pct * 100, duration);
  return (
    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-amber-500/15 dark:bg-amber-300/10">
      <div className={cn("h-full min-w-[6px] rounded-full", FILL)} style={{ width: `${fill}%` }} />
    </div>
  );
}

/** Your level and how far to the next one. */
export function LevelCard({ xp, compact }: { xp: number; compact?: boolean }) {
  const l = levelInfo(xp);
  return (
    <section aria-label={`Level ${l.level}, ${l.name}`} className={compact ? "flex items-center gap-3.5 rounded-2xl border bg-card p-3.5 shadow-pop" : "flex items-center gap-4 rounded-2xl border bg-card p-4 sm:p-5"}>
      <div className={cn("grid size-14 shrink-0 place-items-center rounded-2xl text-[24px] font-extrabold tabular-nums", BADGE)}>{l.level}</div>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">Level {l.level}</p>
        <p className="truncate text-[17px] font-bold">{l.name}</p>
        <div className="mt-2 flex items-center gap-2.5">
          <XpFill pct={l.pct} xp={xp} duration={900} />
          <span className="shrink-0 text-[12px] font-semibold tabular-nums text-amber-700 dark:text-amber-300">
            {l.into}/{l.next} XP
          </span>
        </div>
      </div>
    </section>
  );
}

/** A slim level bar (for the top of Questions): level, name and XP to the next level. Fills up as XP comes in. */
export function LevelBar({ xp }: { xp: number }) {
  const l = levelInfo(xp);
  return (
    <div className="flex items-center gap-2.5" aria-label={`Level ${l.level}, ${l.name}: ${l.into} of ${l.next} XP to the next level`}>
      <span className={cn("grid size-7 shrink-0 place-items-center rounded-lg text-[13px] font-extrabold tabular-nums", BADGE)}>{l.level}</span>
      <span className="max-w-[40%] shrink-0 truncate text-[13px] font-semibold">{l.name}</span>
      <XpFill pct={l.pct} xp={xp} duration={600} />
      <span className="shrink-0 text-[12px] font-semibold tabular-nums text-amber-700 dark:text-amber-300">
        {l.into}/{l.next} XP
      </span>
    </div>
  );
}
