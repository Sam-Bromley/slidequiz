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

/**
 * True when two questions are the same question (the same or nearly the same wording, with the same answer).
 * A question about the same fact asked a clearly different way is NOT the same.
 */
export function sameQuestion(a: Pick<Question, "prompt" | "options" | "correctIndex" | "answer">, b: Pick<Question, "prompt" | "options" | "correctIndex" | "answer">) {
  const pa = words(a.prompt).join(" ");
  const pb = words(b.prompt).join(" ");
  if (pa && pa === pb) return true;
  const sameAnswer = words(answerOf(a)).join(" ") === words(answerOf(b)).join(" ");
  return sameAnswer && overlap(a.prompt, b.prompt) >= 0.8;
}
