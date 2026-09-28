/**
 * Coverage MCQs: one multiple-choice question for every definition and fact in the included slides,
 * so practising works through the whole material.
 *
 * Each question stores the right answer at options[0] followed by a pool of wrong answers
 * (up to 7). The practice screen decides how many to show and shuffles them each time,
 * so the correct letter moves around and the student can choose 3 to 6 options.
 */
import { contentWords, extractDefinitions, keywordSet, splitSentences, stripTrailingPunct, truncate, wordCount } from "@/lib/text";
import type { ID } from "@/types/models";
import type { GroundingPage, GroundingTopic, QuestionDraft } from "../types";
import { buildKnowledge, refOf } from "./knowledge";
import { concise } from "@/services/notes";

const MAX_WRONG = 7;
const BLANK = "_____";

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(s: string) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const wordRe = (t: string, flags = "i") => new RegExp(`(?<![\\w-])${esc(t)}(?![\\w-])`, flags);
const isPlural = (t: string) => {
  const last = t.trim().split(/\s+/).pop() ?? "";
  return /[^s]s$/i.test(last) && !/(sis|us|ss|ics)$/i.test(last);
};
/** Acronyms and names keep their capitals (NADPH, RuBP, Calvin). */
const keepsCase = (t: string) => /[A-Z].*[A-Z]/.test(t) || /^[A-Z]{2,}/.test(t) || /\d/.test(t);

const GENERIC = new Set(
  "people information material however because including important different particular therefore process processes structure function number between through during called produced released surrounding flattened overall reaction reactions stage stages students teacher lecture example examples section chapter reading further summary objectives learning table".split(
    " ",
  ),
);

interface Term {
  text: string;
  topics: Set<ID | null>;
  concept: boolean;
  /** Written with a capital mid-sentence in the slides (a name like "Calvin cycle"). */
  proper: boolean;
  /** Only used when nothing better fits a sentence. */
  fallback?: boolean;
  /** Seen with "a/an" or in both singular and plural, so it's safe to change its number. */
  countable: boolean;
}

const URLS = /(?:https?:\/\/|www\.)\S+/gi;
/** Common verbs and adjectives that make poor answer options. */
const NOT_NOUN = /^(cause|causes|caused|speed|speeds|keep|keeps|make|makes|take|takes|give|gives|show|shows|help|helps|need|needs|form|forms|lead|leads|allow|allows|become|becomes|remain|remains|produce|produces|contain|contains|include|includes|increase|increases|decrease|decreases|occur|occurs|happen|happens|read|more|less|high|higher|lower|same|such|each|other|both|many|much|most|some|very|also|than|then|when|where|which|while|about|after|before|again|alive|able|large|small|big|good|great|main|major|minor|long|short|full|free|true|false|whole|real|like|just|only|even|well)$/;

