import { levelColour, levelInfo } from "@/lib/levels";
import { useCountUp } from "@/lib/count-up";
import { getState } from "@/store/store";

/** Each level has its own colour (see LEVEL_COLOURS): the badge, the bar and the floating "+10" all use it. */
export const xpColour = () => levelColour(levelInfo(getState().user.xp).level).text;

const badgeStyle = (level: number): React.CSSProperties => {
  const c = levelColour(level);
  return { background: `linear-gradient(180deg, ${c.light} 0%, ${c.mid} 50%, ${c.dark} 100%)`, color: c.ink, boxShadow: `inset 0 1px 0 rgba(255,255,255,0.45), 0 2px 8px -2px ${c.mid}99` };
};

/** The bar itself: fills up smoothly as XP comes in. */
function XpFill({ pct, level, duration }: { pct: number; level: number; duration: number }) {
  const fill = useCountUp(pct * 100, duration);
  const c = levelColour(level);
  return (
    <div className="h-2.5 flex-1 overflow-hidden rounded-full" style={{ backgroundColor: c.mid + "26" }}>
      <div className="h-full min-w-[6px] rounded-full" style={{ width: `${fill}%`, background: `linear-gradient(90deg, ${c.light}, ${c.mid} 55%, ${c.dark})`, boxShadow: `0 0 10px ${c.mid}88` }} />
    </div>
  );
}

/** Your level and how far to the next one. */
export function LevelCard({ xp, compact }: { xp: number; compact?: boolean }) {
  const l = levelInfo(xp);
  const c = levelColour(l.level);
  return (
    <section aria-label={`Level ${l.level}, ${l.name}`} className={compact ? "flex items-center gap-3.5 rounded-2xl border bg-card p-3.5 shadow-pop" : "flex items-center gap-4 rounded-2xl border bg-card p-4 sm:p-5"}>
      <div className="grid size-14 shrink-0 place-items-center rounded-2xl text-[24px] font-extrabold tabular-nums" style={badgeStyle(l.level)}>
        {l.level}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">Level {l.level}</p>
        <p className="truncate text-[17px] font-bold">{l.name}</p>
        <div className="mt-2 flex items-center gap-2.5">
          <XpFill pct={l.pct} level={l.level} duration={900} />
          <span className="shrink-0 text-[12px] font-semibold tabular-nums" style={{ color: c.text }}>
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
  const c = levelColour(l.level);
  return (
    <div className="flex items-center gap-2.5" aria-label={`Level ${l.level}, ${l.name}: ${l.into} of ${l.next} XP to the next level`}>
      <span className="grid size-7 shrink-0 place-items-center rounded-lg text-[13px] font-extrabold tabular-nums" style={badgeStyle(l.level)}>
        {l.level}
      </span>
      <span className="max-w-[40%] shrink-0 truncate text-[13px] font-semibold">{l.name}</span>
      <XpFill pct={l.pct} level={l.level} duration={600} />
      <span className="shrink-0 text-[12px] font-semibold tabular-nums" style={{ color: c.text }}>
        {l.into}/{l.next} XP
      </span>
    </div>
  );
}
