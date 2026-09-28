/** Derives progress, weak areas and recommendations from quiz answers and flashcard reviews. */
import { addDays, clamp, dayKey } from "@/lib/utils";
import type { AppData } from "@/services/db/types";
import type { Flashcard, ID, Question, QuestionType, QuizAttempt } from "@/types/models";
import { cardStrength, isDifficult, isDue, isMastered, isNew } from "./srs";

export type TopicStatus = "weak" | "review" | "strong" | "new";

export interface TopicStat {
  materialId: ID;
  materialTitle: string;
  subject: string;
  topicId: ID;
  name: string;
  questionCount: number;
  answered: number;
  accuracy: number | null;
  cardCount: number;
  cardStrength: number | null;
  mastery: number | null;
  status: TopicStatus;
  wrongQuestionIds: ID[];
  dueCards: number;
}

function questionScore(q: Question): number | null {
  if (!q.stats.attempts) return null;
  const last = q.stats.lastScore ?? (q.stats.lastResult === "correct" ? 1 : q.stats.lastResult === "partial" ? 0.5 : 0);
  return last * 0.6 + (q.stats.correct / q.stats.attempts) * 0.4;
}

export function statusOf(m: number | null): TopicStatus {
  if (m == null) return "new";
  return m < 0.55 ? "weak" : m < 0.75 ? "review" : "strong";
}

export function topicStats(data: AppData): TopicStat[] {
  const out: TopicStat[] = [];
  for (const m of data.materials) {
    for (const t of m.topics) {
      const qs = data.questions.filter((q) => q.materialId === m.id && q.topicId === t.id);
      const cs = data.flashcards.filter((c) => c.materialId === m.id && c.topicId === t.id);
      const qScores = qs.map(questionScore).filter((x): x is number => x != null);
      const cScores = cs.map(cardStrength).filter((x): x is number => x != null);
      const accuracy = qScores.length ? qScores.reduce((a, b) => a + b, 0) / qScores.length : null;
      const cStr = cScores.length ? cScores.reduce((a, b) => a + b, 0) / cScores.length : null;
      const wq = qScores.length * 1;
      const wc = cScores.length * 0.5;
      const mastery = wq + wc ? ((accuracy ?? 0) * wq + (cStr ?? 0) * wc) / (wq + wc) : null;
      out.push({
        materialId: m.id,
        materialTitle: m.title,
        subject: m.subject,
        topicId: t.id,
        name: t.name,
        questionCount: qs.length,
        answered: qScores.length,
        accuracy,
        cardCount: cs.length,
        cardStrength: cStr,
        mastery,
        status: statusOf(mastery),
        wrongQuestionIds: qs.filter((q) => q.stats.lastResult && q.stats.lastResult !== "correct").map((q) => q.id),
        dueCards: cs.filter((c) => !isNew(c) && isDue(c)).length,
      });
    }
  }
  return out;
}

export function weakTopics(data: AppData, limit = 6) {
  const order: Record<TopicStatus, number> = { weak: 0, review: 1, new: 2, strong: 3 };
  return topicStats(data)
    .filter((t) => t.questionCount || t.cardCount)
    .sort((a, b) => order[a.status] - order[b.status] || (a.mastery ?? 1) - (b.mastery ?? 1))
    .slice(0, limit);
}

export interface AttemptScore {
  total: number;
  answered: number;
  correct: number;
  incorrect: number;
  partial: number;
  skipped: number;
  score: number; // 0..1 (written answers count fractionally)
  byTopic: { topicId: ID | null; name: string; correct: number; total: number; score: number }[];
}