function termPool(pages: GroundingPage[], conceptTerms: string[], keyTerms: string[]): Term[] {
  const all = pages.map((p) => p.title + ".\n" + p.text).join("\n").replace(URLS, " ");
  const out: Term[] = [];
  const seen = new Set<string>();
  const properForm = (t: string) => {
    // An occurrence that isn't at the start of a sentence or line, written with a capital.
    const re = new RegExp(`(?<=[a-z0-9,;:)]\\s)${esc(t)}(?![\\w-])`, "gi");
    for (const m of all.matchAll(re)) if (/^[A-Z]/.test(m[0])) return m[0];
    return null;
  };
  const add = (t: string, concept: boolean, fallback = false) => {
    const text = t.trim();
    const key = text.toLowerCase();
    if (seen.has(key) || text.length < 3 || GENERIC.has(key) || /^(https?|www|com|org|net|html?|uk)$/i.test(key)) return;
    if (!concept && text.split(/\s+/).length === 1 && /^[a-z]/i.test(text) && /(ed|ing|ly|ous|ive|al|ful|less|able)$/i.test(text)) return;
    if (!contentWords(text).length) return;
    seen.add(key);
    const topics = new Set<ID | null>();
    for (const p of pages) if (wordRe(text).test(p.title + "\n" + p.text)) topics.add(p.topicId);
    const pf = properForm(text);
    if (!concept && !text.includes(" ") && /^[A-Z]/.test(text) && !pf && !wordRe(text.toLowerCase(), "").test(all)) return;
    const other = matchNumber(text, !isPlural(text));
    const countable = !text.includes(" ") && (new RegExp(`\\b(a|an)\\s+${esc(text)}\\b`, "i").test(all) || (other !== text && wordRe(other).test(all)));
    out.push({ text: pf ?? text, topics, concept, proper: !!pf || keepsCase(text), fallback, countable });
  };
  conceptTerms.forEach((t) => add(t, true));
  keyTerms.forEach((t) => add(t, false));
  // Drop single words that only ever appear inside a longer term ("dioxide" in "carbon dioxide").
  const count = (t: string) => (all.match(new RegExp(`(?<![\\w-])${esc(t)}(?![\\w-])`, "gi")) ?? []).length;
  const multi = out.filter((t) => t.text.includes(" "));
  // …or that nearly always sit next to the same word (a phrase the key-term list split up).
  const alwaysPaired = (w: string) => {
    const n = count(w);
    if (n < 2) return false;
    const pairs = new Map<string, number>();
    for (const m of all.matchAll(new RegExp(`(\\w+)\\s+${esc(w)}(?![\\w-])|(?<![\\w-])${esc(w)}\\s+(\\w+)`, "gi"))) {
      const k = (m[1] ? m[1] + " _" : "_ " + m[2]).toLowerCase();
      pairs.set(k, (pairs.get(k) ?? 0) + 1);
    }
    return Math.max(0, ...pairs.values()) >= n * 0.8;
  };
  const kept = out.filter((t) => {
    if (t.concept || t.text.includes(" ")) return true;
    const inside = multi.filter((m) => wordRe(t.text).test(m.text)).reduce((n, m) => n + count(m.text), 0);
    return count(t.text) - inside >= 2 && !alwaysPaired(t.text);
  });
  // Plain nouns from the slides, as a last resort so every fact can still get a question.
  // Only words used like nouns somewhere ("the …", "of …", "different …"), so verbs like "excites" stay out.
  const vocab = new Map<string, number>();
  const NOUN_CTX = /\b(?:[Tt]he|[Aa]n?|of|and|or|in|on|at|from|with|by|for|every|each|different|some|many|these|those|their|its|two|three|several)[ \t]+(?=([a-z]{5,})\b)/g;
  for (const m of all.matchAll(NOUN_CTX)) {
    const lw = m[1];
    if (GENERIC.has(lw) || NOT_NOUN.test(lw) || /(ed|ing|ly|ous|ive|al|ful|less|able|ise|ize|ate|est)$/.test(lw) || /^(every|these|those|their|several|three|different)$/.test(lw) || !contentWords(lw).length || alwaysPaired(lw)) continue;
    vocab.set(lw, (vocab.get(lw) ?? 0) + 1);
  }
  // Short materials don't give many nouns that way, so widen to any meaningful word (not common verbs).
  if (vocab.size < 16) {
    for (const w of all.match(/\b[a-z]{4,}\b/g) ?? []) {
      if (GENERIC.has(w) || NOT_NOUN.test(w) || /(ed|ing|ly|ous|ive|al|ful|less|able|ise|ize|est)$/.test(w) || !contentWords(w).length || alwaysPaired(w)) continue;
      vocab.set(w, (vocab.get(w) ?? 0) + 1);
    }
  }
  const fallbackStart = out.length;
  [...vocab.keys()].forEach((w) => add(w, false, true));
  return [...kept, ...out.slice(fallbackStart)];
}

