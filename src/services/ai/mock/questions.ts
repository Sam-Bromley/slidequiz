/**
 * Grounded question builders for the mock AI provider.
 * Each builder draws only on extracted concepts/facts and always cites its source page.
 */
import { capitalize, contentWords, keywordSet, stripTrailingPunct, truncate, wordCount } from "@/lib/text";
import { shuffle } from "@/lib/utils";
import type { AcademicLevel, Difficulty, ID, QuestionType, RubricBand } from "@/types/models";
import type { QuestionDraft } from "../types";
import { refOf, type Concept, type Fact, type Knowledge } from "./knowledge";

export interface BuildCtx {
  k: Knowledge;
  rng: () => number;
  used: Set<string>;
  usedPrompts: Set<string>;
  topicNames: Map<ID, string>;
  level: AcademicLevel;
  exam: boolean;
  subject: string;
  prefer: { definitions: boolean; application: boolean; numbers: boolean };
}

type Builder = (ctx: BuildCtx, topicId: ID | null, d: Difficulty) => QuestionDraft | null;

const pick = <T,>(ctx: BuildCtx, arr: T[]): T | undefined => arr[Math.floor(ctx.rng() * arr.length)];

function inTopic<T extends { topicId: ID | null }>(arr: T[], topicId: ID | null) {
  return topicId ? arr.filter((x) => x.topicId === topicId) : arr;
}

function pickConcept(ctx: BuildCtx, topicId: ID | null, exclude: Set<string> = new Set()): Concept | undefined {
  const pool = ctx.k.concepts.filter((c) => !ctx.used.has(c.id) && !exclude.has(c.id));
  const local = inTopic(pool, topicId);
  return local[0] ?? (topicId ? undefined : pool[0]);
}

function pickFact(ctx: BuildCtx, topicId: ID | null, filter: (f: Fact) => boolean = () => true): Fact | undefined {
  const pool = ctx.k.facts.filter((f) => !ctx.used.has(f.id) && filter(f));
  const local = inTopic(pool, topicId);
  const ranked = ctx.prefer.numbers ? [...local].sort((a, b) => Number(b.hasNumber) - Number(a.hasNumber)) : local;
  return ranked[0];
}

const topicName = (ctx: BuildCtx, id: ID | null) => (id && ctx.topicNames.get(id)) || ctx.subject || "this topic";

function marksFor(type: QuestionType, d: Difficulty, level: AcademicLevel): number {
  const base: Record<QuestionType, number> = { mcq: 1, true_false: 1, fill_blank: 1, matching: 4, short: 2, compare: 6, scenario: 4, long: 9, essay: 16 };
  let m = base[type];
  if (type === "short") m = d === "easy" ? 2 : d === "medium" ? 3 : 4;
  if (type === "long") m = d === "easy" ? 6 : d === "medium" ? 9 : 12;
  if (type === "essay") m = level === "GCSE" ? 12 : level === "University" ? 25 : 16;
  if (type === "scenario") m = d === "hard" ? 6 : 4;
  return m;
}

function withMarks(ctx: BuildCtx, prompt: string, marks: number, type: QuestionType) {
  if (!ctx.exam || ["mcq", "true_false", "fill_blank"].includes(type)) return prompt;
  return `${prompt} [${marks} marks]`;
}

