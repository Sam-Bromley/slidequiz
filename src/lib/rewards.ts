/**
 * Small moments of reward while revising: a streak kept going, the daily goal reached, a milestone passed.
 * Each fires once, the moment it happens (never just for opening the app).
 */
import { useEffect, useRef } from "react";
import { toast } from "@/components/ui/toast";
import { showMoment } from "@/lib/moments";
import { dayKey } from "@/lib/utils";
import type { AppData } from "@/services/db/types";

/** Things revised in a day (questions answered and flashcards gone through) that make the daily goal. */
export const DAILY_GOAL = 20;
const MILESTONES = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];

export function todayCount(d: AppData) {
  const t = d.user.studyLog?.[dayKey(new Date())];
  return t ? t.q + t.cards : 0;
}
const answeredAll = (d: AppData) => d.questions.reduce((n, q) => n + q.stats.attempts, 0);
const studiedToday = (d: AppData) => (d.user.studyDays ?? []).includes(dayKey(new Date()));

function streakCount(d: AppData) {
  const set = new Set(d.user.studyDays ?? []);
  const x = new Date();
  let n = 0;
  while (set.has(dayKey(x))) {
    n++;
    x.setDate(x.getDate() - 1);
  }
  return n;
}


/** Pops the flame in the corner (it listens for this). */
export const popFlame = () => window.dispatchEvent(new Event("slidequiz:flame"));

export function useRewards(d: AppData) {
  const prev = useRef<{ today: number; answered: number; studied: boolean; day: string; who: string } | null>(null);
  useEffect(() => {
    const now = { today: todayCount(d), answered: answeredAll(d), studied: studiedToday(d), day: dayKey(new Date()), who: d.user.createdAt };
    const p = prev.current;
    prev.current = now;
    // First look, a new day, or a different account: just remember where things are.
    if (!p || p.day !== now.day || p.who !== now.who) return;

    if (!p.studied && now.studied) {
      const n = streakCount(d);
      popFlame();
      if (n >= 2) toast(`${n}-day streak 🔥`, { description: n >= 7 ? "You're on fire. Same time tomorrow?" : "Nice, you kept it going." });
    }
    if (p.today < DAILY_GOAL && now.today >= DAILY_GOAL) {
      popFlame();
      showMoment({ kind: "goal", goal: DAILY_GOAL });
    }
    const hit = MILESTONES.find((m) => p.answered < m && now.answered >= m);
    if (hit) toast(`${hit.toLocaleString()} questions answered 🎉`, { description: hit >= 100 ? "That's serious revision." : "Keep stacking them up." });
  }, [d]);
}
