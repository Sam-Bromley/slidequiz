/**
 * Turns the included slides into organised study notes: grouped by topic, every line kept,
 * with key terms picked out, sub-points nested and tables laid out. Speaker notes are left out.
 */
import { extractDefinitions, keywordSet, splitSentences, stripTrailingPunct, wordCount } from "@/lib/text";
import { isLikelyIrrelevant } from "@/services/parsing/sections";
import type { ID, Material, Page, PageImage } from "@/types/models";

export interface NoteLine {
  kind: "bullet" | "para" | "sub";
  text: string;
  /** Bold lead-in, e.g. "Stroma" in "Stroma: the fluid…". */
  term?: string;
  /** What joins the term to the text: ": " for "Term: …", " " for "Term is …". */
  sep?: string;
  depth: 0 | 1;
}

export interface NoteSlide {
  page: Page;
  /** Shown as a small heading unless it just repeats the section title. */
  title: string | null;
  lines: NoteLine[];
  table: string[][] | null;
  images: PageImage[];
  photo?: string;
}

export interface NoteSection {
  id: string;
  topicId: ID | null;
  title: string;
  slides: NoteSlide[];
  terms: { term: string; definition: string; label: string; pageId: ID }[];
}

const BULLET = /^[\s•\-–*▪◦·●○■□➢➤►▶]+/;
const clean = (s: string) => s.replace(BULLET, "").replace(/\s+/g, " ").trim();
const same = (a: string, b: string) => a.toLowerCase().replace(/\s*\((cont(inued)?\.?|part\s*\d+)\)\s*$/i, "").trim() === b.toLowerCase().trim();

