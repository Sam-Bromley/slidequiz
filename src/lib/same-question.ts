import type { Question } from "@/types/models";

const STOP = new Set("a an the of to in on for and or is are was were be by with as at from that this which what who whom whose when where why how does do did can could would should will its it their there these those than then into about most best main following each".split(" "));

const words = (t: string) =>
  t
    .toLowerCase()
    .replace(/[^a-z0-9+\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w))
    .map((w) => (w.length > 4 && w.endsWith("s") ? w.slice(0, -1) : w));

const answerOf = (q: Pick<Question, "options" | "correctIndex" | "answer">) => (q.options && q.correctIndex != null ? q.options[q.correctIndex] : q.answer) ?? "";

/** Word overlap of two texts, 0 to 1. */
function overlap(a: string, b: string) {
  const A = new Set(words(a));
  const B = new Set(words(b));
  if (!A.size || !B.size) return 0;
  let n = 0;
  A.forEach((w) => B.has(w) && n++);
  return n / Math.min(A.size, B.size);
}

type Q = Pick<Question, "prompt" | "options" | "correctIndex" | "answer">;

/**
 * True when two questions test the same thing: the same or nearly the same wording, or the same right answer
 * asked about in much the same words. Questions with different answers are different facts.
 */
export function sameQuestion(a: Q, b: Q) {
  const pa = words(a.prompt).join(" ");
  const pb = words(b.prompt).join(" ");
  if (pa && pa === pb) return true;
  const ans = words(answerOf(a)).join(" ");
  if (!ans || ans !== words(answerOf(b)).join(" ")) return false;
  return overlap(a.prompt, b.prompt) >= 0.5;
}
