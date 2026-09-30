/**
 * Practice helpers: making the question set, working out coverage per topic,
 * deciding which question comes next, and shuffling the options each time one is shown.
 */
import { getAI } from "@/services/ai";
import { aiReady } from "@/services/ai/ai-key";
import { tidyOption } from "@/lib/tidy";
import { groundingFor } from "@/services/grounding";
import { actions } from "@/store/actions";
import { getState } from "@/store/store";
import type { AppData } from "@/services/db/types";
import type { ID, Material, Question } from "@/types/models";

/** (Re)build a material's multiple-choice questions from its included slides. */
export async function buildPracticeQuestions(materialId: ID) {
  const m = getState().materials.find((x) => x.id === materialId);
  if (!m) return;
  // The AI's questions for these exact slides are kept (they're better than the built-in ones).
  if (m.ai?.questions && aiReady(m)) return;
  const { pages, topics } = groundingFor([m]);
  const drafts = await getAI().mcqSet(pages, topics, m.subject);
  actions.setPracticeQuestions(materialId, drafts);
}

export function practiceSet(d: AppData, materialId: ID): Question[] {
  const m = d.materials.find((x) => x.id === materialId);
  const order = new Map(m?.pages.map((p) => [p.id, p.index]) ?? []);
  return d.questions
    .filter((q) => q.materialId === materialId && q.pool)
    .sort((a, b) => (order.get(a.sources[0]?.pageId) ?? 0) - (order.get(b.sources[0]?.pageId) ?? 0));
}

/** A question counts as covered once the latest answer to it is right. */
export const isCovered = (q: Question) => q.stats.lastResult === "correct";
export const needsReview = (q: Question) => q.stats.lastResult === "incorrect";

export interface TopicProgress {
  topicId: ID | null;
  name: string;
  total: number;
  covered: number;
  review: number;
  answered: number;
  pct: number;
}

export function topicProgress(d: AppData, m: Material): TopicProgress[] {
  const qs = practiceSet(d, m.id);
  const topics = [...m.topics].sort((a, b) => (m.pages.find((p) => p.id === a.pageIds[0])?.index ?? 0) - (m.pages.find((p) => p.id === b.pageIds[0])?.index ?? 0));
  const rows: TopicProgress[] = topics.map((t) => ({ topicId: t.id, name: t.name, total: 0, covered: 0, review: 0, answered: 0, pct: 0 }));
  const other: TopicProgress = { topicId: null, name: "Other", total: 0, covered: 0, review: 0, answered: 0, pct: 0 };
  for (const q of qs) {
    const row = rows.find((r) => r.topicId === q.topicId) ?? other;
    row.total++;
    if (isCovered(q)) row.covered++;
    if (needsReview(q)) row.review++;
    if (q.stats.attempts) row.answered++;
  }
  return [...rows, other].filter((r) => r.total).map((r) => ({ ...r, pct: Math.round((r.covered / r.total) * 100) }));
}

export function overallProgress(d: AppData, m: Material) {
  const qs = practiceSet(d, m.id);
  const covered = qs.filter(isCovered).length;
  return { total: qs.length, covered, review: qs.filter(needsReview).length, pct: qs.length ? Math.round((covered / qs.length) * 100) : 0 };
}

/**
 * The order to work through: new questions in slide order, with ones you got wrong
 * mixed back in every few questions, then anything else (oldest answer first).
 */
export function practiceQueue(qs: Question[], shuffle = false): ID[] {
  // Shuffled: new questions come in a random order instead of slide order.
  const fresh = shuffle ? shuffled(qs.filter((q) => !q.stats.attempts)) : qs.filter((q) => !q.stats.attempts);
  const wrong = qs.filter(needsReview).sort((a, b) => (a.stats.lastAnsweredAt ?? "").localeCompare(b.stats.lastAnsweredAt ?? ""));
  const rest = qs.filter((q) => isCovered(q) || (q.stats.attempts && !q.stats.lastResult)).sort((a, b) => (a.stats.lastAnsweredAt ?? "").localeCompare(b.stats.lastAnsweredAt ?? ""));
  const out: ID[] = [];
  let w = 0;
  fresh.forEach((q, i) => {
    out.push(q.id);
    if ((i + 1) % 3 === 0 && w < wrong.length) out.push(wrong[w++].id);
  });
  while (w < wrong.length) out.push(wrong[w++].id);
  (shuffle ? shuffled(rest) : rest).forEach((q) => out.push(q.id));
  return out;
}

function shuffled<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Pick the wrong answers to show and shuffle everything, using a fresh random order each time. */
export function shuffleOptions(q: Question, count: number): { options: string[]; correct: number } {
  const correctText = q.pool ? q.options![0] : q.options![q.correctIndex ?? 0];
  const wrongPool = q.pool ? q.options!.slice(1) : q.options!.filter((_, i) => i !== q.correctIndex);
  // Two options that read the same once tidied ("memory" / "Memory.") would give the answer away.
  const seen = new Set([tidyOption(correctText).toLowerCase()]);
  const wrong = wrongPool.filter((w) => {
    const k = tidyOption(w).toLowerCase();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  for (let i = wrong.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [wrong[i], wrong[j]] = [wrong[j], wrong[i]];
  }
  const shown = [correctText, ...wrong.slice(0, Math.max(1, count - 1))];
  for (let i = shown.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shown[i], shown[j]] = [shown[j], shown[i]];
  }
  return { options: shown, correct: shown.indexOf(correctText) };
}
