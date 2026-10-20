/**
 * The AI that writes everything students see from their slides: notes, topics, practice
 * questions, flashcards and answers. It runs through the SlideQuiz helper in Supabase
 * (supabase/functions/ai). Logged-in students use their account; everyone else gets a hidden
 * guest pass (a Supabase anonymous sign-in) used only for AI, so each browser has its own allowance.
 *
 * If the AI is busy, fails or the daily allowance is used up, the student is told and it tries
 * again later; nothing is made up by rules instead. The one exception is when the AI helper
 * isn't set up at all ("off"), where the built-in notes keep the site usable.
 */
import { useEffect, useSyncExternalStore } from "react";
import { openOutOfCredits } from "@/services/invites";
import { authToken, isLoggedIn, SUPABASE_KEY, SUPABASE_URL, useAccount } from "@/services/account";
import { groundingFor } from "@/services/grounding";
import { actions } from "@/store/actions";
import { getState, subscribeState } from "@/store/store";
import { nowISO, uid } from "@/lib/utils";
import { referencesText, type PageInfo } from "@/services/references";
import { buildNotes, lineKey } from "@/services/notes";
import { tidyLine, tidyTerm } from "@/lib/tidy";
import { isJunkCard, isJunkQuestion } from "@/lib/junk-card";
import type { ExplainedSlide, NoteMark, WrittenMark, WrittenQuestion, AINoteSection, EssayDraft, EssayFeedback, ID, Material, SourceRef, Topic } from "@/types/models";
import type { QuestionDraft } from "./types";
import { aiKey, aiReady } from "./ai-key";
export { aiKey, aiReady, aiQuestionsReady, usesBuiltIn } from "./ai-key";

export const AI_ENDPOINT = `${SUPABASE_URL}/functions/v1/ai`;
/** Characters of slide text per request: small enough that each answer comes back quickly. */
// Smaller pieces, more of them at once: each lecture is written in parallel, so it finishes sooner.
const CHUNK = 9_000;

export class AIError extends Error {
  constructor(
    message: string,
    public limit = false,
    /** The AI helper isn't set up (not deployed, or guest passes switched off). */
    public off = false,
    /** Out of credits (the "invite a friend or get Pro" box has been shown already). */
    public credits = false,
  ) {
    super(message);
  }
}

type CloudPage = { id: ID; label: string; title: string; text: string };

/* ---------------------------------------------------------------- who is asking */

// Clear out guest passes from older versions (an account is now needed for anything that uses credits).
try {
  localStorage.removeItem("slidequiz:ai-guest");
} catch {
  /* storage blocked */
}

/** The student's login for the helper, or null when they're not logged in. */
async function aiToken(): Promise<string | null> {
  return isLoggedIn() ? authToken() : null;
}