/** Match the look of the right answer: lower case mid-sentence, capital at the start. */
function formLike(candidate: string, shown: string, proper = false) {
  if (proper || keepsCase(candidate)) return candidate;
  if (/^[A-Z]/.test(shown) && !keepsCase(shown)) return candidate[0].toUpperCase() + candidate.slice(1);
  if (/^[a-z]/.test(shown)) return candidate[0].toLowerCase() + candidate.slice(1);
  return candidate;
}

/** Make a single word plural or singular to match the right answer ("membrane" → "membranes"). */
function matchNumber(word: string, plural: boolean) {
  if (word.includes(" ") || isPlural(word) === plural) return word;
  if (plural) return /[^aeiou]y$/i.test(word) ? word.slice(0, -1) + "ies" : /(s|x|z|ch|sh)$/i.test(word) ? word + "es" : word + "s";
  return /ies$/i.test(word) ? word.slice(0, -3) + "y" : /(ches|shes|sses|xes)$/i.test(word) ? word.slice(0, -2) : word.slice(0, -1);
}

function pickDistractors(rng: () => number, target: string, sentence: string, topicId: ID | null, pool: Term[]): string[] {
  const lowerS = sentence.toLowerCase();
  const tl = target.toLowerCase();
  const tw = target.split(/\s+/).length;
  const ok = pool.filter((c) => {
    const cl = c.text.toLowerCase();
    if (cl === tl || cl.includes(tl) || tl.includes(cl)) return false;
    if (lowerS.includes(cl)) return false;
    if (isPlural(c.text) !== isPlural(target) && (c.proper || !c.countable)) return false;
    if (Math.abs(c.text.split(/\s+/).length - tw) > 2) return false;
    // Share no content words with the answer (avoids "light energy" vs "light").
    const a = keywordSet(c.text);
    const b = keywordSet(target);
    for (const w of a) if (b.has(w)) return false;
    return true;
  });
  const score = (c: Term) => (c.topics.has(topicId) ? 2 : 0) + (c.concept ? 1 : 0) + (c.fallback ? -3 : 0) + rng();
  return ok
    .sort((a, b) => score(b) - score(a))
    .slice(0, MAX_WRONG)
    .map((c) => formLike(matchNumber(c.text, isPlural(target)), target, c.proper))
    .filter((x, i, arr) => arr.indexOf(x) === i && x.toLowerCase() !== tl && !lowerS.includes(x.toLowerCase()));
}

const NUM_RE = /\b(1[5-9]\d\d|20\d\d)\b|(\d+(?:\.\d+)?)\s?(%|°C|°|per cent|million|billion|km|kg|g|mm|cm|m|nm|μm|ml|l|seconds?|minutes?|hours?|days?|years?|months?)?\b/;

function numberVariants(rng: () => number, match: RegExpMatchArray): { answer: string; wrong: string[] } | null {
  const year = match[1];
  if (year) {
    const y = Number(year);
    const set = new Set<number>();
    for (const d of [-20, -12, -7, -3, 4, 9, 15, 25]) set.add(y + d);
    return { answer: year, wrong: [...set].sort(() => rng() - 0.5).slice(0, MAX_WRONG).map(String) };
  }
  const raw = match[2];
  if (!raw) return null;
  const n = Number(raw);
  const unit = match[3] ? (match[3] === "%" || match[3].startsWith("°") ? match[3] : " " + match[3]) : "";
  const decimals = raw.includes(".") ? raw.split(".")[1].length : 0;
  const cands = new Set<number>();
  if (unit === "%") [n - 20, n - 10, n + 10, n + 20, 100 - n, n / 2].forEach((v) => v > 0 && v < 100 && cands.add(Math.round(v)));
  else [n * 2, n / 2, n + 1, n - 1, n + 5, n + 10, n * 3, n * 1.5].forEach((v) => v > 0 && cands.add(Number(v.toFixed(decimals))));
  cands.delete(n);
  const wrong = [...cands].sort(() => rng() - 0.5).slice(0, MAX_WRONG).map((v) => `${v}${unit}`);
  return wrong.length >= 2 ? { answer: `${raw}${unit}`, wrong } : null;
}

