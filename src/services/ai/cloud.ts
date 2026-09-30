/**
 * Real AI for everyone, through the SlideQuiz helper in Supabase (supabase/functions/ai).
 * Logged-in students use their account; everyone else gets a hidden guest pass (a Supabase
 * anonymous sign-in) used only for AI, so each browser has its own daily allowance.
 * Everything falls back to the built-in rules if the AI is unavailable, so the site always works.
 */
import { authToken, isLoggedIn, SUPABASE_KEY, SUPABASE_URL } from "@/services/account";
import { groundingFor } from "@/services/grounding";
import { actions } from "@/store/actions";
import { getState } from "@/store/store";
import { nowISO, uid } from "@/lib/utils";
import type { AINoteSection, ID, Material, SourceRef, Topic } from "@/types/models";
import type { QuestionDraft } from "./types";
import { aiKey } from "./ai-key";
export { aiKey, aiReady } from "./ai-key";

export const AI_ENDPOINT = `${SUPABASE_URL}/functions/v1/ai`;
const CHUNK = 45_000;

export class AIError extends Error {
  constructor(
    message: string,
    public limit = false,
  ) {
    super(message);
  }
}

type CloudPage = { id: ID; label: string; title: string; text: string };

/* ---------------------------------------------------------------- guest pass for AI */

const GUEST_KEY = "slidequiz:ai-guest";
type Guest = { access_token: string; refresh_token: string; expires_at: number };
let guestUnavailable = false;
let guestJob: Promise<string | null> | null = null;

function loadGuest(): Guest | null {
  try {
    return JSON.parse(localStorage.getItem(GUEST_KEY) ?? "null");
  } catch {
    return null;
  }
}
function saveGuest(g: Guest | null) {
  try {
    if (g) localStorage.setItem(GUEST_KEY, JSON.stringify(g));
    else localStorage.removeItem(GUEST_KEY);
  } catch {
    /* storage blocked */
  }
}

async function auth(path: string, body: unknown): Promise<Guest | null> {
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, { method: "POST", headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) return null;
    const t = await r.json();
    return t.access_token ? { access_token: t.access_token, refresh_token: t.refresh_token, expires_at: t.expires_at ?? Math.floor(Date.now() / 1000) + (t.expires_in ?? 3600) } : null;
  } catch {
    return null;
  }
}

/** A token for the AI helper: the student's own login, or a guest pass. Null if neither is possible. */
async function aiToken(): Promise<string | null> {
  if (isLoggedIn()) return authToken();
  if (guestUnavailable) return null;
  guestJob ??= (async () => {
    let g = loadGuest();
    if (g && g.expires_at - 60 < Date.now() / 1000) g = await auth("token?grant_type=refresh_token", { refresh_token: g.refresh_token });
    if (!g) g = await auth("signup", {}); // anonymous sign-in
    saveGuest(g);
    if (!g) guestUnavailable = true; // guest passes switched off in Supabase: use the built-in notes
    return g?.access_token ?? null;
  })().finally(() => (guestJob = null));
  return guestJob;
}

