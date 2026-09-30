import { useId } from "react";
import { dayKey } from "@/lib/utils";
import { useData } from "@/store/store";
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

/** A little flame in the top corner that grows the longer the streak goes on. */
export function StreakFlame() {
  const data = useData();
  const gid = `flame${useId().replace(/:/g, "")}`;
  // Study days, plus older practice history from before streaks were recorded.
  const days = [...(data.user.studyDays ?? []), ...data.questions.flatMap((q) => (q.stats.lastAnsweredAt ? [dayKey(q.stats.lastAnsweredAt)] : [])), ...data.sessions.map((s) => dayKey(s.startedAt))];
  const { count, today } = streakDays(days);
  if (!count) return null;
  const tier = count >= 14 ? 3 : count >= 7 ? 2 : count >= 3 ? 1 : 0;
  const size = [15, 17, 19, 21][tier];
  const title = today ? `${count} ${count === 1 ? "day" : "days"} in a row. Nice!` : `${count} ${count === 1 ? "day" : "days"} in a row. Practise today to keep it going!`;
  return (
    <span className={cn("inline-flex h-9 items-center gap-1 rounded-full px-2.5 text-[13.5px] font-semibold tabular-nums", today ? "text-foreground" : "text-muted-foreground")} title={title} aria-label={title}>
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
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
      {count}
    </span>
  );
}