async function call<T>(task: string, body: Record<string, unknown>): Promise<T> {
  const token = await aiToken();
  if (!token) throw new AIError("Log in to use this.", false, true);
  let res: Response;
  try {
    res = await fetch(AI_ENDPOINT, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ task, ...body }),
    });
  } catch {
    throw new AIError("Couldn't connect. Check your internet connection and try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 404) throw new AIError("This isn't available right now.", false, true);
  if (res.status === 429 && data?.credits) {
    openOutOfCredits();
    refreshAllowance();
    throw new AIError("You've run out of credits.", true, false, true);
  }
  if (!res.ok) throw new AIError(data?.busy ? "busy" : `${data?.error ?? data?.msg ?? data?.message ?? "Something went wrong. Try again."} (${res.status})`, !!data?.limit);
  return data as T;
}

/* ---------------------------------------------------------------- AI lecture allowance */

/** From the database (see ai_allowance in supabase/ai-setup.sql). Counted in characters of slide text. */
export interface Allowance {
  plan: "guest" | "free" | "plus";
  used: number;
  allowance: number;
  /** Characters in one "lecture". */
  lecture: number;
  /** When it resets (null for guests, whose 2 lectures are a one-off). */
  resets: string | null;
  /** The monthly credits, and bonus credits from invites (which don't expire), in characters. */
  base?: number;
  bonus?: number;
  /** False when this account doesn't get free credits (unconfirmed, throwaway email, or a second account on one inbox). */
  eligible?: boolean;
}
/** Matches the leeway in use_lecture_text, so a lecture that only just fits isn't refused. */
const LEEWAY = 5000;
let allowance: Allowance | null = null;
/** The last known allowance (null until it has been loaded). */
export const currentAllowance = () => allowance;
const allowanceListeners = new Set<() => void>();

let refreshing: Promise<Allowance | null> | null = null;
export function refreshAllowance(): Promise<Allowance | null> {
  // One request at a time; callers share the answer.
  refreshing ??= loadAllowance().finally(() => (refreshing = null));
  return refreshing;
}
async function loadAllowance(): Promise<Allowance | null> {
  try {
    const token = await aiToken();
    if (!token) {
      // Logged out: forget the last account's credits.
      if (allowance) {
        allowance = null;
        allowanceListeners.forEach((l) => l());
      }
      return null;
    }
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/ai_allowance`, { method: "POST", headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: "{}" });
    if (!r.ok) return allowance;
    allowance = (await r.json()) as Allowance;
    allowanceListeners.forEach((l) => l());
  } catch {
    /* offline: keep what we had */
  }
  return allowance;
}

// Keep credits fresh: coming back to the tab, or another tab changing them.
if (typeof window !== "undefined") {
  let last = 0;
  const again = () => {
    if (Date.now() - last < 15000) return;
    last = Date.now();
    refreshAllowance();
  };
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && again());
  window.addEventListener("focus", again);
}

/** The student's AI lectures, kept up to date as they log in and out. */
export function useAllowance(): Allowance | null {
  const uid = useAccount().user?.id ?? null;
  useEffect(() => {
    refreshAllowance();
  }, [uid]);
  return useSyncExternalStore(
    (l) => (allowanceListeners.add(l), () => allowanceListeners.delete(l)),
    () => allowance,
    () => allowance,
  );
}

/** Roughly how many characters a material sends (as the helper counts them). */
export function textSize(m: Material): number {
  return cloudPages(m).reduce((n, p) => n + p.label.length + p.title.length + Math.min(p.text.length, 4000) + 50, 0);
}
/** The same, for some topics only (flashcards from a few topics cost less). */
export function textSizeFor(m: Material, topicIds: ID[] = []): number {
  return cloudPages(m, topicIds).reduce((n, p) => n + p.label.length + p.title.length + Math.min(p.text.length, 4000) + 50, 0);
}

/**
 * Before something that uses credits: true if there's room for it, otherwise shows the
 * "invite a friend or get Pro" box and returns false. Unknown allowance (offline) is let through.
 */
export function ensureCredits(chars: number): boolean {
  if (fits(chars, allowance)) return true;
  openOutOfCredits();
  return false;
}

/** "about 1 credit", "less than 1 credit", "about 3 credits": what something will use. */
export function costText(chars: number): string {
  const n = chars / (allowance?.lecture ?? 30000);
  if (n < 0.75) return n < 0.35 ? "a small part of a credit" : "about half a credit";
  return lecturesText(Math.max(1, Math.round(n)));
}

/** How many "lectures" some text uses, to the nearest whole one (0 means less than one). */
export const lecturesFor = (chars: number, a: Allowance | null) => {
  const n = chars / (a?.lecture ?? 30000);
  return n < 0.75 ? 0 : Math.max(1, Math.round(n));
};
/** Lectures left, to the nearest whole one. */
export const lecturesLeft = (a: Allowance) => Math.max(0, Math.round((a.allowance - a.used) / a.lecture));
/** "less than 1 AI lecture", "1 AI lecture", "about 3 AI lectures". */
export const lecturesText = (n: number) => (n === 0 ? "less than 1 credit" : n === 1 ? "1 credit" : `about ${n} credits`);
/** Is there room for this much text? */
export const fits = (chars: number, a: Allowance | null) => !a || a.used + chars <= a.allowance + LEEWAY;

/** The included slides' text (reference lists removed), ready to send. */
function cloudPages(m: Material, topicIds: ID[] = []): CloudPage[] {
  return groundingFor([m], topicIds.length ? { topicIds } : {}).pages.map((p) => ({ id: p.id, label: p.label, title: p.title, text: p.text }));
}

/** Splits a long lecture into pieces the AI can handle in one go. */
function chunks(pages: CloudPage[]): CloudPage[][] {
  const out: CloudPage[][] = [];
  let cur: CloudPage[] = [];
  let size = 0;
  for (const p of pages) {
    const n = p.title.length + p.text.length + 40;
    if (cur.length && size + n > CHUNK) {
      out.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(p);
    size += n;
  }
  if (cur.length) out.push(cur);
  return out;
}

const running = new Map<ID, Promise<void>>();

/**
 * Has the AI write the notes, choose the topics and write the questions for a material.
 * Does nothing if it's already done for these slides, or if AI isn't available.
 */
export function enhanceMaterial(id: ID): Promise<void> {
  const m0 = getState().materials.find((x) => x.id === id);
  if (!m0 || !m0.pages.some((p) => p.included && p.text.trim())) return Promise.resolve();
  const key = aiKey(m0);
  if (m0.ai?.key === key && m0.ai.status === "done") return Promise.resolve();
  if (running.has(id)) return running.get(id)!;
  const job = (async () => {
    // Check there are enough AI lectures left before starting, so nothing is half-done.
    const a = await refreshAllowance();
    if (!fits(textSize(m0), a)) {
      const cur = getState().materials.find((x) => x.id === id)?.ai;
      if (cur?.status !== "limit" || cur.key !== key || cur.error !== "allowance") actions.updateMaterial(id, { ai: { key, status: "limit", notes: cur?.notes, questions: cur?.questions, error: "allowance", at: nowISO() } });
      running.delete(id);
      return;
    }
    actions.updateMaterial(id, { ai: { key, status: "working", at: nowISO() } });
    // Merge into the current AI state (notes and questions arrive separately, in any order).
    const setAi = (patch: Partial<NonNullable<Material["ai"]>>) => {
      const cur = getState().materials.find((x) => x.id === id)?.ai;
      actions.updateMaterial(id, { ai: { key, status: "working", ...(cur?.key === key ? cur : {}), ...patch, at: nowISO() } });
    };
    try {
      const pages = cloudPages(m0);
      const parts = chunks(pages);
      let notesDone = false;
      // Notes and questions are written at the same time. Each piece's questions can be
      // practised as soon as they arrive, rather than waiting for the whole lecture.
      const notesJob = (async () => {
        const res = await runLimited(parts, 5, (c) => call<{ subject?: string; sections: AINoteSection[] }>("notes", { title: m0.title, pages: c }));
        const sections = mergeSections(res.flatMap((p) => p.sections ?? []), pages);
        if (!sections.length) throw new AIError("No notes came back.");
        applyTopics(id, sections);
        notesDone = true;
        actions.retopicPractice(id);
        const subject = res.map((p) => String(p.subject ?? "").trim()).find((s) => s && s.length <= 40);
        if (subject) actions.updateMaterial(id, { subject });
        setAi({ notes: sections, style: 2 });
        return sections;
      })();
      let first = true;
      let count = 0;
      const questionsJob = runLimited(parts, 5, async (c) => {
        const r = await call<{ questions: CloudQuestion[] }>("questions", { title: m0.title, pages: c });
        const m1 = getState().materials.find((x) => x.id === id);
        if (!m1) return;
        const topicOf = new Map(m1.pages.map((p) => [p.id, notesDone ? p.topicId : null]));
        const labelOf = new Map(m1.pages.map((p) => [p.id, p.label]));
        const drafts = (r.questions ?? []).flatMap((q) => toDraft(q, m1, topicOf, labelOf));
        if (!drafts.length) return;
        // The first piece replaces any questions from before the slides changed (keeping progress on the same ones).
        if (first) {
          first = false;
          actions.setPracticeQuestions(id, drafts);
          count += drafts.length;
        } else count += actions.addPracticeQuestions(id, drafts);
        setAi({ questions: true });
      });
      // Written-answer questions too, so they're ready when the lecture opens (only if there are credits for them).
      const writtenJob = !m0.written?.length && fits(textSize(m0) + Math.ceil(textSize(m0) / 2), a)
        ? cloudWrittenQuestions(m0, 6)
            .then((fresh) => {
              const cur = getState().materials.find((x) => x.id === id);
              if (cur && fresh.length && !cur.written?.length) actions.updateMaterial(id, { written: fresh });
            })
            .catch(() => {
              /* written questions are made later on the Written tab instead */
            })
        : Promise.resolve();
      const [sections] = await Promise.all([notesJob, questionsJob, writtenJob]);
      if (notesDone) actions.retopicPractice(id);
      setAi({ status: "done", notes: sections, questions: count > 0 });
      if (notesDone) autoFlashcards(id);
    } catch (e) {
      const cur = getState().materials.find((x) => x.id === id);
      const err = e instanceof AIError ? e : null;
      const status = err?.off ? "off" : err?.limit ? "limit" : "failed";
      actions.updateMaterial(id, { ai: { key, status, notes: cur?.ai?.notes, questions: cur?.ai?.questions, error: (e as Error)?.message, at: nowISO() } });
      // AI not set up at all: make the built-in questions so there's something to practise.
      if (status === "off") (await import("@/services/practice")).buildPracticeQuestions(id);
    } finally {
      running.delete(id);
      refreshAllowance();
    }
  })();
  running.set(id, job);
  return job;
}

/**
 * Resolves once a lecture has its notes and its first practice questions (or writing has stopped,
 * e.g. out of credits or an error), so it can be opened with something already there.
 */
export function waitUntilReady(id: ID, timeoutMs = 120_000): Promise<void> {
  const ready = () => {
    const m = getState().materials.find((x) => x.id === id);
    const ai = m?.ai;
    if (!m || !m.pages.some((p) => p.included && p.text.trim())) return true;
    if (!ai) return false;
    if (ai.status && ai.status !== "working") return true;
    return !!ai.notes && !!ai.questions;
  };
  return new Promise((resolve) => {
    if (ready()) return resolve();
    const stop = subscribeState(() => {
      if (ready()) {
        stop();
        clearTimeout(t);
        resolve();
      }
    });
    const t = setTimeout(() => {
      stop();
      resolve();
    }, timeoutMs);
  });
}

async function runLimited<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

/** Tidies what came back: known slide ids only, empty parts dropped, a topic split across pieces joined up. */
function mergeSections(raw: AINoteSection[], pages: CloudPage[]): AINoteSection[] {
  const ids = new Set(pages.map((p) => p.id));
  const out: AINoteSection[] = [];
  for (const s of raw) {
    const parts = (s.parts ?? [])
      .map((p) => ({ heading: p.heading?.trim() || undefined, pageIds: (p.pageIds ?? []).filter((x) => ids.has(x)), intro: typeof p.intro === "string" && p.intro.trim() ? p.intro.trim() : undefined, points: (p.points ?? []).filter((x) => x && x.text?.trim()), table: Array.isArray(p.table) ? p.table : undefined, style: p.style === "steps" ? ("steps" as const) : undefined }))
      .filter((p) => p.points.length || p.intro || p.table);
    if (!parts.length) continue;
    const last = out[out.length - 1];
    if (last && last.title.trim().toLowerCase() === (s.title ?? "").trim().toLowerCase()) last.parts.push(...parts);
    else out.push({ title: (s.title ?? "Notes").trim(), summary: typeof s.summary === "string" && s.summary.trim() ? s.summary.trim() : undefined, parts });
  }
  return out;
}

/** The AI's sections become the material's topics, so notes, practice and progress all match. */
function applyTopics(id: ID, sections: AINoteSection[]) {
  const m = getState().materials.find((x) => x.id === id);
  if (!m) return;
  const topicOfPage = new Map<ID, ID>();
  const topics: Topic[] = sections.map((s) => {
    const t: Topic = { id: uid("top"), name: s.title, pageIds: [] };
    for (const part of s.parts) for (const pid of part.pageIds) if (!topicOfPage.has(pid)) topicOfPage.set(pid, t.id);
    return t;
  });
  // Slides the AI didn't mention join the topic of the slide before them.
  let prev: ID | null = topics[0]?.id ?? null;
  const pages = m.pages.map((p) => {
    const tid = topicOfPage.get(p.id) ?? prev;
    prev = tid;
    return { ...p, topicId: tid };
  });
  for (const t of topics) t.pageIds = pages.filter((p) => p.topicId === t.id).map((p) => p.id);
  actions.updateMaterial(id, { pages, topics: topics.filter((t) => t.pageIds.length) });
}

type CloudQuestion = { pageId: ID; question: string; correct: string; wrong: string[]; explanation?: string };

function toDraft(q: CloudQuestion, m: Material, topicOf: Map<ID, ID | null>, labelOf: Map<ID, string>): QuestionDraft[] {
  const wrong = [...new Set((q.wrong ?? []).map((w) => String(w).trim()).filter((w) => w && w !== q.correct))];
  if (!q.question?.trim() || !q.correct?.trim() || wrong.length < 2) return [];
  // About the course or the lecture itself (recording, the room, deadlines), not the subject.
  if (isJunkQuestion(q.question, q.correct)) return [];
  const source: SourceRef[] = labelOf.has(q.pageId) ? [{ pageId: q.pageId, label: labelOf.get(q.pageId)! }] : [];
  return [
    {
      materialId: m.id,
      topicId: topicOf.get(q.pageId) ?? null,
      type: "mcq",
      difficulty: "medium",
      prompt: q.question.trim(),
      options: [q.correct.trim(), ...wrong],
      correctIndex: 0,
      pool: true,
      balanced: true,
      answer: q.correct.trim(),
      keyPoints: [],
      explanation: q.explanation?.trim() || "",
      sources: source,
      marks: 1,
    },
  ];
}

/**
 * More practice questions once the first ones are done. The lecture is worked through a piece at a
 * time and each piece's questions are added as soon as they arrive, so practice can carry on
 * straight away. Returns how many were added. Throws an AIError if it can't.
 */
export async function cloudMoreQuestions(id: ID, onAdded?: (total: number) => void): Promise<number> {
  const m = getState().materials.find((x) => x.id === id);
  if (!m) return 0;
  const pages = cloudPages(m);
  const topicOf = new Map(m.pages.map((p) => [p.id, p.topicId]));
  const labelOf = new Map(m.pages.map((p) => [p.id, p.label]));
  let total = 0;
  for (const c of chunks(pages)) {
    const ids = new Set(c.map((p) => p.id));
    const avoid = getState()
      .questions.filter((q) => q.materialId === id && q.pool && (!q.sources[0] || ids.has(q.sources[0].pageId)))
      .map((q) => q.prompt)
      .slice(-80);
    const r = await call<{ questions: CloudQuestion[] }>("questions", { title: m.title, pages: c, avoid });
    const drafts = (r.questions ?? []).flatMap((q) => toDraft(q, m, topicOf, labelOf));
    total += actions.addPracticeQuestions(id, drafts);
    onAdded?.(total);
  }
  return total;
}

const SKIP_TITLE = /^(thank|any questions|questions\??$|references|reading|further reading|learning (objectives|outcomes)|objectives|contents|agenda|overview|housekeeping|welcome|introduction to the module|module (overview|information)|lecture recording|recording|assessment|timetable)/i;
const filling = new Set<ID>();
/**
 * Lectures made before every slide was guaranteed questions: finds slides with real content that have
 * none and writes questions for just those, once per lecture (fair use, not credits). Runs in the background.
 */
export async function fillQuestionGaps(id: ID): Promise<number> {
  const m = getState().materials.find((x) => x.id === id);
  if (!m || filling.has(id) || !aiReady(m) || m.ai?.status !== "done" || !m.ai.questions) return 0;
  const key = aiKey(m);
  if (m.ai.gaps === key) return 0;
  const have = new Set(getState().questions.filter((q) => q.materialId === id && q.pool).flatMap((q) => q.sources.map((s) => s.pageId)));
  const gaps = cloudPages(m).filter((p) => !have.has(p.id) && `${p.title} ${p.text}`.trim().length > 120 && !SKIP_TITLE.test(p.title.trim()));
  const done = () => {
    const cur = getState().materials.find((x) => x.id === id)?.ai;
    if (cur) actions.updateMaterial(id, { ai: { ...cur, gaps: key } });
  };
  if (!gaps.length) {
    done();
    return 0;
  }
  filling.add(id);
  let added = 0;
  try {
    const topicOf = new Map(m.pages.map((p) => [p.id, p.topicId]));
    const labelOf = new Map(m.pages.map((p) => [p.id, p.label]));
    const avoid = getState().questions.filter((q) => q.materialId === id && q.pool).map((q) => q.prompt).slice(-60);
    for (const c of chunks(gaps)) {
      const r = await call<{ questions: CloudQuestion[] }>("gapQuestions", { title: m.title, pages: c, avoid });
      const ids = new Set(c.map((p) => p.id));
      const drafts = (r.questions ?? []).filter((q) => ids.has(q.pageId)).flatMap((q) => toDraft(q, m, topicOf, labelOf));
      added += actions.addPracticeQuestions(id, drafts);
    }
    done();
  } catch {
    /* tried again next time the lecture is opened */
  } finally {
    filling.delete(id);
  }
  return added;
}

/** Bump to check every lecture's questions again (when the standard for what counts as content changes). */
const REVIEW_VERSION = "1";
const reviewing = new Set<ID>();
/**
 * Brings an older lecture's questions up to the current standard: anything not about the subject itself
 * (admin, the module, the lecturer, recordings, assessment) is removed. Fair use, once per lecture
 * (again only if its questions change). Runs in the background.
 */
export async function reviewQuestions(id: ID): Promise<number> {
  const m = getState().materials.find((x) => x.id === id);
  if (!m || reviewing.has(id) || !isLoggedIn() || m.ai?.status !== "done" || !m.ai.questions) return 0;
  const mcq = getState().questions.filter((q) => q.materialId === id && q.pool);
  const written = m.written ?? [];
  const sig = `${REVIEW_VERSION}:${mcq.length}:${written.length}`;
  if (m.ai.reviewed === sig) return 0;
  const all = [...mcq.map((q) => ({ id: q.id, q: q.prompt, a: q.answer ?? "" })), ...written.map((w) => ({ id: w.id, q: w.question, a: w.model.slice(0, 200) }))];
  reviewing.add(id);
  let removed = 0;
  try {
    const junk: ID[] = [];
    for (let i = 0; i < all.length; i += 60) {
      const part = all.slice(i, i + 60);
      const r = await call<{ junk: string[] }>("reviewQuestions", { title: m.title, pages: [], questions: part });
      const ids = new Set(part.map((x) => x.id));
      junk.push(...(Array.isArray(r.junk) ? r.junk : []).filter((x) => ids.has(x)));
    }
    // Never strip a lecture bare on one check: if most were flagged, something went wrong, so leave them.
    if (junk.length && junk.length < all.length * 0.5) {
      actions.removeOffTopic(id, junk);
      removed = junk.length;
    }
    const now = getState().materials.find((x) => x.id === id);
    if (now?.ai) {
      const left = getState().questions.filter((q) => q.materialId === id && q.pool).length;
      actions.updateMaterial(id, { ai: { ...now.ai, reviewed: `${REVIEW_VERSION}:${left}:${(now.written ?? []).length}` } });
    }
  } catch {
    /* tried again next time */
  } finally {
    reviewing.delete(id);
  }
  return removed;
}

let tidyingAll = false;
/** Every lecture with questions: fill slides that have none, then remove anything not about the subject. One lecture at a time. */
export async function updateAllQuestions() {
  if (tidyingAll || !isLoggedIn()) return;
  tidyingAll = true;
  try {
    for (const m of [...getState().materials]) {
      if (m.ai?.status !== "done" || !m.ai.questions) continue;
      await fillQuestionGaps(m.id).catch(() => 0);
      await reviewQuestions(m.id).catch(() => 0);
    }
  } finally {
    tidyingAll = false;
  }
}

const explaining = new Map<string, Promise<"ok" | "admin">>();
/**
 * The Summary tab: a key point and a simple, step-by-step explanation for each content slide (admin slides
 * are left out). Written the first time the lecture is opened there, a piece at a time so it shows as it
 * arrives, and kept until the slides change. Fair use rather than credits.
 */
/**
 * Explains one slide for the Summary tab, when the student asks for it (fair use, not credits).
 * Saved with the lecture, so asking again is instant. Returns "admin" for admin slides or ones with nothing to explain.
 */
export function explainSlide(id: ID, pageId: ID): Promise<"ok" | "admin"> {
  const m = getState().materials.find((x) => x.id === id);
  if (!m) return Promise.resolve("admin");
  const key = aiKey(m);
  const cached = m.explained?.key === key ? m.explained.slides : [];
  if (cached.some((x) => x.pageId === pageId)) return Promise.resolve("ok");
  const jobKey = id + ":" + pageId;
  if (explaining.has(jobKey)) return explaining.get(jobKey)!;
  const job = (async (): Promise<"ok" | "admin"> => {
    const page = cloudPages(m).find((p) => p.id === pageId);
    if (!page || `${page.title} ${page.text}`.trim().length < 25 || SKIP_TITLE.test(page.title.trim())) return "admin";
    const r = await call<{ slides: ExplainedSlide[] }>("explain", { title: m.title, pages: [page], all: true });
    const x = (r.slides ?? []).find((y) => y && y.pageId === pageId && y.keyPoint?.trim() && Array.isArray(y.steps) && y.steps.length);
    if (!x || isJunkQuestion(x.title ?? "", x.keyPoint)) return "admin";
    const slide: ExplainedSlide = {
      pageId,
      title: String(x.title ?? "").trim(),
      keyPoint: String(x.keyPoint).trim(),
      steps: x.steps.filter((st) => st?.point?.trim()).map((st) => ({ point: String(st.point).trim(), details: (Array.isArray(st.details) ? st.details : []).map((d) => String(d).trim()).filter(Boolean) })),
      example: String(x.example ?? "").trim() || undefined,
      remember: (Array.isArray(x.remember) ? x.remember : []).filter((r2) => r2?.term && r2?.role).map((r2) => ({ term: String(r2.term).trim(), role: String(r2.role).trim(), note: String(r2.note ?? "").trim() })),
    };
    // Re-read: another slide may have been saved meanwhile.
    const now = getState().materials.find((y) => y.id === id);
    if (!now) return "ok";
    const order = new Map(now.pages.map((p, i) => [p.id, i]));
    const have = now.explained?.key === key ? now.explained.slides.filter((y) => y.pageId !== pageId) : [];
    const slides = [...have, slide].sort((a2, b2) => (order.get(a2.pageId) ?? 0) - (order.get(b2.pageId) ?? 0));
    actions.updateMaterial(id, { explained: { key, slides, at: nowISO() } });
    return "ok";
  })().finally(() => explaining.delete(jobKey));
  explaining.set(jobKey, job);
  return job;
}

/** True when a question's options aren't all about the same length (matches the check on the server). */
function uneven(options: string[]) {
  const l = options.map((o) => o.length);
  const avg = l.reduce((a, b) => a + b, 0) / l.length;
  return Math.max(...l) - Math.min(...l) > Math.max(10, avg * 0.25);
}

const balancing = new Set<ID>();
/**
 * Questions made before the length check: rewrites the options of any whose right answer could be spotted
 * by its length, 20 at a time, in the background. Each question is only ever checked once.
 */
/** Every line of the notes as shown (the text highlights are measured against), by its key. */
function shownLines(m: Material) {
  const out: { key: string; page: ID; full: string }[] = [];
  for (const sec of buildNotes(m))
    for (const sl of sec.slides)
      sl.lines.forEach((l, i) => {
        const text = tidyLine(l.text);
        const term = l.kind === "sub" ? "" : l.term ? tidyTerm(l.term) : "";
        out.push({ key: lineKey(sl.page.id, i, l.text), page: sl.page.id, full: term ? term + (text ? l.sep ?? ": " : "") + text : text });
      });
  return out;
}

/** Highlights follow their words into the re-laid-out notes (same slide first, then anywhere). */
function moveMarks(before: Material, after: Material): NoteMark[] {
  const old = new Map(shownLines(before).map((l) => [l.key, l]));
  const now = shownLines(after);
  return (before.marks ?? []).map((mk) => {
    const was = old.get(mk.key);
    const word = mk.text || was?.full.slice(mk.start, mk.end) || "";
    if (!word) return mk;
    const hit = now.find((l) => l.page === was?.page && l.full.includes(word)) ?? now.find((l) => l.full.includes(word));
    if (!hit) return mk;
    const start = hit.full.indexOf(word);
    return { ...mk, key: hit.key, start, end: start + word.length };
  });
}

const restyling = new Set<ID>();
/**
 * Notes written before the newer layout are laid out again (summaries, steps, tables, callouts), a few topics at a time.
 * Highlights move to the same words in the new layout.
 */
export async function restyleOldNotes(materialId: ID, onStart?: () => void) {
  const m = getState().materials.find((x) => x.id === materialId);
  const notes = m?.ai?.notes;
  if (!m || !notes?.length || m.ai?.style === 2 || m.ai?.status === "working" || restyling.has(materialId) || !isLoggedIn()) return;
  restyling.add(materialId);
  onStart?.();
  try {
    const chunks: AINoteSection[][] = [];
    for (let i = 0; i < notes.length; i += 2) chunks.push(notes.slice(i, i + 2));
    const back = await runLimited(chunks, 5, (c) => call<{ sections: AINoteSection[] }>("restyleNotes", { pages: [], title: m.title, sections: c }).catch(() => ({ sections: [] as AINoteSection[] })));
    const pages = m.pages.map((p) => ({ id: p.id })) as unknown as CloudPage[];
    let changed = 0;
    const next = chunks.flatMap((orig, ci) => {
      const got = mergeSections(back[ci]?.sections ?? [], pages);
      // Same topics in the same order, or keep the old ones (so topics and progress still line up).
      if (got.length !== orig.length) return orig;
      changed++;
      return orig.map((o, k) => {
        const own = new Set(o.parts.flatMap((p) => p.pageIds));
        const parts = got[k].parts.map((p) => ({ ...p, pageIds: p.pageIds.filter((x) => own.has(x)).length ? p.pageIds.filter((x) => own.has(x)) : [o.parts[0]?.pageIds[0]].filter(Boolean) as ID[] }));
        return { ...got[k], title: o.title, parts };
      });
    });
    const cur = getState().materials.find((x) => x.id === materialId);
    if (!cur?.ai || cur.ai.notes !== notes || !changed) return;
    const ai = { ...cur.ai, notes: next, style: changed === chunks.length ? 2 : cur.ai.style };
    actions.updateMaterial(materialId, { ai, ...(cur.marks?.length ? { marks: moveMarks(cur, { ...cur, ai }) } : {}) });
  } catch {
    /* try again next time */
  } finally {
    restyling.delete(materialId);
  }
}

export async function balanceOldQuestions(materialId: ID) {
  if (balancing.has(materialId) || !isLoggedIn()) return;
  balancing.add(materialId);
  try {
    const old = getState().questions.filter((q) => q.materialId === materialId && q.pool && !q.balanced && q.type === "mcq" && (q.options?.length ?? 0) >= 3);
    const fine = old.filter((q) => !uneven(q.options!));
    if (fine.length) actions.rewordOptions(fine.map((q) => ({ id: q.id })));
    const todo = old.filter((q) => uneven(q.options!));
    for (let i = 0; i < todo.length; i += 20) {
      const batch = todo.slice(i, i + 20);
      const r = await call<{ questions: { question: string; correct: string; wrong: string[] }[] }>("balance", {
        questions: batch.map((q) => ({ question: q.prompt, correct: q.options![q.correctIndex ?? 0], wrong: q.options!.filter((_, k) => k !== (q.correctIndex ?? 0)) })),
      });
      const back = r.questions ?? [];
      actions.rewordOptions(
        batch.map((q, k) => {
          const b = back[k];
          const ok = b && typeof b.correct === "string" && Array.isArray(b.wrong) && b.wrong.length === q.options!.length - 1;
          if (!ok) return { id: q.id };
          const ci = q.correctIndex ?? 0;
          const options = [...b.wrong];
          options.splice(ci, 0, b.correct);
          return { id: q.id, options };
        }),
      );
    }
  } catch {
    /* try again next time */
    balancing.delete(materialId);
  }
}

/** A deck of flashcards for a new lecture, made in the background once its notes are done (no extra credits). */
async function autoFlashcards(id: ID) {
  if ((getState().decks ?? []).some((d) => d.materialIds.includes(id))) return;
  try {
    const m = getState().materials.find((x) => x.id === id);
    if (!m) return;
    const cards = await cloudFlashcards(m, [], true);
    const m2 = getState().materials.find((x) => x.id === id);
    if (!m2 || !cards.length || (getState().decks ?? []).some((d) => d.materialIds.includes(id))) return;
    const seen = new Set<string>();
    const drafts = cards.flatMap((c) => {
      const k = c.back.trim().toLowerCase();
      if (seen.has(k)) return [];
      seen.add(k);
      const page = m2.pages.find((p) => p.id === c.pageId);
      return [{ materialId: id, topicId: page?.topicId ?? null, source: page ? { pageId: page.id, label: page.label } : undefined, front: c.front.trim(), back: c.back.trim() }];
    });
    actions.createDeck(m2.title, [id], drafts);
  } catch {
    /* they can still make them on the Flashcards page */
  }
}

/** Flashcards written by the AI. Throws an AIError if it can't. */
export async function cloudFlashcards(m: Material, topicIds: ID[], auto = false): Promise<{ front: string; back: string; pageId: ID }[]> {
  const pages = cloudPages(m, topicIds);
  if (!pages.length) return [];
  const res = await runLimited(chunks(pages), 4, (c) => call<{ cards: { front: string; back: string; pageId: ID }[] }>(auto ? "autoFlashcards" : "flashcards", { title: m.title, pages: c }));
  return res.flatMap((r) => r.cards ?? []).filter((c) => c.front?.trim() && c.back?.trim() && !isJunkCard(c.front, c.back));
}

/** An answer about the lecture. Throws an AIError if it can't. */
export async function cloudChat(m: Material, history: { role: string; content: string }[], message: string): Promise<{ answer: string; pageIds: ID[] }> {
  {
    const pages = cloudPages(m);
    // Long lectures: send the slides that share the most words with the question.
    const words = new Set(message.toLowerCase().match(/[a-z]{4,}/g) ?? []);
    const score = (p: CloudPage) => (p.title + " " + p.text).toLowerCase().split(/\W+/).filter((w) => words.has(w)).length;
    let chosen = pages;
    if (pages.reduce((n, p) => n + p.text.length, 0) > CHUNK) chosen = [...pages].sort((a, b) => score(b) - score(a)).slice(0, 30).sort((a, b) => pages.indexOf(a) - pages.indexOf(b));
    return await call<{ answer: string; pageIds: ID[] }>("chat", { title: m.title, pages: chosen, history: history.slice(-8), message });
  }
}

/* ---------------------------------------------------------------- essays (Pro) */

/**
 * The lectures for an essay, trimmed to what one request can take. With several lectures each
 * slide is labelled with its lecture, and long slides are shortened so every lecture fits.
 */
function essayPages(materials: Material[]): CloudPage[] {
  const multi = materials.length > 1;
  const all = groundingFor(materials).pages.map((p) => ({ id: p.id, label: multi ? `${p.materialTitle} · ${p.label}` : p.label, title: p.title, text: p.text }));
  const BUDGET = 58_000;
  const total = all.reduce((n, p) => n + p.label.length + p.title.length + Math.min(p.text.length, 4000) + 40, 0);
  const cap = total <= BUDGET ? 4000 : Math.max(250, Math.floor(BUDGET / Math.max(1, all.length)) - 80);
  let size = 0;
  return all
    .map((p) => ({ ...p, text: p.text.length > cap ? p.text.slice(0, cap) : p.text }))
    .filter((p) => (size += p.label.length + p.title.length + p.text.length + 40) <= BUDGET);
}


/** Up to 3 new essay questions on these lectures (the first is used, the rest offered as ideas). */
export async function cloudEssayQuestion(e: EssayDraft, materials: Material[]): Promise<string[]> {
  const res = await call<{ questions: { question: string }[] }>("essayQuestions", {
    title: materials.length === 1 ? materials[0].title : materials.map((m) => m.title).join(", ").slice(0, 200),
    pages: essayPages(materials),
    count: 3,
    avoid: [...(e.asked ?? []), e.question].filter(Boolean),
    rubric: e.rubric ?? "",
    words: e.words ?? undefined,
  });
  const qs = (res.questions ?? []).map((q) => String(q.question ?? "").trim()).filter(Boolean);
  if (!qs.length) throw new AIError("No question came back. Try again.");
  return qs;
}

/** The essay as labelled boxes, so feedback can point at the exact box. */
function labelledEssay(e: EssayDraft) {
  const box = (key: string, label: string, text: string) => `[${key}] ${label}: ${text.trim() || "(empty)"}`;
  const lines: string[] = [];
  if (e.mode === "simple") {
    lines.push(box("intro", "Introduction", e.intro.text));
    e.points.forEach((p, i) => lines.push(box(`point${i + 1}`, `Body point ${i + 1}`, p.text)));
    lines.push(box("conclusion", "Conclusion", e.conclusion.text));
  } else {
    const I = e.intro, C = e.conclusion;
    lines.push(box("intro.context", "Introduction, background context", I.context), box("intro.terms", "Introduction, key terms", I.terms), box("intro.problem", "Introduction, the question or problem", I.problem), box("intro.scope", "Introduction, scope", I.scope), box("intro.thesis", "Introduction, thesis statement", I.thesis));
    e.points.forEach((p, i) => {
      const n = i + 1;
      lines.push(box(`point${n}.topic`, `Point ${n}, topic sentence`, p.topic), box(`point${n}.evidence`, `Point ${n}, evidence`, p.evidence), box(`point${n}.explain`, `Point ${n}, explanation`, p.explain), box(`point${n}.link`, `Point ${n}, link`, p.link));
    });
    lines.push(box("conclusion.restate", "Conclusion, restated thesis", C.restate), box("conclusion.findings", "Conclusion, key findings", C.findings), box("conclusion.implications", "Conclusion, implications", C.implications), box("conclusion.future", "Conclusion, future directions (optional)", C.future), box("conclusion.final", "Conclusion, final sentence", C.final));
  }
  const refs = referencesText(e.references, e.refStyle ?? "harvard");
  lines.push(`[references] References (${e.refStyle ?? "harvard"} style): ${refs ? refs.replace(/\n/g, " | ") : "(none)"}`);
  return lines.join("\n");
}

/** Reads a web page's title, authors and date for a reference (no AI). */
export async function cloudCite(url: string): Promise<PageInfo> {
  return call<PageInfo>("cite", { url, pages: [] });
}

/** Feedback on the essay so far, against good essay structure and style. Throws an AIError if it can't. */
export async function cloudEssayFeedback(e: EssayDraft, materials: Material[]): Promise<EssayFeedback> {
  const subject = [...new Set(materials.map((m) => m.subject).filter(Boolean))].join(", ") || "General";
  const essay = labelledEssay(e);
  const r = await call<any>("essayFeedback", {
    title: materials.map((m) => m.title).join(", ").slice(0, 200),
    pages: essayPages(materials).slice(0, 60),
    question: e.question,
    words: e.words ?? 1500,
    subject,
    rubric: e.rubric ?? "",
    essay,
  });
  const str = (x: unknown) => String(x ?? "").trim();
  const overall = str(r.overall);
  if (!overall) throw new AIError("The feedback came back incomplete. Try again.");
  return {
    overall,
    strengths: (Array.isArray(r.strengths) ? r.strengths : []).map(str).filter(Boolean).slice(0, 5),
    notes: (Array.isArray(r.notes) ? r.notes : [])
      .map((n: any) => ({ box: str(n.box).replace(/^\[|\]$/g, ""), text: str(n.text) }))
      .filter((n: { box: string; text: string }) => n.text)
      .slice(0, 30),
    at: nowISO(),
  };
}

/* ---------------------------------------------------------------- written answers */

/** New written-answer questions with mark schemes. Throws an AIError if it can't. */
export async function cloudWrittenQuestions(m: Material, count = 6): Promise<WrittenQuestion[]> {
  const pages = essayPages([m]);
  const labelOf = new Map(m.pages.map((p) => [p.id, p.label]));
  const r = await call<{ questions: { question: string; marks: number; points: { text: string; pageId?: string }[]; model: string }[] }>("writtenQuestions", {
    title: m.title,
    pages,
    count,
    avoid: (m.written ?? []).map((q) => q.question),
  });
  return (r.questions ?? [])
    .filter((q) => q.question?.trim() && Array.isArray(q.points) && q.points.length)
    .map((q) => {
      const marks = Math.max(1, Math.min(6, Math.round(Number(q.marks) || 1)));
      return {
        id: uid("wq"),
        question: q.question.trim(),
        marks,
        points: q.points
          .map((p) => ({ text: String(p?.text ?? p).trim(), pageId: p?.pageId && labelOf.has(p.pageId) ? p.pageId : undefined, label: p?.pageId ? labelOf.get(p.pageId) : undefined }))
          .filter((p) => p.text),
        model: String(q.model ?? "").trim(),
        at: nowISO(),
      };
    })
    .filter((q) => q.points.length);
}

/** Marks a written answer against its mark scheme. Throws an AIError if it can't. */
export async function cloudMarkWritten(q: WrittenQuestion, answer: string): Promise<WrittenMark> {
  const r = await call<{ awarded: number; hit: number[]; extra?: string[]; checks?: { quote?: string; ok?: boolean }[]; quotes?: Record<string, string>; feedback: string; improve?: string }>("markWritten", {
    pages: [],
    question: q.question,
    marks: q.marks,
    points: q.points.map((p) => p.text),
    model: q.model,
    answer,
  });
  const hit = [...new Set((Array.isArray(r.hit) ? r.hit : []).map(Number).filter((i) => Number.isInteger(i) && i >= 0 && i < q.points.length))];
  // Each part is judged on its own, so the marks are the parts that were right (not a separate guess).
  const checks = Array.isArray(r.checks) ? r.checks.filter((c) => c && typeof c === "object") : [];
  const fromChecks = checks.filter((c) => c.ok === true).length;
  const awarded = Math.max(0, Math.min(q.marks, checks.length ? fromChecks : Math.round(Number(r.awarded ?? hit.length) || 0)));
  // Only keep quotes that really are in the answer (so they can be highlighted there).
  const quotes: Record<number, string> = {};
  for (const [k, v] of Object.entries(r.quotes && typeof r.quotes === "object" ? r.quotes : {})) {
    const i = Number(k);
    const t = String(v ?? "").trim().replace(/^["“']|["”']$/g, "");
    if (hit.includes(i) && t.length >= 2 && answer.toLowerCase().includes(t.toLowerCase())) quotes[i] = t;
  }
  // Correct items the mark scheme didn't list (e.g. another valid example) still get highlighted.
  [...(Array.isArray(r.extra) ? r.extra : []), ...checks.filter((c) => c.ok === true).map((c) => c.quote)].forEach((v, n) => {
    const t = String(v ?? "").trim().replace(/^["“']|["”']$/g, "");
    if (t.length >= 2 && answer.toLowerCase().includes(t.toLowerCase())) quotes[100 + n] = t;
  });
  return { answer, awarded, hit, quotes, feedback: String(r.feedback ?? "").trim(), improve: (awarded < q.marks && String(r.improve ?? "").trim()) || undefined, at: nowISO() };
}
