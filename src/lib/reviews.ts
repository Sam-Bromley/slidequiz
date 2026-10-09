import type { AppData } from "@/services/db/types";
import { overallProgress } from "@/services/practice";
import type { Material } from "@/types/models";

/**
 * Spaced review: going over a lecture 1, 3, 6, 14 and 30 days after making it, just as it starts to fade,
 * makes it last much longer each time. The review emails use the same days.
 */
export const REVIEW_DAYS = [1, 3, 6, 14, 30];

const DAY = 86400000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const daysBetween = (a: Date, b: Date) => Math.round((startOfDay(b) - startOfDay(a)) / DAY);

export interface ReviewStatus {
  /** Days since the lecture was made. */
  age: number;
  /** A review is due (one of the review days has passed and it hasn't been revised since). */
  due: boolean;
  /** Days until the next review, when one isn't due now (null once all are done). */
  nextIn: number | null;
  /** How many of the five reviews are done. */
  reviews: number;
  /** 0–100: questions covered, plus reviews kept up. */
  ready: number;
}

export function reviewStatus(d: AppData, m: Material, now = new Date()): ReviewStatus {
  const made = new Date(m.createdAt);
  const age = Math.max(0, daysBetween(made, now));
  const studied = m.lastStudiedAt ? new Date(m.lastStudiedAt) : null;
  const studiedAge = studied ? daysBetween(made, studied) : -1;
  const reached = REVIEW_DAYS.filter((s) => s <= age);
  const latest = reached.length ? reached[reached.length - 1] : null;
  const due = latest !== null && studiedAge < latest;
  const reviews = REVIEW_DAYS.filter((s) => s <= studiedAge).length;
  const next = REVIEW_DAYS.find((s) => s > age);
  const p = overallProgress(d, m);
  const coverage = p.total ? p.covered / p.total : 0;
  const ready = Math.round((coverage * 0.6 + (reviews / REVIEW_DAYS.length) * 0.4) * 100);
  return { age, due, nextIn: due || next === undefined ? null : next - age, reviews, ready };
}

export const madeAgo = (age: number) => (age === 0 ? "Made today" : age === 1 ? "Made yesterday" : age < 14 ? `Made ${age} days ago` : age < 60 ? `Made ${Math.round(age / 7)} weeks ago` : `Made ${Math.round(age / 30)} months ago`);
