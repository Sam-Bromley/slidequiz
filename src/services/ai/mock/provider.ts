import { hashString, shuffle, sleep } from "@/lib/utils";
import { stripTrailingPunct, truncate } from "@/lib/text";
import type { Difficulty, ID, Question, QuestionType } from "@/types/models";
import type { AIProvider, FlashcardDraft, GenerationRequest, GenerationResult, GroundingPage, GroundingTopic, QuestionChange, QuestionDraft } from "../types";
import { chatReply } from "./chat";
import { gradeWritten } from "./grading";
import { buildKnowledge, excerpt, refOf, type Knowledge } from "./knowledge";
import { BUILDERS, FALLBACK, type BuildCtx } from "./questions";
import { summarize } from "./summary";

const QUESTION_TYPES: QuestionType[] = ["mcq", "short", "long", "essay", "true_false", "fill_blank", "matching", "scenario", "compare"];

function rngFrom(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function abortable(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Generation cancelled", "AbortError");
}

const MIXED: Difficulty[] = ["easy", "medium", "hard", "medium", "easy", "medium", "hard", "medium", "medium", "hard"];

function difficultyFor(setting: GenerationRequest["difficulty"], i: number): Difficulty {
  if (setting === "mixed") return MIXED[i % MIXED.length];
  if (setting === "exam") return i % 3 === 0 ? "medium" : "hard";
  return setting;
}

function parseInstructions(text = "", topics: GroundingTopic[]) {
  const t = text.toLowerCase();
  return {
    definitions: /defin|terminolog|key terms|vocab/.test(t),
    application: /appl|scenario|real[- ]world|case/.test(t),
    numbers: /date|number|figure|statistic|year/.test(t),
    focus: topics.filter((tp) => tp.name.toLowerCase().split(/\s+/).some((w) => w.length > 3 && t.includes(w))).map((tp) => tp.id),
  };
}

function makeCtx(k: Knowledge, req: Pick<GenerationRequest, "topics" | "level" | "difficulty" | "subject" | "instructions">, seed: number): BuildCtx {
  const prefs = parseInstructions(req.instructions, req.topics);
  return {
    k,
    rng: rngFrom(seed),
    used: new Set(),
    usedPrompts: new Set(),
    topicNames: new Map(req.topics.map((t) => [t.id, t.name])),
    level: req.level ?? "A-Level",
    exam: req.difficulty === "exam",
    subject: req.subject,
    prefer: { definitions: prefs.definitions, application: prefs.application, numbers: prefs.numbers },
  };
}

export function buildQuestions(req: GenerationRequest, k: Knowledge, seed = Date.now()): { questions: QuestionDraft[]; warnings: string[] } {
  const ctx = makeCtx(k, req, seed);
  (req.avoidPrompts ?? []).forEach((p) => ctx.usedPrompts.add(p.toLowerCase()));
  const types = req.kinds.filter((x): x is QuestionType => (QUESTION_TYPES as string[]).includes(x));
  if (!types.length || req.count <= 0) return { questions: [], warnings: [] };
  const prefs = parseInstructions(req.instructions, req.topics);

  // Type plan: round robin, but cap long-form questions so a mixed set stays answerable.
  const written = new Set<QuestionType>(["long", "essay"]);
  const onlyWritten = types.every((t) => written.has(t));
  const cap = onlyWritten ? req.count : Math.max(1, Math.ceil(req.count * 0.15));
  const plan: QuestionType[] = [];
  const counts = new Map<QuestionType, number>();
  let order = shuffle(types, seed);
  if (prefs.definitions) order = [...order.filter((t) => ["mcq", "short", "matching", "fill_blank"].includes(t)), ...order.filter((t) => !["mcq", "short", "matching", "fill_blank"].includes(t))];
  if (prefs.application) order = [...order.filter((t) => t === "scenario"), ...order.filter((t) => t !== "scenario")];
  let guard = 0;
  while (plan.length < req.count && guard++ < req.count * 20) {
    for (const t of order) {
      if (plan.length >= req.count) break;
      if (written.has(t) && (counts.get(t) ?? 0) >= cap) continue;
      plan.push(t);
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    if (order.every((t) => written.has(t) && (counts.get(t) ?? 0) >= cap)) break;
  }

  // Topic rotation: focus topics get double weight; topics without any pages are skipped.
  const live = req.topics.filter((t) => req.pages.some((p) => p.topicId === t.id));
  const rotation: (ID | null)[] = live.length ? [...prefs.focus, ...live.map((t) => t.id), ...prefs.focus].filter((id) => live.some((t) => t.id === id)) : [null];

  const questions: QuestionDraft[] = [];
  let ti = Math.floor(ctx.rng() * rotation.length);
  plan.forEach((type, i) => {
    const d = difficultyFor(req.difficulty, i);
    let q: QuestionDraft | null = null;
    const tryTypes = [type, ...FALLBACK[type].filter((t) => types.includes(t) || types.length === 1 || true)];
    outer: for (const t of tryTypes) {
      for (let attempt = 0; attempt < rotation.length + 1; attempt++) {
        const topic = attempt === rotation.length ? null : rotation[(ti + attempt) % rotation.length];
        q = BUILDERS[t](ctx, topic, d);
        if (q && !ctx.usedPrompts.has(q.prompt.toLowerCase())) {
          ti = (ti + attempt + 1) % rotation.length;
          break outer;
        }
        q = null;
      }
    }
    if (q) {
      ctx.usedPrompts.add(q.prompt.toLowerCase());
      questions.push(q);
    }
  });

  const warnings: string[] = [];
  if (questions.length < req.count)
    warnings.push(
      questions.length === 0
        ? "There isn't enough text in the selected material to write questions. Include more slides or pages, or add notes to image pages."
        : `Your selection supported ${questions.length} distinct question${questions.length === 1 ? "" : "s"} without repeating facts. Include more slides or pages for more.`,
    );
  return { questions, warnings };
}

export function buildFlashcards(k: Knowledge, target: number, seed = Date.now()): FlashcardDraft[] {
  const rng = rngFrom(seed);
  const cards: FlashcardDraft[] = k.concepts.map((c) => ({
    materialId: c.page.materialId,
    topicId: c.topicId,
    front: c.term,
    back: stripTrailingPunct(c.definition) + ".",
    source: refOf(c.page),
  }));
  const seen = new Set(cards.map((c) => c.front.toLowerCase()));
  for (const f of k.facts) {
    if (cards.length >= target) break;
    if (!f.hasNumber && !f.isImportant) continue;
    const m = f.text.match(/\b(1[5-9]\d\d|20[0-2]\d)\b/) ?? f.text.match(/\b(\d+(?:\.\d+)?\s?(?:%|per cent|million|billion|seconds?|minutes?|items?|years?))\b/i);
    if (!m) continue;
    const front = f.text.replace(m[0], "_____");
    if (seen.has(front.toLowerCase())) continue;
    seen.add(front.toLowerCase());
    cards.push({ materialId: f.page.materialId, topicId: f.topicId, front: truncate(front, 200), back: m[0], source: refOf(f.page) });
  }
  return shuffle(cards, Math.floor(rng() * 1e9)).slice(0, target);
}

function refsFor(q: Question, k: Knowledge) {
  const hay = [q.answer, q.prompt, ...q.keyPoints, q.explanation].join(" \n ").toLowerCase();
  const concepts = k.concepts.filter((c) => hay.includes(c.definition.toLowerCase().slice(0, 50)) || hay.includes(`“${c.term.toLowerCase()}”`));
  const facts = k.facts.filter((f) => hay.includes(f.text.toLowerCase().slice(0, 50)));
  return { concepts, facts };
}

const SHIFT: Record<Difficulty, { easier: Difficulty; harder: Difficulty }> = {
  easy: { easier: "easy", harder: "medium" },
  medium: { easier: "easy", harder: "hard" },
  hard: { easier: "medium", harder: "hard" },
};

export class MockAIProvider implements AIProvider {
  readonly name = "SlideQuiz Mock AI (grounded, offline)";

  async generate(req: GenerationRequest, onStage?: (s: import("../types").GenerationStage) => void, signal?: AbortSignal): Promise<GenerationResult> {
    const seed = hashString(JSON.stringify([req.kinds, req.count, req.difficulty, req.instructions])) ^ Date.now();
    onStage?.("reading");
    await sleep(500);
    abortable(signal);
    if (!req.pages.some((p) => p.text.trim().length > 40)) throw new Error("NO_TEXT");
    const k = buildKnowledge(req.pages);
    onStage?.("topics");
    await sleep(450);
    abortable(signal);
    onStage?.("concepts");
    await sleep(500);
    abortable(signal);
    onStage?.("questions");
    const { questions, warnings } = buildQuestions(req, k, seed);
    await sleep(650);
    abortable(signal);
    onStage?.("explanations");
    const flashcards = req.kinds.includes("flashcards") ? buildFlashcards(k, Math.min(40, Math.max(8, k.concepts.length + 6)), seed) : [];
    const materialIds = [...new Set(req.pages.map((p) => p.materialId))];
    const summaries = req.kinds.includes("summary")
      ? materialIds.map((mid) => summarize(mid, req.pages.filter((p) => p.materialId === mid), req.topics.filter((t) => t.materialId === mid), "standard"))
      : [];
    await sleep(400);
    abortable(signal);
    return { questions, flashcards, summaries, warnings };
  }

  async reviseQuestion(q: Question, change: QuestionChange, pages: GroundingPage[], topics: GroundingTopic[]): Promise<QuestionDraft> {
    await sleep(700);
    const k = buildKnowledge(pages);
    const d: Difficulty = change === "regenerate" ? q.difficulty : SHIFT[q.difficulty][change];
    const subject = pages[0]?.materialTitle ?? "";
    const tryBuild = (restrict: boolean, seed: number) => {
      const ctx = makeCtx(k, { topics, level: "A-Level", difficulty: d, subject, instructions: "" }, seed);
      const own = refsFor(q, k);
      if (change === "regenerate") {
        own.concepts.forEach((c) => ctx.used.add(c.id));
        own.facts.forEach((f) => ctx.used.add(f.id));
        ctx.used.add(`long:${q.topicId}:${q.difficulty}`);
        ctx.used.add(`essay:${q.topicId}`);
      } else if (restrict) {
        const keep = new Set([...own.concepts.map((c) => c.id), ...own.facts.map((f) => f.id)]);
        k.concepts.forEach((c) => !keep.has(c.id) && ctx.used.add(c.id));
        k.facts.forEach((f) => !keep.has(f.id) && ctx.used.add(f.id));
      }
      for (const t of [q.type, ...FALLBACK[q.type]]) {
        for (const topic of [q.topicId, null]) {
          const out = BUILDERS[t](ctx, topic, d);
          if (out && out.prompt !== q.prompt) return out;
        }
      }
      return null;
    };
    const out = tryBuild(true, Date.now()) ?? tryBuild(false, Date.now() + 7);
    if (!out) throw new Error("NO_ALTERNATIVE");
    return { ...out, materialId: q.materialId, difficulty: change === "regenerate" ? out.difficulty : d, generationId: q.generationId };
  }

  async explainQuestion(q: Question, pages: GroundingPage[]) {
    await sleep(450);
    const src = pages.find((p) => p.id === q.sources[0]?.pageId);
    const key = q.keyPoints[0] ?? q.answer;
    const correct = q.options && q.correctIndex != null ? q.options[q.correctIndex] : q.answer.split("\n")[0];
    return {
      content: [
        `**Answer:** ${truncate(correct, 300)}`,
        `**Why:** ${q.explanation}`,
        src ? `**From your notes (${src.label}, “${src.title}”):**\n“${excerpt(src, key)}”` : "",
        q.keyPoints.length > 1 ? `**Key points to remember:**\n${q.keyPoints.slice(0, 5).map((p) => `- ${truncate(p, 160)}`).join("\n")}` : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
      citations: q.sources,
    };
  }

  async gradeWritten(q: Question, response: string) {
    await sleep(800);
    return gradeWritten(q, response);
  }

  async summarize(materialId: ID, pages: GroundingPage[], topics: GroundingTopic[], detail: "brief" | "standard" | "detailed") {
    await sleep(900);
    return summarize(materialId, pages, topics, detail);
  }

  async chat(req: import("../types").ChatRequest) {
    await sleep(500 + Math.random() * 400);
    return chatReply(req);
  }
}
