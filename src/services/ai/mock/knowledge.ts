/**
 * Extracts a grounded "knowledge base" (concepts + facts) from source pages.
 * Everything the mock AI produces is built from these — it never invents facts.
 */
import { contentWords, extractDefinitions, keywordSet, splitSentences, stem, wordCount } from "@/lib/text";
import type { ID, SourceRef } from "@/types/models";
import type { GroundingPage } from "../types";

export interface Concept {
  id: string;
  term: string;
  definition: string;
  sentence: string;
  page: GroundingPage;
  topicId: ID | null;
}

export interface Fact {
  id: string;
  text: string;
  page: GroundingPage;
  topicId: ID | null;
  score: number;
  hasNumber: boolean;
  isExample: boolean;
  isImportant: boolean;
  terms: string[]; // concept terms mentioned
}

export interface Knowledge {
  concepts: Concept[];
  facts: Fact[];
  keyTerms: string[]; // salient vocabulary, for blanks and distractors
  pages: GroundingPage[];
}

export const refOf = (p: GroundingPage): SourceRef => ({ pageId: p.id, label: p.label });

const IMPORTANT = /\b(important|key|remember|note that|crucial|essential|must|significant|main|always|never|major)\b/i;
const EXAMPLE = /\b(for example|e\.g\.|such as|for instance|an example)\b/i;

export function buildKnowledge(pages: GroundingPage[]): Knowledge {
  const concepts: Concept[] = [];
  const facts: Fact[] = [];
  const seenTerms = new Set<string>();

  // Document frequency for salience scoring.
  const df = new Map<string, number>();
  for (const p of pages) new Set(contentWords(p.title + " " + p.text).map(stem)).forEach((w) => df.set(w, (df.get(w) ?? 0) + 1));
  const N = Math.max(1, pages.length);
  const idf = (w: string) => Math.log(1 + N / (df.get(w) ?? 1));
  const tf = new Map<string, number>();
  for (const p of pages) for (const w of contentWords(p.text).map(stem)) tf.set(w, (tf.get(w) ?? 0) + 1);

  for (const page of pages) {
    const text = page.text.replace(/^Speaker notes:$/m, "");
    for (const d of extractDefinitions(text)) {
      const key = d.term.toLowerCase();
      if (seenTerms.has(key)) continue;
      seenTerms.add(key);
      concepts.push({ id: `c${concepts.length}`, term: d.term, definition: d.definition, sentence: d.sentence, page, topicId: page.topicId });
    }
  }

  const termList = concepts.map((c) => c.term.toLowerCase());
  for (const page of pages) {
    for (const s of splitSentences(page.text)) {
      const wc = wordCount(s);
      if (wc < 6 || wc > 55 || /\?$/.test(s) || /^speaker notes/i.test(s)) continue;
      const ws = contentWords(s).map(stem);
      if (ws.length < 3) continue;
      const salience = ws.reduce((acc, w) => acc + Math.min(4, tf.get(w) ?? 0) * idf(w), 0) / Math.sqrt(ws.length);
      const hasNumber = /\b(1[5-9]\d\d|20\d\d|\d+(\.\d+)?\s?(%|per cent|million|billion|km|kg|mm|nm|μm|seconds?|minutes?|hours?|days?|years?|items?))\b/i.test(s) || /\b\d{2,}\b/.test(s);
      const lower = s.toLowerCase();
      const terms = termList.filter((t) => lower.includes(t));
      facts.push({
        id: `f${facts.length}`,
        text: s.replace(/\s+/g, " ").trim(),
        page,
        topicId: page.topicId,
        score: salience + (IMPORTANT.test(s) ? 1.2 : 0) + (hasNumber ? 0.6 : 0) + terms.length * 0.4,
        hasNumber,
        isExample: EXAMPLE.test(s),
        isImportant: IMPORTANT.test(s),
        terms,
      });
    }
  }

  // Salient vocabulary: capitalised or frequent multi-letter words not in stopwords.
  const vocab = new Map<string, number>();
  for (const p of pages) {
    for (const m of (p.text + " " + p.title).matchAll(/\b([A-Z][a-z]+(?:\s[A-Z][a-z]+){0,2}|[a-z]{6,})\b/g)) {
      const w = m[1];
      if (/^(The|This|These|That|There|They|When|What|Which|While|However|After|Before|During|Slide|Page|Section|Speaker)\b/.test(w)) continue;
      vocab.set(w, (vocab.get(w) ?? 0) + (/^[A-Z]/.test(w) ? 1.5 : 1));
    }
  }
  const keyTerms = [...concepts.map((c) => c.term), ...[...vocab.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).map(([w]) => w)]
    .filter((t, i, arr) => arr.findIndex((x) => x.toLowerCase() === t.toLowerCase()) === i)
    .slice(0, 80);

  return { concepts, facts: facts.sort((a, b) => b.score - a.score), keyTerms, pages };
}

/** Pick the best supporting sentences for a free-text query. */
export function retrieve(pages: GroundingPage[], query: string, k = 4) {
  const q = keywordSet(query);
  const scored: { text: string; page: GroundingPage; score: number }[] = [];
  for (const page of pages) {
    const titleKw = keywordSet(page.title);
    let titleHit = 0;
    q.forEach((w) => titleKw.has(w) && titleHit++);
    for (const s of splitSentences(page.text)) {
      if (/^speaker notes/i.test(s)) continue;
      const sk = keywordSet(s);
      let hit = 0;
      q.forEach((w) => sk.has(w) && hit++);
      if (!hit && !titleHit) continue;
      const score = hit * 2 + titleHit * 1.2 + (hit / Math.max(3, sk.size)) * 2 + (EXAMPLE.test(s) ? 0.1 : 0);
      scored.push({ text: s, page, score });
    }
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, k).filter((s) => s.score >= 2);
}

export function excerpt(page: GroundingPage, sentence?: string, radius = 220) {
  const t = page.text.replace(/\n+/g, " ");
  if (!sentence) return t.slice(0, radius * 2);
  const i = t.indexOf(sentence.slice(0, 40));
  if (i < 0) return t.slice(0, radius * 2);
  const start = Math.max(0, i - radius / 2);
  return (start > 0 ? "…" : "") + t.slice(start, i + sentence.length + radius / 2).trim() + (i + sentence.length + radius / 2 < t.length ? "…" : "");
}