export function scoreAttempt(a: QuizAttempt, questions: Question[], topicName: (id: ID | null, materialId: ID) => string): AttemptScore {
  const qs = a.questionIds.map((id) => questions.find((q) => q.id === id)).filter((q): q is Question => !!q);
  let correct = 0,
    incorrect = 0,
    partial = 0,
    skipped = 0,
    points = 0;
  const topics = new Map<string, { topicId: ID | null; name: string; correct: number; total: number; points: number }>();
  for (const q of qs) {
    const ans = a.answers[q.id];
    const key = (q.topicId ?? "none") + q.materialId;
    const t = topics.get(key) ?? { topicId: q.topicId, name: topicName(q.topicId, q.materialId), correct: 0, total: 0, points: 0 };
    t.total++;
    if (!ans || ans.skipped || !ans.response) skipped++;
    else if (ans.score >= 0.85) {
      correct++;
      t.correct++;
    } else if (ans.score >= 0.3) partial++;
    else incorrect++;
    points += ans?.score ?? 0;
    t.points += ans?.score ?? 0;
    topics.set(key, t);
  }
  return {
    total: qs.length,
    answered: qs.length - skipped,
    correct,
    incorrect,
    partial,
    skipped,
    score: qs.length ? points / qs.length : 0,
    byTopic: [...topics.values()].map((t) => ({ ...t, score: t.total ? t.points / t.total : 0 })).sort((x, y) => x.score - y.score),
  };
}

const UNDERSTANDING: QuestionType[] = ["mcq", "true_false", "matching", "scenario", "compare"];
const RECALL: QuestionType[] = ["fill_blank", "short"];
const ESSAY: QuestionType[] = ["long", "essay"];

export interface SubjectProgress {
  subject: string;
  understanding: number | null;
  recall: number | null;
  essay: number | null;
  overall: number | null;
  topics: TopicStat[];
}

function avg(xs: number[]) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

export function subjectProgress(data: AppData): SubjectProgress[] {
  const stats = topicStats(data);
  const subjects = [...new Set(data.materials.map((m) => m.subject))];
  return subjects.map((subject) => {
    const mids = new Set(data.materials.filter((m) => m.subject === subject).map((m) => m.id));
    const qs = data.questions.filter((q) => mids.has(q.materialId));
    const sc = (types: QuestionType[]) => avg(qs.filter((q) => types.includes(q.type)).map(questionScore).filter((x): x is number => x != null));
    const cards = avg(data.flashcards.filter((c) => mids.has(c.materialId)).map(cardStrength).filter((x): x is number => x != null));
    const recallQ = sc(RECALL);
    const recall = recallQ != null && cards != null ? recallQ * 0.5 + cards * 0.5 : recallQ ?? cards;
    const parts = [sc(UNDERSTANDING), recall, sc(ESSAY)].filter((x): x is number => x != null);
    return { subject, understanding: sc(UNDERSTANDING), recall, essay: sc(ESSAY), overall: avg(parts), topics: stats.filter((t) => mids.has(t.materialId)) };
  });
}