function blankOut(sentence: string, target: string) {
  let out = sentence.replace(wordRe(target, "gi"), BLANK);
  out = out.replace(/\b(a|an)\s+_____/gi, (m) => (m[0] === "A" ? "A(n) " : "a(n) ") + BLANK);
  return out;
}

/** Lines that aren't facts: headings, table rows, references, links. */
function skipLine(s: string) {
  const wc = wordCount(s);
  if (wc < 4 || wc > 60) return true;
  if (/\?$/.test(s)) return true;
  if ((s.match(/: /g) ?? []).length >= 2 || s.includes(" | ")) return true;
  if (/https?:\/\/|www\./i.test(s)) return true;
  if (/^(chapter|see|read|reading|reference|source|figure|fig\.)\b/i.test(s)) return true;
  // Learning objectives and instructions aren't facts.
  if (/^(describe|explain|evaluate|outline|discuss|compare|state|identify|define|understand|know|be able|analyse|analyze|list|recall|apply|consider|remember)\b/i.test(s)) return true;
  return false;
}

/** The fact-bearing sentences of a page, without speaker notes (those are for the presenter). */
export function factSentences(page: Pick<GroundingPage, "text">) {
  const body = page.text.split(/\n\s*Speaker notes:\s*\n/i)[0];
  // Same tidy wording as the notes ("are able to" → "can", no "It is important to note that").
  // Lines with web links are pointers to reading, not facts to test.
  const lines = body.split(/\n+/).filter((l) => !/(?:https?:\/\/|www\.)\S+/i.test(l));
  return splitSentences(lines.join("\n")).map(concise);
}