/** "Term: explanation" or "Term – explanation" at the start of a line. */
const LEAD = /^([^:–—(]{2,48}?)\s*(?::(?!\/\/)|\s[–—-]\s)\s*(.+)$/;

function splitBody(text: string) {
  const [body, ...rest] = text.split(/\n\s*Speaker notes:\s*\n/i);
  return { body, speaker: rest.join("\n") };
}

function tableRows(lines: string[]): { rows: string[][]; start: number; end: number } | null {
  const cells = (l: string) => (l.includes(" | ") ? l.split(" | ") : l.split(/:\s+/)).map((c) => c.trim());
  let best: { rows: string[][]; start: number; end: number } | null = null;
  for (let i = 0; i < lines.length; i++) {
    const n = cells(lines[i]).length;
    if (n < 3) continue;
    let j = i + 1;
    while (j < lines.length && cells(lines[j]).length === n) j++;
    if (j - i >= 2 && (!best || j - i > best.end - best.start)) best = { rows: lines.slice(i, j).map(cells), start: i, end: j };
    i = j - 1;
  }
  return best;
}

/** Lines that are about the lecture rather than the subject. */
const ADMIN_LINE = /^(learning (objectives|outcomes|aims)|by the end of|in this (lecture|session|lesson)|today we will|this (lecture|session) (will|covers)|recommended reading|further reading|reading:|see (chapter|page|pp?\.)|remember to|don'?t forget|deadline|submit)/i;

const FILLER_START = /^(it is (important|worth|useful) (to note|noting|remembering) that|it should be noted that|note that|remember that|in other words,?|basically,?|essentially,?|simply put,?|put simply,?|as (we|you) (can )?see,?|importantly,?|interestingly,?|of course,?)\s+/i;
const WORDY: [RegExp, string][] = [
  [/\bin order to\b/gi, "to"],
  [/\bdue to the fact that\b/gi, "because"],
  [/\bowing to the fact that\b/gi, "because"],
  [/\bin spite of the fact that\b/gi, "although"],
  [/\bis able to\b/gi, "can"],
  [/\bare able to\b/gi, "can"],
  [/\ba (large )?number of\b/gi, "many"],
  [/\bthe majority of\b/gi, "most"],
  [/\bat this point in time\b/gi, "now"],
  [/\bprior to\b/gi, "before"],
  [/\bsubsequent to\b/gi, "after"],
  [/\bin the event that\b/gi, "if"],
  [/\bwith regard to\b/gi, "about"],
  [/\bis defined as\b/gi, "is"],
  [/\bare defined as\b/gi, "are"],
  [/\bit is (clear|evident) that\b/gi, ""],
  [/\bvery\s+/gi, ""],
];

/** Same meaning, fewer words. Nothing factual is removed. */
export function concise(line: string) {
  let t = line.replace(FILLER_START, "");
  for (const [re, to] of WORDY) t = t.replace(re, to);
  t = t.replace(/\s{2,}/g, " ").replace(/\s+([,.;:])/g, "$1").trim();
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

export function noteSlide(page: Page, sectionTitle: string): NoteSlide {
  const { body } = splitBody(page.text);
  const raw = body
    .split(/\n+/)
    .map(clean)
    .filter(Boolean)
    .filter((l) => !ADMIN_LINE.test(l) && !same(l, page.title))
    .map(concise);
  // Word sections start with "(Parent heading)" for context; the section heading already shows it.
  if (raw[0] && /^\(.*\)$/.test(raw[0])) raw.shift();
  const table = tableRows(raw);
  const rest = table ? [...raw.slice(0, table.start), ...raw.slice(table.end)] : raw;
  const defs = extractDefinitions(body);
  const lines: NoteLine[] = [];
  let underSub = false;
  for (const l of rest) {
    if (/:$/.test(l) && wordCount(l) <= 10) {
      lines.push({ kind: "sub", text: stripTrailingPunct(l), depth: 0 });
      underSub = true;
      continue;
    }
    const long = l.length > 170 || splitSentences(l).length > 1;
    const line: NoteLine = { kind: long ? "para" : "bullet", text: l, depth: underSub && !long ? 1 : 0 };
    const lead = l.match(LEAD);
    if (lead && wordCount(lead[1]) <= 5 && !/[.!?]/.test(lead[1])) {
      line.term = lead[1].trim();
      line.text = lead[2].trim();
      line.sep = ": ";
    } else {
      const d = defs.find((x) => l.toLowerCase().startsWith(x.term.toLowerCase()) || l.toLowerCase().startsWith("the " + x.term.toLowerCase()) || l.toLowerCase().startsWith("a " + x.term.toLowerCase()) || l.toLowerCase().startsWith("an " + x.term.toLowerCase()));
      if (d) {
        const idx = l.toLowerCase().indexOf(d.term.toLowerCase());
        line.term = l.slice(0, idx + d.term.length);
        line.text = l.slice(idx + d.term.length).trim();
        line.sep = " ";
      }
    }
    lines.push(line);
  }
  return {
    page,
    title: page.title && !same(page.title, sectionTitle) ? page.title : null,
    lines,
    table: table?.rows ?? null,
    images: (page.images ?? []).filter((i) => i.included),
    photo: page.imageDataUrl,
  };
}

/** The whole material as notes. Only included slides (and their included pictures) appear. */
export function buildNotes(m: Material): NoteSection[] {
  // Only subject content: title, objectives, agenda, admin and reading-list slides are left out.
  const pages = m.pages.filter((p, i) => p.included && !isLikelyIrrelevant(p, i) && (p.text.trim() || p.images?.some((x) => x.included) || p.imageDataUrl));
  const seen: Set<string>[] = [];
  const sections: NoteSection[] = [];
  const byTopic = new Map<string, NoteSection>();
  for (const p of pages) {
    const topic = m.topics.find((t) => t.id === p.topicId);
    const key = topic?.id ?? "none";
    let sec = byTopic.get(key);
    if (!sec) {
      sec = { id: `sec-${key}`, topicId: topic?.id ?? null, title: topic?.name ?? "Other notes", slides: [], terms: [] };
      byTopic.set(key, sec);
      sections.push(sec);
    }
    const slide = noteSlide(p, sec.title);
    // Drop points already made earlier in the notes (slides often repeat themselves).
    slide.lines = slide.lines.filter((l) => {
      if (l.kind === "sub") return true;
      const k = keywordSet((l.term ?? "") + " " + l.text);
      if (k.size < 3) return true;
      const dup = seen.some((o) => {
        let n = 0;
        k.forEach((w) => o.has(w) && n++);
        return n / Math.min(k.size, o.size) >= 0.85;
      });
      if (!dup) seen.push(k);
      return !dup;
    });
    if (!slide.lines.length && !slide.table && !slide.images.length && !slide.photo) continue;
    sec.slides.push(slide);
    for (const d of extractDefinitions(splitBody(p.text).body))
      if (!sec.terms.some((t) => t.term.toLowerCase() === d.term.toLowerCase())) sec.terms.push({ term: d.term, definition: stripTrailingPunct(d.definition), label: p.label, pageId: p.id });
  }
  return sections.filter((x) => x.slides.length);
}
