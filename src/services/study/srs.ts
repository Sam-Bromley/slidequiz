/**
 * A deliberately simple spaced-repetition scheduler (SM-2 inspired).
 * Hard cards come back within minutes; good/easy cards space out over days.
 */
import type { Flashcard, FlashcardRating, SrsState } from "@/types/models";

export const MASTERED_DAYS = 21;

export function newSrs(now = new Date()): SrsState {
  return { ease: 2.5, interval: 0, due: now.toISOString(), reps: 0, lapses: 0 };
}

export function schedule(s: SrsState, rating: FlashcardRating, now = new Date()): SrsState {
  let { ease, interval, reps, lapses } = s;
  let dueMs: number;
  if (rating === "hard") {
    ease = Math.max(1.3, ease - 0.2);
    if (reps > 0) lapses += 1;
    interval = 0;
    reps = 0;
    dueMs = now.getTime() + 10 * 60 * 1000; // back in 10 minutes
  } else if (rating === "good") {
    interval = reps === 0 ? 1 : reps === 1 ? 3 : Math.round(interval * ease);
    reps += 1;
    dueMs = now.getTime() + interval * 86400000;
  } else {
    ease = Math.min(3.0, ease + 0.15);
    interval = reps === 0 ? 4 : Math.round(Math.max(interval, 1) * ease * 1.3);
    reps += 1;
    dueMs = now.getTime() + interval * 86400000;
  }
  return { ease, interval, reps, lapses, due: new Date(dueMs).toISOString(), lastRating: rating, lastReviewedAt: now.toISOString() };
}

export const isDue = (c: Flashcard, now = Date.now()) => new Date(c.srs.due).getTime() <= now;
export const isNew = (c: Flashcard) => !c.srs.lastReviewedAt;
export const isMastered = (c: Flashcard) => c.srs.interval >= MASTERED_DAYS;
export const isDifficult = (c: Flashcard) => !isNew(c) && (c.srs.lastRating === "hard" || c.srs.lapses >= 2 || c.srs.ease < 2.1);

/** 0..1 estimate of how well a card is known. */
export function cardStrength(c: Flashcard): number | null {
  if (isNew(c)) return null;
  const base = c.srs.lastRating === "hard" ? 0.2 : c.srs.lastRating === "good" ? 0.6 : 0.8;
  return Math.max(0, Math.min(1, base + Math.min(0.3, c.srs.interval / 60) + (c.srs.ease - 2.5) * 0.3 - c.srs.lapses * 0.08));
}

/** Order a review queue: overdue difficult cards first, then due, then new. */
export function reviewQueue(cards: Flashcard[], limit = 30, now = Date.now()): Flashcard[] {
  const due = cards.filter((c) => !isNew(c) && isDue(c, now));
  const fresh = cards.filter(isNew);
  due.sort((a, b) => Number(isDifficult(b)) - Number(isDifficult(a)) || new Date(a.srs.due).getTime() - new Date(b.srs.due).getTime());
  return [...due, ...fresh].slice(0, limit);
}

export function nextIntervalLabel(s: SrsState, rating: FlashcardRating) {
  const n = schedule(s, rating);
  if (n.interval === 0) return "10 min";
  return n.interval === 1 ? "1 day" : `${n.interval} days`;
}