export function streak(data: AppData, now = new Date()): number {
  const days = new Set(data.sessions.map((s) => dayKey(s.startedAt)));
  let n = 0;
  let d = new Date(now);
  if (!days.has(dayKey(d))) d = addDays(d, -1); // today's session not done yet doesn't break the streak
  while (days.has(dayKey(d))) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

export function reviewCounts(cards: Flashcard[]) {
  return {
    due: cards.filter((c) => !isNew(c) && isDue(c)).length,
    difficult: cards.filter(isDifficult).length,
    mastered: cards.filter(isMastered).length,
    fresh: cards.filter(isNew).length,
    total: cards.length,
  };
}

export function overview(data: AppData) {
  const completed = data.attempts.filter((a) => a.status === "completed").sort((a, b) => (a.finishedAt ?? "").localeCompare(b.finishedAt ?? ""));
  const topicName = (id: ID | null, mid: ID) => data.materials.find((m) => m.id === mid)?.topics.find((t) => t.id === id)?.name ?? "General";
  const scores = completed.map((a) => ({ id: a.id, title: a.title, at: a.finishedAt!, score: scoreAttempt(a, data.questions, topicName).score }));
  const questionsCompleted = data.questions.reduce((s, q) => s + q.stats.attempts, 0);
  const studyMs = data.sessions.reduce((s, x) => s + x.durationMs, 0);
  const weekAgo = Date.now() - 7 * 86400000;
  const weekMs = data.sessions.filter((s) => new Date(s.startedAt).getTime() > weekAgo).reduce((s, x) => s + x.durationMs, 0);
  const recent = scores.slice(-5);
  const earlier = scores.slice(-10, -5);
  const improvement = recent.length && earlier.length ? (avg(recent.map((s) => s.score))! - avg(earlier.map((s) => s.score))!) : null;
  return {
    questionsCompleted,
    quizzesCompleted: completed.length,
    averageScore: avg(scores.map((s) => s.score)),
    scores,
    studyMs,
    weekMs,
    mastered: data.flashcards.filter(isMastered).length,
    streak: streak(data),
    improvement,
  };
}

/** How long today's session should be, based on what's due. */
export function recommendedMinutes(data: AppData) {
  const rc = reviewCounts(data.flashcards);
  const wrong = data.questions.filter((q) => q.stats.lastResult && q.stats.lastResult !== "correct").length;
  const raw = rc.due * 0.5 + rc.difficult * 0.4 + Math.min(wrong, 20) * 1.2 + 5;
  return clamp(Math.round(raw / 5) * 5, 10, 45);
}

/** Pick questions for a session, prioritising weak topics, wrong answers and unseen questions. */
export function pickStudyQuestions(data: AppData, opts: { count: number; materialIds?: ID[]; topicIds?: ID[]; focus?: "weak" | "mixed" }): ID[] {
  const stats = topicStats(data);
  const weight = new Map(stats.map((s) => [s.topicId, s.status === "weak" ? 3 : s.status === "review" ? 2 : s.status === "new" ? 1.5 : 0.7]));
  let pool = data.questions.filter((q) => (!opts.materialIds || opts.materialIds.includes(q.materialId)) && (!opts.topicIds || (q.topicId && opts.topicIds.includes(q.topicId))));
  if (opts.focus === "weak") {
    const weakIds = new Set(stats.filter((s) => s.status === "weak" || s.status === "review").map((s) => s.topicId));
    const focused = pool.filter((q) => (q.topicId && weakIds.has(q.topicId)) || (q.stats.lastResult && q.stats.lastResult !== "correct"));
    if (focused.length >= Math.min(opts.count, 3)) pool = focused;
  }
  // Keep quick sessions snappy: avoid essays unless explicitly studying written answers.
  const quick = pool.filter((q) => q.type !== "essay" && q.type !== "long");
  if (quick.length >= opts.count) pool = quick;
  const scored = pool.map((q) => {
    const wrong = q.stats.lastResult === "incorrect" ? 3 : q.stats.lastResult === "partial" ? 2 : 0;
    const unseen = q.stats.attempts === 0 ? 1.2 : 0;
    const stale = q.stats.lastAnsweredAt ? Math.min(2, (Date.now() - new Date(q.stats.lastAnsweredAt).getTime()) / (5 * 86400000)) : 0;
    return { id: q.id, s: (weight.get(q.topicId ?? "") ?? 1) + wrong + unseen + stale + Math.random() * 0.8 };
  });
  return scored.sort((a, b) => b.s - a.s).slice(0, opts.count).map((x) => x.id);
}

export interface Milestone {
  id: string;
  label: string;
  description: string;
  achieved: boolean;
  progress: number;
}

export function milestones(data: AppData): Milestone[] {
  const o = overview(data);
  const mk = (id: string, label: string, description: string, value: number, target: number): Milestone => ({ id, label, description, achieved: value >= target, progress: clamp(value / target, 0, 1) });
  return [
    mk("first-quiz", "First quiz", "Complete your first quiz", o.quizzesCompleted, 1),
    mk("q100", "Century", "Answer 100 questions", o.questionsCompleted, 100),
    mk("streak7", "Consistent", "Study 7 days in a row", o.streak, 7),
    mk("mastered50", "Long-term memory", "Master 50 flashcards", o.mastered, 50),
    mk("perfect", "Full marks", "Score 100% on a quiz of 5+ questions", o.scores.some((s) => s.score >= 0.999) ? 1 : 0, 1),
    mk("hours10", "Deep work", "Study for 10 hours in total", o.studyMs / 3600000, 10),
  ];
}

export function levelFromXp(xp: number) {
  const level = Math.floor(xp / 500) + 1;
  return { level, into: xp % 500, next: 500 };
}