async function call<T>(task: string, body: Record<string, unknown>): Promise<T> {
  const token = await aiToken();
  if (!token) throw new AIError("AI isn't available right now.");
  let res: Response;
  try {
    res = await fetch(AI_ENDPOINT, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ task, ...body }),
    });
  } catch {
    throw new AIError("Couldn't reach the AI.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new AIError(data?.error ?? "The AI couldn't help this time.", !!data?.limit);
  return data as T;
}

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
  if (m0.ai?.key === key && (m0.ai.status === "done" || m0.ai.status === "limit")) return Promise.resolve();
  if (running.has(id)) return running.get(id)!;
  const job = (async () => {
    actions.updateMaterial(id, { ai: { key, status: "working", at: nowISO() } });
    try {
      const pages = cloudPages(m0);
      // 1. Notes and topics.
      const parts = await Promise.all(chunks(pages).map((c) => call<{ sections: AINoteSection[] }>("notes", { title: m0.title, pages: c })));
      const sections = mergeSections(parts.flatMap((p) => p.sections ?? []), pages);
      if (!sections.length) throw new AIError("No notes came back.");
      applyTopics(id, sections);
      actions.updateMaterial(id, { ai: { key, status: "working", notes: sections, at: nowISO() } });
      // 2. Questions, now the topics are set.
      const m1 = getState().materials.find((x) => x.id === id);
      if (!m1) return;
      const topicOf = new Map(m1.pages.map((p) => [p.id, p.topicId]));
      const labelOf = new Map(m1.pages.map((p) => [p.id, p.label]));
      const qs = await runLimited(chunks(pages), 2, (c) => call<{ questions: CloudQuestion[] }>("questions", { title: m0.title, pages: c }));
      const drafts = qs.flatMap((r) => r.questions ?? []).flatMap((q) => toDraft(q, m1, topicOf, labelOf));
      if (drafts.length) actions.setPracticeQuestions(id, drafts);
      actions.updateMaterial(id, { ai: { key, status: "done", notes: sections, questions: drafts.length > 0, at: nowISO() } });
    } catch (e) {
      const cur = getState().materials.find((x) => x.id === id);
      actions.updateMaterial(id, { ai: { key, status: e instanceof AIError && e.limit ? "limit" : "failed", notes: cur?.ai?.notes, at: nowISO() } });
    } finally {
      running.delete(id);
    }
  })();
  running.set(id, job);
  return job;
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
      .map((p) => ({ heading: p.heading?.trim() || undefined, pageIds: (p.pageIds ?? []).filter((x) => ids.has(x)), points: (p.points ?? []).filter((x) => x && x.text?.trim()) }))
      .filter((p) => p.points.length);
    if (!parts.length) continue;
    const last = out[out.length - 1];
    if (last && last.title.trim().toLowerCase() === (s.title ?? "").trim().toLowerCase()) last.parts.push(...parts);
    else out.push({ title: (s.title ?? "Notes").trim(), parts });
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
      answer: q.correct.trim(),
      keyPoints: [],
      explanation: q.explanation?.trim() || "",
      sources: source,
      marks: 1,
    },
  ];
}

/** Flashcards written by the AI, or null to use the built-in ones. */
export async function cloudFlashcards(m: Material, topicIds: ID[]): Promise<{ front: string; back: string; pageId: ID }[] | null> {
  try {
    const pages = cloudPages(m, topicIds);
    if (!pages.length) return null;
    const res = await runLimited(chunks(pages), 2, (c) => call<{ cards: { front: string; back: string; pageId: ID }[] }>("flashcards", { title: m.title, pages: c }));
    const cards = res.flatMap((r) => r.cards ?? []).filter((c) => c.front?.trim() && c.back?.trim());
    return cards.length ? cards : null;
  } catch {
    return null;
  }
}

/** An answer about the lecture, or null to use the built-in helper. */
export async function cloudChat(m: Material, history: { role: string; content: string }[], message: string): Promise<{ answer: string; pageIds: ID[] } | null> {
  try {
    const pages = cloudPages(m);
    // Long lectures: send the slides that share the most words with the question.
    const words = new Set(message.toLowerCase().match(/[a-z]{4,}/g) ?? []);
    const score = (p: CloudPage) => (p.title + " " + p.text).toLowerCase().split(/\W+/).filter((w) => words.has(w)).length;
    let chosen = pages;
    if (pages.reduce((n, p) => n + p.text.length, 0) > CHUNK) chosen = [...pages].sort((a, b) => score(b) - score(a)).slice(0, 30).sort((a, b) => pages.indexOf(a) - pages.indexOf(b));
    return await call<{ answer: string; pageIds: ID[] }>("chat", { title: m.title, pages: chosen, history: history.slice(-8), message });
  } catch {
    return null;
  }
}