function lowerFirst(s: string) {
  if (/^(A|An|The)\s/.test(s)) return s[0].toLowerCase() + s.slice(1);
  return /^[A-Z][a-z]/.test(s) && !/^(I|DNA|RNA|ATP)\b/.test(s) && !/^[A-Z][a-z]+\s[A-Z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s;
}

/** Whole terms only (skip "memory" inside "semantic memory"), longest first. */
function wholeTerms(terms: string[]) {
  return [...terms].sort((a, b) => b.length - a.length).filter((t, _, all) => !all.some((o) => o !== t && o.includes(t)));
}

const isPlural =(t: string) => /[^s]s$/i.test(t.trim().split(/\s+/).pop() ?? "") && !/(sis|us|ss)$/i.test(t);

function keyPointsFrom(def: string): string[] {
  const parts = def.split(/;|,\s(?:and|which|while|so)\s|\.\s/).map((s) => stripTrailingPunct(s.trim())).filter((s) => contentWords(s).length >= 2);
  return parts.length ? parts.slice(0, 3).map(capitalize) : [capitalize(def)];
}

function maskTerm(text: string, term: string) {
  const re = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig");
  return text.replace(re, "_____");
}

const ANTONYMS: [string, string][] = [
  ["increase", "decrease"], ["increases", "decreases"], ["increased", "decreased"], ["more", "fewer"], ["higher", "lower"],
  ["before", "after"], ["larger", "smaller"], ["faster", "slower"], ["inside", "outside"], ["positive", "negative"],
  ["short-term", "long-term"], ["first", "last"], ["most", "least"], ["rise", "fall"], ["rose", "fell"], ["strengthened", "weakened"],
  ["improved", "worsened"], ["can", "cannot"], ["always", "rarely"], ["urban", "rural"], ["gain", "loss"],
];

/** Produce a plausible but false version of a fact. Returns null if we can't do it safely. */
export function corrupt(ctx: BuildCtx, fact: Fact): string | null {
  const s = fact.text;
  // 1) Swap a concept term for another concept term.
  const others = ctx.k.concepts.filter((c) => !fact.terms.includes(c.term.toLowerCase()));
  for (const t of wholeTerms(fact.terms)) {
    const compatible = others.filter((c) => isPlural(c.term) === isPlural(t));
    // Only swap for a related term from the same topic that doesn't already share words with the sentence
    // (avoids nonsense like "can all limit limiting factor").
    const sentenceStems = keywordSet(s);
    const sameTopic = compatible.filter((c) => c.topicId === fact.topicId && ![...keywordSet(c.term)].some((w) => sentenceStems.has(w)));
    const swap = pick(ctx, sameTopic);
    if (swap) {
      const re = new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
      // Skip terms preceded by an article ("A covalent bond") — swapping would read ungrammatically.
      if (new RegExp(`\\b(a|an)\\s+${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(s)) continue;
      const out = s.replace(re, (m) => (/^[A-Z]/.test(m) ? capitalize(swap.term) : lowerFirst(swap.term)));
      if (out !== s) return out;
    }
  }
  // 2) Alter a number or year.
  const year = s.match(/\b(1[5-9]\d\d|20[0-2]\d)\b/);
  if (year) {
    const y = Number(year[1]);
    const delta = [-40, -25, -12, 15, 22, 35][Math.floor(ctx.rng() * 6)];
    return s.replace(year[1], String(y + delta));
  }
  const num = s.match(/\b(\d+(?:\.\d+)?)\b/);
  if (num && Number(num[1]) > 1) {
    const n = Number(num[1]);
    const alt = n < 10 ? n + (ctx.rng() < 0.5 ? 2 : 3) : Math.round(n * (ctx.rng() < 0.5 ? 2 : 0.5));
    if (alt !== n) return s.replace(num[1], String(alt));
  }
  // 3) Antonym swap.
  for (const [a, b] of shuffle(ANTONYMS, Math.floor(ctx.rng() * 1e6))) {
    for (const [x, y] of [[a, b], [b, a]] as const) {
      const re = new RegExp(`\\b${x}\\b`, "i");
      if (re.test(s)) return s.replace(re, (m) => (/^[A-Z]/.test(m) ? capitalize(y) : y));
    }
  }
  return null;
}

function mark(ctx: BuildCtx, ...ids: string[]) {
  ids.forEach((i) => ctx.used.add(i));
}

/* ----------------------------------------------------------------------------- Builders */

const mcq: Builder = (ctx, topicId, d) => {
  const c = pickConcept(ctx, topicId);
  const form = d === "easy" ? "term2def" : d === "medium" ? (ctx.rng() < 0.5 ? "def2term" : "term2def") : ctx.rng() < 0.5 ? "statement" : "def2term";
  if (c && form !== "statement") {
    const others = ctx.k.concepts.filter((x) => x.id !== c.id);
    const same = others.filter((x) => x.topicId === c.topicId);
    const pool = d === "hard" && same.length >= 3 ? same : [...same, ...shuffle(others.filter((x) => x.topicId !== c.topicId), Math.floor(ctx.rng() * 1e6))];
    const distract = pool
      .slice()
      .sort((a, b) => Math.abs(a.definition.length - c.definition.length) - Math.abs(b.definition.length - c.definition.length))
      .slice(0, 3);
    if (distract.length === 3) {
      mark(ctx, c.id);
      const correctText = form === "term2def" ? truncate(c.definition, 150) : c.term;
      const opts = shuffle([correctText, ...distract.map((x) => (form === "term2def" ? truncate(x.definition, 150) : x.term))], Math.floor(ctx.rng() * 1e6));
      const prompt =
        form === "term2def"
          ? pick(ctx, [`Which of the following best describes ${c.term.toLowerCase() === c.term ? c.term : `“${c.term}”`}?`, `What is meant by “${c.term}”?`])!
          : `Which term matches this description: “${truncate(maskTerm(c.definition, c.term), 170)}”?`;
      return {
        materialId: c.page.materialId,
        topicId: c.topicId,
        type: "mcq",
        difficulty: d,
        prompt,
        options: opts,
        correctIndex: opts.indexOf(correctText),
        answer: form === "term2def" ? `${c.term}: ${c.definition}.` : c.term,
        keyPoints: [c.definition],
        explanation: `${c.page.label} defines ${c.term} as “${stripTrailingPunct(c.definition)}.” The other options describe ${distract.map((x) => x.term).join(", ").replace(/, ([^,]*)$/, " and $1")}, which are ${distract.every((x) => x.topicId === c.topicId) ? "related ideas from the same topic" : "covered elsewhere in the material"}.`,
        sources: [refOf(c.page)],
        marks: 1,
      };
    }
  }
  // Statement form: one true fact among three corrupted ones.
  const f = pickFact(ctx, topicId, (x) => wordCount(x.text) <= 35);
  if (!f) return null;
  const others = ctx.k.facts.filter((x) => x.id !== f.id && x.topicId === f.topicId && wordCount(x.text) <= 35);
  const wrong: string[] = [];
  for (const o of shuffle(others, Math.floor(ctx.rng() * 1e6))) {
    const w = corrupt(ctx, o);
    if (w && !wrong.includes(w) && w !== f.text) wrong.push(w);
    if (wrong.length === 3) break;
  }
  if (wrong.length < 3) return null;
  mark(ctx, f.id);
  const opts = shuffle([f.text, ...wrong], Math.floor(ctx.rng() * 1e6));
  return {
    materialId: f.page.materialId,
    topicId: f.topicId,
    type: "mcq",
    difficulty: d,
    prompt: `Which statement about ${topicName(ctx, f.topicId).toLowerCase()} is correct?`,
    options: opts,
    correctIndex: opts.indexOf(f.text),
    answer: f.text,
    keyPoints: [f.text],
    explanation: `This is stated directly in ${f.page.label}. Each of the other options changes one detail from the material, so read key terms and figures carefully.`,
    sources: [refOf(f.page)],
    marks: 1,
  };
};

const trueFalse: Builder = (ctx, topicId, d) => {
  const f = pickFact(ctx, topicId, (x) => wordCount(x.text) <= 40);
  if (!f) return null;
  const makeFalse = ctx.rng() < (d === "easy" ? 0.4 : 0.55);
  const falseText = makeFalse ? corrupt(ctx, f) : null;
  const isTrue = !falseText;
  mark(ctx, f.id);
  return {
    materialId: f.page.materialId,
    topicId: f.topicId,
    type: "true_false",
    difficulty: d,
    prompt: stripTrailingPunct(isTrue ? f.text : falseText!) + ".",
    options: ["True", "False"],
    correctIndex: isTrue ? 0 : 1,
    answer: isTrue ? "True" : "False",
    keyPoints: [f.text],
    explanation: isTrue ? `True. ${f.page.label} states: “${f.text}”` : `False. ${f.page.label} actually states: “${f.text}”`,
    sources: [refOf(f.page)],
    marks: 1,
  };
};

const GENERIC = new Set(["people", "memory", "information", "material", "however", "because", "including", "important", "different", "particular", "therefore", "processes", "structure", "function"]);

const fillBlank: Builder = (ctx, topicId, d) => {
  const candidates = inTopic(ctx.k.facts, topicId).filter((f) => !ctx.used.has(f.id) && wordCount(f.text) <= 38);
  for (const f of candidates) {
    let target: string | undefined;
    if (d !== "easy") target = f.text.match(/\b(1[5-9]\d\d|20[0-2]\d)\b/)?.[1];
    target ??= wholeTerms(f.terms).map((t) => ctx.k.concepts.find((c) => c.term.toLowerCase() === t)?.term).find(Boolean);
    target ??= f.text.match(/\b(1[5-9]\d\d|20[0-2]\d)\b/)?.[1];
    target ??= ctx.k.keyTerms.find((t) => (/^[A-Z]/.test(t) ? t.length > 3 : t.length >= 9) && !GENERIC.has(t.toLowerCase()) && new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(f.text) && f.text.indexOf(t) > 0);
    if (!target) continue;
    const re = new RegExp(`\\b${target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    const found = f.text.match(re)?.[0];
    if (!found || f.text.trim().toLowerCase().startsWith(found.toLowerCase() + " ") === false && wordCount(f.text) < 6) continue;
    const blanked = f.text.replace(re, "_____");
    if (blanked === f.text) continue;
    mark(ctx, f.id);
    const hint = d === "easy" ? ` (Hint: ${found.length} letters, starts with “${found[0].toUpperCase()}”)` : "";
    return {
      materialId: f.page.materialId,
      topicId: f.topicId,
      type: "fill_blank",
      difficulty: d,
      prompt: `${blanked}${hint}`,
      acceptedAnswers: [found, found.replace(/s$/, ""), found.toLowerCase()],
      answer: found,
      keyPoints: [f.text],
      explanation: `The missing word is “${found}”. From ${f.page.label}: “${f.text}”`,
      sources: [refOf(f.page)],
      marks: 1,
    };
  }
  return null;
};

const BASE_VERB: Record<string, string> = { "led to": "lead to", caused: "cause", "resulted in": "result in", "contributed to": "contribute to", triggered: "trigger", enabled: "enable" };

const CAUSAL = [
  { re: /^(.{12,120}?)\s+because\s+(.{8,})$/i, q: (a: string) => `Explain why ${lowerFirst(stripTrailingPunct(a))}.`, a: (_: string, b: string) => capitalize(stripTrailingPunct(b)) + "." },
  { re: /^(.{8,120}?)\s+(led to|caused|resulted in|contributed to|triggered|enabled)\s+(.{8,})$/i, q: (a: string, v: string) => `According to the material, what did ${lowerFirst(stripTrailingPunct(a))} ${BASE_VERB[v.toLowerCase()] ?? v}?`, a: (_: string, __: string, c: string) => capitalize(stripTrailingPunct(c)) + "." },
];

const short: Builder = (ctx, topicId, d) => {
  if (!ctx.prefer.application || ctx.rng() < 0.6) {
    const c = pickConcept(ctx, topicId);
    if (c) {
      mark(ctx, c.id);
      const marks = marksFor("short", d, ctx.level);
      const stem = d === "easy" ? `Define “${c.term}”.` : d === "medium" ? `What is meant by “${c.term}”? Give one detail from the material.` : topicName(ctx, c.topicId).toLowerCase().includes(c.term.toLowerCase()) ? `Explain what is meant by “${c.term}” and why it matters.` : `Explain what is meant by “${c.term}” and why it matters in ${topicName(ctx, c.topicId).toLowerCase()}.`;
      const support = ctx.k.facts.find((f) => f.topicId === c.topicId && f.terms.includes(c.term.toLowerCase()) && f.text !== c.sentence);
      return {
        materialId: c.page.materialId,
        topicId: c.topicId,
        type: "short",
        difficulty: d,
        prompt: withMarks(ctx, stem, marks, "short"),
        answer: `${c.term} ${/^(a|an|the)\b/i.test(c.definition) ? "is " + lowerFirst(c.definition) : "means " + lowerFirst(c.definition)}.${support && d !== "easy" ? " " + support.text : ""}`,
        keyPoints: [...keyPointsFrom(c.definition), ...(support && d !== "easy" ? [support.text] : [])],
        explanation: `Use the definition from ${c.page.label}${support && d !== "easy" ? ` and the supporting point in ${support.page.label}` : ""}.`,
        sources: [refOf(c.page), ...(support && support.page.id !== c.page.id && d !== "easy" ? [refOf(support.page)] : [])],
        marks,
        suggestedWords: d === "easy" ? [15, 40] : [30, 80],
      };
    }
  }
  for (const f of inTopic(ctx.k.facts, topicId).filter((x) => !ctx.used.has(x.id))) {
    for (const pat of CAUSAL) {
      const m = f.text.match(pat.re);
      if (!m) continue;
      mark(ctx, f.id);
      const marks = marksFor("short", d, ctx.level);
      const q = pat.q(m[1], m[2]);
      const a = pat.a(m[1], m[2], m[3]);
      return {
        materialId: f.page.materialId,
        topicId: f.topicId,
        type: "short",
        difficulty: d,
        prompt: withMarks(ctx, q, marks, "short"),
        answer: a,
        keyPoints: [a],
        explanation: `${f.page.label}: “${f.text}”`,
        sources: [refOf(f.page)],
        marks,
        suggestedWords: [20, 60],
      };
    }
  }
  return null;
};

function topicFacts(ctx: BuildCtx, topicId: ID | null, n: number) {
  const pool = inTopic(ctx.k.facts, topicId);
  // Spread across pages: best fact per page first, then the rest.
  const byPage = new Map<string, Fact[]>();
  pool.forEach((f) => byPage.set(f.page.id, [...(byPage.get(f.page.id) ?? []), f]));
  const firsts = [...byPage.values()].map((fs) => fs[0]);
  const rest = pool.filter((f) => !firsts.includes(f));
  const out: Fact[] = [];
  for (const f of [...firsts, ...rest]) {
    if (out.length >= n) break;
    if (out.some((o) => [...keywordSet(o.text)].filter((w) => keywordSet(f.text).has(w)).length > 4)) continue; // avoid near-duplicates
    out.push(f);
  }
  return out;
}

const long: Builder = (ctx, topicId, d) => {
  const n = d === "easy" ? 3 : d === "medium" ? 4 : 6;
  const facts = topicFacts(ctx, topicId, n);
  if (facts.length < 3) return null;
  const t = topicName(ctx, topicId);
  const key = `long:${topicId}:${d}`;
  if (ctx.used.has(key)) return null;
  mark(ctx, key);
  const terms = [...new Set(facts.flatMap((f) => f.terms))].slice(0, 2).map((x) => ctx.k.concepts.find((c) => c.term.toLowerCase() === x)?.term ?? x);
  const stem =
    d === "easy"
      ? `Describe the main ideas of ${t.toLowerCase()}.`
      : d === "medium"
        ? `Explain ${t.toLowerCase()}${terms.length ? `, referring to ${terms.join(" and ")}` : ""}.`
        : `Analyse the key processes and ideas in ${t.toLowerCase()}. Use specific detail from the material to support each point.`;
  const marks = marksFor("long", d, ctx.level);
  const sources = [...new Map(facts.map((f) => [f.page.id, refOf(f.page)])).values()];
  return {
    materialId: facts[0].page.materialId,
    topicId,
    type: "long",
    difficulty: d,
    prompt: withMarks(ctx, stem, marks, "long"),
    answer: facts.map((f) => f.text).join(" "),
    keyPoints: facts.map((f) => f.text),
    explanation: `A strong answer covers each key point below in a logical order, explains how the ideas connect, and uses the terminology from ${sources.map((s) => s.label).join(", ")}.`,
    sources,
    marks,
    suggestedWords: d === "easy" ? [100, 180] : d === "medium" ? [150, 250] : [250, 400],
  };
};

function rubric(marks: number, points: string[]): RubricBand[] {
  const b = (lo: number, hi: number) => `${lo}–${hi}`;
  const q = Math.floor(marks / 4);
  const terms = points.map((p) => truncate(stripTrailingPunct(p), 60));
  return [
    { band: `Level 4 (${b(q * 3 + 1, marks)})`, descriptor: `Accurate, detailed knowledge across the topic, e.g. ${terms.slice(0, 2).join("; ")}. Well-developed analysis with a sustained, supported judgement.` },
    { band: `Level 3 (${b(q * 2 + 1, q * 3)})`, descriptor: `Mostly accurate knowledge covering most key points. Clear explanation and some evaluation, though the judgement may be uneven.` },
    { band: `Level 2 (${b(q + 1, q * 2)})`, descriptor: `Some relevant knowledge (e.g. ${terms[terms.length - 1] ?? "one key idea"}) with limited development. Judgement is asserted rather than argued.` },
    { band: `Level 1 (${b(1, q)})`, descriptor: `Basic points, partly accurate, with little explanation or structure.` },
  ];
}

const essay: Builder = (ctx, topicId, d) => {
  const facts = topicFacts(ctx, topicId, 6);
  if (facts.length < 4) return null;
  const key = `essay:${topicId}`;
  if (ctx.used.has(key)) return null;
  mark(ctx, key);
  const t = topicName(ctx, topicId);
  const quote = facts.find((f) => f.isImportant && wordCount(f.text) < 28) ?? facts.find((f) => wordCount(f.text) < 24);
  const scope = !ctx.subject || ctx.subject.includes("&") ? facts[0].page.materialTitle : ctx.subject;
  const stems = [
    quote ? `“${stripTrailingPunct(quote.text)}.” Discuss.` : null,
    `Evaluate the importance of ${t.toLowerCase()} within ${scope}.`,
    `To what extent does the material support the view that ${t.toLowerCase()} is central to understanding ${scope.toLowerCase()}?`,
  ].filter(Boolean) as string[];
  const stem = d === "easy" ? stems[1] : pick(ctx, stems)!;
  const marks = marksFor("essay", d, ctx.level);
  const sources = [...new Map(facts.map((f) => [f.page.id, refOf(f.page)])).values()];
  const outline = [
    `Introduction: define the focus (${t}) and state your line of argument.`,
    ...facts.slice(0, 4).map((f, i) => `Paragraph ${i + 1}: ${f.text}`),
    `Evaluation: weigh up which points matter most and why, noting any limitations.`,
    `Conclusion: give a clear, supported judgement that answers the question.`,
  ];
  return {
    materialId: facts[0].page.materialId,
    topicId,
    type: "essay",
    difficulty: d === "easy" ? "medium" : d,
    prompt: withMarks(ctx, stem, marks, "essay"),
    answer: outline.join("\n"),
    keyPoints: facts.map((f) => f.text),
    explanation: "Plan before writing: one argument per paragraph, evidence from the material, then evaluation.",
    rubric: rubric(marks, facts.map((f) => f.text)),
    sources,
    marks,
    suggestedWords: ctx.level === "University" ? [800, 1200] : ctx.level === "GCSE" ? [300, 500] : [500, 800],
  };
};

const matching: Builder = (ctx, topicId, d) => {
  let pool = inTopic(ctx.k.concepts, topicId).filter((c) => !ctx.used.has(c.id));
  if (pool.length < 4) pool = [...pool, ...ctx.k.concepts.filter((c) => !ctx.used.has(c.id) && !pool.includes(c))];
  const n = d === "hard" ? 5 : 4;
  const chosen = pool.slice(0, n);
  if (chosen.length < 3) return null;
  mark(ctx, ...chosen.map((c) => c.id));
  return {
    materialId: chosen[0].page.materialId,
    topicId: chosen[0].topicId,
    type: "matching",
    difficulty: d,
    prompt: "Match each term to its description.",
    pairs: chosen.map((c) => ({ left: c.term, right: truncate(maskTerm(c.definition, c.term), 110) })),
    answer: chosen.map((c) => `${c.term}: ${c.definition}`).join("\n"),
    keyPoints: chosen.map((c) => `${c.term}: ${c.definition}`),
    explanation: `Definitions come from ${[...new Set(chosen.map((c) => c.page.label))].join(", ")}.`,
    sources: [...new Map(chosen.map((c) => [c.page.id, refOf(c.page)])).values()],
    marks: chosen.length,
  };
};

const scenario: Builder = (ctx, topicId, d) => {
  // Variant A: a classmate's misconception to correct.
  const f = pickFact(ctx, topicId, (x) => wordCount(x.text) <= 36);
  if (f) {
    const wrong = corrupt(ctx, f);
    if (wrong) {
      mark(ctx, f.id);
      const support = ctx.k.facts.find((x) => x.topicId === f.topicId && x.id !== f.id && !ctx.used.has(x.id));
      const marks = marksFor("scenario", d, ctx.level);
      return {
        materialId: f.page.materialId,
        topicId: f.topicId,
        type: "scenario",
        difficulty: d,
        prompt: withMarks(ctx, `While revising together, a classmate says: “${stripTrailingPunct(wrong)}.” Using the material, explain whether they are right and correct any mistake.`, marks, "scenario"),
        answer: `They are not quite right. The material states: “${f.text}”${support ? ` It also notes that ${lowerFirst(support.text)}` : ""}`,
        keyPoints: [f.text, ...(support ? [support.text] : [])],
        explanation: `Spot the changed detail, then support your correction with evidence from ${f.page.label}.`,
        sources: [refOf(f.page), ...(support && support.page.id !== f.page.id ? [refOf(support.page)] : [])],
        marks,
        suggestedWords: [60, 140],
      };
    }
  }
  // Variant B: apply a concept to a new situation.
  const c = pickConcept(ctx, topicId);
  if (!c) return null;
  mark(ctx, c.id);
  const marks = marksFor("scenario", d, ctx.level);
  const example = ctx.k.facts.find((x) => x.isExample && x.topicId === c.topicId);
  return {
    materialId: c.page.materialId,
    topicId: c.topicId,
    type: "scenario",
    difficulty: d,
    prompt: withMarks(ctx, `Describe a realistic situation that illustrates ${c.term.toLowerCase() === c.term ? c.term : `“${c.term}”`}. Explain how your example fits the definition from the material.`, marks, "scenario"),
    answer: `${c.term}: ${c.definition}. A strong answer describes one specific situation and explicitly links each feature back to this definition.${example ? ` The material's own example: ${example.text}` : ""}`,
    keyPoints: [...keyPointsFrom(c.definition), "Links the example explicitly to the definition"],
    explanation: `Anchor your example in the definition from ${c.page.label}.`,
    sources: [refOf(c.page), ...(example && example.page.id !== c.page.id ? [refOf(example.page)] : [])],
    marks,
    suggestedWords: [60, 150],
  };
};

const compare: Builder = (ctx, topicId, d) => {
  const pool = inTopic(ctx.k.concepts, topicId).filter((c) => !ctx.used.has(`cmp:${c.id}`));
  let a = pool[0];
  let b = pool[1];
  if (!a || !b) {
    const all = ctx.k.concepts.filter((c) => !ctx.used.has(`cmp:${c.id}`));
    a ??= all[0];
    b = all.find((x) => x.id !== a?.id && x.topicId === a?.topicId) ?? all.find((x) => x.id !== a?.id)!;
  }
  if (!a || !b) return null;
  mark(ctx, `cmp:${a.id}`, `cmp:${b.id}`);
  const marks = marksFor("compare", d, ctx.level);
  const same = a.topicId === b.topicId;
  return {
    materialId: a.page.materialId,
    topicId: a.topicId,
    type: "compare",
    difficulty: d,
    prompt: withMarks(ctx, `Compare and contrast ${a.term} and ${b.term}.`, marks, "compare"),
    answer: `${a.term}: ${a.definition}. By contrast, ${b.term}: ${lowerFirst(b.definition)}. ${same ? `Both belong to ${topicName(ctx, a.topicId).toLowerCase()}, so a strong answer explains how they relate as well as how they differ.` : "A strong answer identifies at least one similarity as well as the key differences."}`,
    keyPoints: [`${a.term}: ${a.definition}`, `${b.term}: ${b.definition}`, same ? `Similarity: both relate to ${topicName(ctx, a.topicId).toLowerCase()}` : "At least one similarity identified"],
    explanation: "Structure it point by point: define both, then give differences and at least one similarity.",
    sources: [...new Map([a, b].map((c) => [c.page.id, refOf(c.page)])).values()],
    marks,
    suggestedWords: d === "hard" ? [150, 250] : [80, 160],
  };
};

export const BUILDERS: Record<QuestionType, Builder> = {
  mcq,
  true_false: trueFalse,
  fill_blank: fillBlank,
  short,
  long,
  essay,
  matching,
  scenario,
  compare,
};

export const FALLBACK: Record<QuestionType, QuestionType[]> = {
  mcq: ["true_false", "fill_blank"],
  true_false: ["mcq", "fill_blank"],
  fill_blank: ["true_false", "mcq"],
  matching: ["mcq", "fill_blank"],
  short: ["fill_blank", "scenario", "mcq"],
  long: ["short", "scenario"],
  essay: ["long", "short"],
  scenario: ["short", "true_false"],
  compare: ["short", "long"],
};
