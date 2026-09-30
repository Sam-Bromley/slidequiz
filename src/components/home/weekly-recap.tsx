import { CalendarDays, Sparkles, Trophy } from "lucide-react";
import { navigate } from "@/lib/router";
import { cn, dayKey } from "@/lib/utils";
import { hasPlus, PLUS_ON, usePlanQuiet } from "@/services/plus";
import { topicName } from "@/store/selectors";
import { useData } from "@/store/store";
import type { AppData } from "@/services/db/types";
import type { DayLog } from "@/types/models";

const DAY = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

/** The last 7 days (oldest first), and the 7 before that. */
function lastDays(n: number, offset = 0) {
  const out: Date[] = [];
  for (let i = n - 1 + offset; i >= offset; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push(d);
  }
  return out;
}

export function weekRecap(data: AppData) {
  const log = data.user.studyLog ?? {};
  const days = lastDays(7).map((d) => ({ d, log: log[dayKey(d)] as DayLog | undefined }));
  const prev = lastDays(7, 7).reduce((n, d) => n + (log[dayKey(d)]?.q ?? 0), 0);
  const q = days.reduce((n, x) => n + (x.log?.q ?? 0), 0);
  const c = days.reduce((n, x) => n + (x.log?.c ?? 0), 0);
  const cards = days.reduce((n, x) => n + (x.log?.cards ?? 0), 0);
  const active = days.filter((x) => (x.log?.q ?? 0) + (x.log?.cards ?? 0) > 0).length;
  const topics = new Map<string, [number, number]>();
  for (const x of days)
    for (const [k, [n, r]] of Object.entries(x.log?.t ?? {})) {
      const [a, b] = topics.get(k) ?? [0, 0];
      topics.set(k, [a + n, b + r]);
    }
  let best: { name: string; pct: number } | null = null;
  for (const [k, [n, r]] of topics) {
    if (n < 3 || r / n < 0.5) continue;
    const pct = r / n;
    if (!best || pct > best.pct) {
      const [mid, tid] = k.split("|");
      const name = topicName(data, mid, tid || null);
      const title = data.materials.find((m) => m.id === mid)?.title;
      if (name === "General" && !title) continue;
      best = { name: name === "General" ? title! : name, pct };
    }
  }
  return { days, q, c, pct: q ? Math.round((c / q) * 100) : 0, cards, active, best, prev };
}

/** "This week: 142 questions, 83% correct, best topic: Enzymes". A Pro perk. */
export function WeeklyRecap() {
  const data = useData();
  usePlanQuiet();
  const r = weekRecap(data);
  if (!r.q && !r.cards) return null;
  const plus = hasPlus();
  if (!plus && !PLUS_ON) return null;
  const max = Math.max(1, ...r.days.map((x) => (x.log?.q ?? 0) + (x.log?.cards ?? 0)));
  const diff = r.q - r.prev;
  const stats = [
    { label: "questions", value: r.q.toLocaleString() },
    { label: "correct", value: r.q ? `${r.pct}%` : "–" },
    { label: "flashcards", value: r.cards.toLocaleString() },
  ];
  return (
    <section aria-label="Your week" className="relative mt-6 overflow-hidden rounded-[22px] border bg-card/90 p-4 shadow-sm backdrop-blur sm:p-5">
      <div className="flex items-center gap-2">
        <CalendarDays className="size-4 text-brand" />
        <h2 className="text-[14px] font-semibold">This week</h2>
        {plus && r.prev > 0 && diff !== 0 && (
          <span className={cn("ml-auto rounded-full px-2 py-0.5 text-[11.5px] font-medium", diff > 0 ? "bg-success/10 text-success" : "bg-muted text-muted-foreground")}>
            {diff > 0 ? `+${diff}` : diff} questions vs last week
          </span>
        )}
      </div>
      <div className={cn("mt-3 grid grid-cols-[1fr_auto] items-end gap-4", !plus && "pointer-events-none select-none blur-[5px]")} aria-hidden={!plus}>
        <div>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {stats.map((s) => (
              <div key={s.label}>
                <div className="text-[22px] font-bold leading-none tabular-nums">{s.value}</div>
                <div className="mt-1 text-[12px] text-muted-foreground">{s.label}</div>
              </div>
            ))}
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-[13px] text-foreground/85">
            {r.best ? (
              <>
                <Trophy className="size-3.5 shrink-0 text-amber-500" />
                <span className="truncate">
                  Best topic: <b className="font-semibold">{r.best.name}</b> ({Math.round(r.best.pct * 100)}%)
                </span>
              </>
            ) : (
              <span className="text-muted-foreground">
                Studied {r.active} of 7 days. Keep going!
              </span>
            )}
          </p>
        </div>
        <div className="flex h-[64px] items-end gap-1" title={`Studied ${r.active} of the last 7 days`}>
          {r.days.map((x, i) => {
            const n = (x.log?.q ?? 0) + (x.log?.cards ?? 0);
            return (
              <div key={i} className="flex flex-col items-center gap-1">
                <div className="flex h-[44px] w-3.5 items-end rounded-full bg-muted/70">
                  <div className={cn("w-full rounded-full", n ? "bg-brand" : "")} style={{ height: n ? `${Math.max(18, (n / max) * 100)}%` : 0 }} />
                </div>
                <span className={cn("text-[10px] text-muted-foreground", i === 6 && "font-semibold text-foreground")}>{DAY[x.d.getDay()]}</span>
              </div>
            );
          })}
        </div>
      </div>
      {!plus && (
        <button type="button" onClick={() => navigate("/pro")} className="absolute inset-0 top-10 grid place-items-center focus-ring">
          <span className="flex items-center gap-1.5 rounded-full border bg-background/95 px-3.5 py-2 text-[13px] font-medium shadow-pop">
            <Sparkles className="size-3.5 text-amber-500" /> See your weekly recap with Pro
          </span>
        </button>
      )}
    </section>
  );
}
