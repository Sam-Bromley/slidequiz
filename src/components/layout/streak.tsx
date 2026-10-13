import { useEffect, useId, useRef, useState } from "react";
import { WeeklyRecap } from "@/components/home/weekly-recap";
import { LevelCard } from "@/components/stats/level-card";
import { Link } from "@/lib/router";
import { dayKey } from "@/lib/utils";
import { useData } from "@/store/store";
import type { AppData } from "@/services/db/types";
import { DAILY_GOAL, todayCount } from "@/lib/rewards";
import { cn } from "@/lib/utils";

/** Days in a row with some practice or flashcard revision (today, or up to yesterday if not yet today). */
export function streakDays(days: string[] | undefined, now = new Date()): { count: number; today: boolean } {
  const set = new Set(days ?? []);
  const d = new Date(now);
  const today = set.has(dayKey(d));
  if (!today) d.setDate(d.getDate() - 1);
  let count = 0;
  while (set.has(dayKey(d))) {
    count++;
    d.setDate(d.getDate() - 1);
  }
  return { count, today };
}

/** Every day with some revision (including older practice from before streaks were recorded). */
export function studyDaysOf(data: AppData): string[] {
  return [...(data.user.studyDays ?? []), ...data.questions.flatMap((q) => (q.stats.lastAnsweredAt ? [dayKey(q.stats.lastAnsweredAt)] : [])), ...data.sessions.map((s) => dayKey(s.startedAt)), ...Object.keys(data.user.studyLog ?? {})];
}

/** The most days in a row ever revised. */
export function longestStreak(days: string[]): number {
  const sorted = [...new Set(days)].sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of sorted) {
    if (prev) {
      const next = new Date(prev + "T12:00:00");
      next.setDate(next.getDate() + 1);
      run = dayKey(next) === d ? run + 1 : 1;
    } else run = 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

/** A little flame in the top corner that grows the longer the streak goes on. */
export function StreakFlame() {
  const data = useData();
  const gid = `flame${useId().replace(/:/g, "")}`;
  // Study days, plus older practice history from before streaks were recorded.
  const days = [...(data.user.studyDays ?? []), ...data.questions.flatMap((q) => (q.stats.lastAnsweredAt ? [dayKey(q.stats.lastAnsweredAt)] : [])), ...data.sessions.map((s) => dayKey(s.startedAt))];
  const { count, today } = streakDays(days);
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  // Bounces when the streak goes up or the daily goal is reached.
  const [pop, setPop] = useState(0);
  useEffect(() => {
    const on = () => setPop((n) => n + 1);
    window.addEventListener("slidequiz:flame", on);
    return () => window.removeEventListener("slidequiz:flame", on);
  }, []);
  const goal = Math.min(1, todayCount(data) / DAILY_GOAL);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  if (!count) return null;
  const tier = count >= 14 ? 3 : count >= 7 ? 2 : count >= 3 ? 1 : 0;
  const size = [20, 22, 24, 26][tier];
  const title = today ? `${count} ${count === 1 ? "day" : "days"} in a row. Nice!` : `${count} ${count === 1 ? "day" : "days"} in a row. Practise today to keep it going!`;
  return (
    <div ref={wrap} className="relative">
    <button
      type="button"
      onClick={() => setOpen((o) => !o)}
      aria-expanded={open}
      data-streak-flame=""
      className={cn("inline-flex h-9 items-center gap-1 rounded-full px-1.5 text-[15px] font-bold tabular-nums transition-colors hover:bg-accent focus-ring", today ? "text-foreground" : "text-muted-foreground")}
      title={`${title} ${goal >= 1 ? "Daily goal done." : `Daily goal: ${Math.round(goal * DAILY_GOAL)} of ${DAILY_GOAL}.`} Tap to see your week.`}
      aria-label={title}
    >
      <span key={pop} className={cn("relative grid size-[30px] shrink-0 place-items-center", pop > 0 && "animate-boop")}>
      {/* Today's progress towards the daily goal, as a ring around the flame. */}
      <svg viewBox="0 0 30 30" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="15" cy="15" r="13.5" fill="none" strokeWidth="2" className="stroke-foreground/10" />
        {goal > 0 && <circle cx="15" cy="15" r="13.5" fill="none" strokeWidth="2" strokeLinecap="round" stroke={goal >= 1 ? "#f97316" : "#fb923c"} strokeDasharray={`${goal * 84.8} 84.8`} className="transition-[stroke-dasharray] duration-500 ease-out" />}
      </svg>
      <svg
        viewBox="0 0 24 24"
        width={size - 2}
        height={size - 2}
        className={cn("shrink-0", today && tier >= 2 && "animate-flicker", !today && "opacity-50 grayscale")}
        style={today && tier >= 1 ? { filter: `drop-shadow(0 0 ${tier * 3}px rgba(249, 115, 22, ${0.25 + tier * 0.12}))` } : undefined}
        aria-hidden
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#ea580c" />
            <stop offset="60%" stopColor="#f97316" />
            <stop offset="100%" stopColor="#fbbf24" />
          </linearGradient>
        </defs>
        <path fill={`url(#${gid})`} d="M12 2.5c.6 2.6-.4 4.4-1.8 5.9C8.6 10.1 7 11.9 7 14.6 7 18 9.3 21 12.2 21c3.3 0 5.8-2.6 5.8-6 0-2.5-1.2-4.4-2.4-5.8-.3 1.5-1 2.5-2 3 .3-3.7-.4-6.8-1.6-9.7Z" />
        <path fill="#fde68a" d="M12.3 13.2c.2 1.2-.3 2-.9 2.7-.5.6-1 1.2-1 2.1 0 1.2.8 2.2 1.9 2.2 1.3 0 2.2-1 2.2-2.3 0-1.1-.6-2-1.3-2.7-.1.6-.4 1-.8 1.2 0-1.2-.1-2.2-.1-3.2Z" />
      </svg>
      </span>
      {count}
    </button>
      {open && (
        <div role="dialog" aria-label="Your week" className="absolute right-0 top-full z-50 mt-2 w-[min(400px,calc(100vw-24px))] animate-scale-in max-sm:fixed max-sm:inset-x-3 max-sm:top-[calc(env(safe-area-inset-top,0px)+3.5rem)] max-sm:mt-0 max-sm:w-auto">
          {/* Your level, tapping through to all your stats (the only way to Stats on phones). */}
          <Link to="/stats" onClick={() => setOpen(false)} className="mb-2 block rounded-2xl focus-ring" aria-label="See your stats">
            <LevelCard xp={data.user.xp} compact />
          </Link>
          <WeeklyRecap popover />
        </div>
      )}
    </div>
  );
}