export function buildCoverageMcqs(pages: GroundingPage[], topics: GroundingTopic[], subject: string): QuestionDraft[] {
  if (!pages.length) return [];
  const bodyPages = pages.map((p) => ({ ...p, text: p.text.split(/\n\s*Speaker notes:\s*\n/i)[0] }));
  const k = buildKnowledge(bodyPages);
  const rng = mulberry(hash(pages.map((p) => p.id).join("|")));
  const pool = termPool(bodyPages, k.concepts.map((c) => c.term), k.keyTerms);
  const out: QuestionDraft[] = [];
  const coveredSets: Set<string>[] = [];
  const covered = (s: string) => {
    const ks = keywordSet(s);
    return coveredSets.some((c) => {
      let inter = 0;
      ks.forEach((w) => c.has(w) && inter++);
      return inter / Math.max(1, Math.min(ks.size, c.size)) >= 0.8;
    });
  };
  const markCovered = (s: string) => coveredSets.push(keywordSet(s));

  for (const page of bodyPages) {
    // 1) Definitions on this page.
    const defs = extractDefinitions(page.text);
    for (const d of defs) {
      const c = k.concepts.find((x) => x.term.toLowerCase() === d.term.toLowerCase() && x.page.id === page.id);
      if (!c) continue;
      const others = k.concepts.filter((x) => x.id !== c.id && !wordRe(c.term).test(x.definition));
      const def = truncate(stripTrailingPunct(c.definition), 170);
      let q: QuestionDraft | null = null;
      if (others.length >= 3) {
        const wrong = others
          .map((x) => ({ x, s: (x.topicId === c.topicId ? 2 : 0) - Math.abs(x.definition.length - c.definition.length) / 120 + rng() }))
          .sort((a, b) => b.s - a.s)
          .slice(0, MAX_WRONG)
          .map(({ x }) => truncate(stripTrailingPunct(x.definition), 170));
        const opts = [def, ...wrong.filter((w, i, a) => w !== def && a.indexOf(w) === i)];
        if (opts.length >= 3)
          q = {
            materialId: page.materialId,
            topicId: page.topicId,
            type: "mcq",
            difficulty: "medium",
            prompt: `What is meant by ${keepsCase(c.term) ? c.term : `“${c.term}”`}?`,
            options: opts,
            correctIndex: 0,
            pool: true,
            answer: def,
            keyPoints: [c.sentence],
            explanation: `${page.label} defines ${c.term} as “${stripTrailingPunct(c.definition)}”.`,
            sources: [refOf(page)],
            marks: 1,
          };
      }
      if (!q) {
        const wrong = pickDistractors(rng, c.term, c.definition, page.topicId, pool);
        if (wrong.length >= 2)
          q = {
            materialId: page.materialId,
            topicId: page.topicId,
            type: "mcq",
            difficulty: "medium",
            prompt: `Which term matches this description? “${truncate(blankOut(stripTrailingPunct(c.definition), c.term), 190)}”`,
            options: [c.term, ...wrong],
            correctIndex: 0,
            pool: true,
            answer: c.term,
            keyPoints: [c.sentence],
            explanation: `${page.label} defines ${c.term} as “${stripTrailingPunct(c.definition)}”.`,
            sources: [refOf(page)],
            marks: 1,
          };
      }
      if (q) {
        out.push(q);
        markCovered(c.sentence);
      }
    }

    // 2) Every other fact on the page, as a fill-the-gap question.
    for (const raw of factSentences(page)) {
      const s = raw.replace(/\s+/g, " ").trim();
      if (skipLine(s) || covered(s)) continue;
      const lower = s.toLowerCase();
      const found: { answer: string | null; wrong: string[] } = { answer: null, wrong: [] };
      // Prefer a defined term, then a figure, then another key term.
      const terms = pool
        .filter((t) => wordRe(t.text).test(s) && t.text.length < s.length * 0.6)
        .sort((a, b) => Number(b.concept) - Number(a.concept) || b.text.length - a.text.length);
      const concept = terms.find((t) => t.concept);
      const tryTerm = (t: { text: string }) => {
        const shown = s.match(wordRe(t.text))?.[0] ?? t.text;
        const w = pickDistractors(rng, shown, s, page.topicId, pool);
        if (w.length >= 2) {
          found.answer = shown;
          found.wrong = w;
          return true;
        }
        return false;
      };
      if (!(concept && tryTerm(concept))) {
        const num = s.match(NUM_RE);
        const nv = num && (num[1] || Number(num[2]) >= 2 || num[3]) ? numberVariants(rng, num) : null;
        if (nv && lower.includes(nv.answer.toLowerCase())) {
          found.answer = nv.answer;
          found.wrong = nv.wrong;
        } else {
          for (const t of terms.filter((x) => !x.concept && !x.fallback)) if (tryTerm(t)) break;
        }
      }
      if (!found.answer) {
        // Last resort: the longest meaningful word that isn't the first word.
        const words = pool.filter((t) => t.fallback && wordRe(t.text).test(s) && s.toLowerCase().indexOf(t.text.toLowerCase()) > 0).sort((a, b) => b.text.length - a.text.length);
        for (const t of words) {
          const shown = s.match(wordRe(t.text))?.[0] ?? t.text;
          const w = pickDistractors(rng, shown, s, page.topicId, pool);
          if (w.length >= 2) {
            found.answer = shown;
            found.wrong = w;
            break;
          }
        }
      }
      const { answer, wrong } = found;
      if (!answer) continue;
      const blanked = blankOut(s, answer);
      if (!blanked.includes(BLANK)) continue;
      out.push({
        materialId: page.materialId,
        topicId: page.topicId,
        type: "mcq",
        difficulty: "medium",
        prompt: `Complete the sentence: ${stripTrailingPunct(blanked)}.`,
        options: [answer, ...wrong],
        correctIndex: 0,
        pool: true,
        answer,
        keyPoints: [s],
        explanation: `From ${page.label}: “${stripTrailingPunct(s)}.”`,
        sources: [refOf(page)],
        marks: 1,
      });
      markCovered(s);
    }
  }
  void topics;
  void subject;
  return out;
}
