/**
 * Turns the included slides into organised study notes: grouped by topic, every line kept,
 * with key terms picked out, sub-points nested and tables laid out. Speaker notes are left out.
 */
import { extractDefinitions, keywordSet, splitSentences, stripTrailingPunct, wordCount } from "@/lib/text";
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


/** In-text references like (Smith et al., 2019), (Jones & Lee 2020; Brown, 2018) or [3]. */
const CITATIONS = [
  /\s*\((?:see\s+)?(?:[A-Z][A-Za-z'’\-]+(?:\s(?:&|and)\s[A-Z][A-Za-z'’\-]+)?(?:\set\sal\.?)?,?\s(?:c\.\s?)?\d{4}[a-z]?(?:,\s?p+\.\s?\d+(?:[–-]\d+)?)?(?:;\s?)?)+\)/g,
  /\s*\[\d+(?:\s?[,–-]\s?\d+)*\]/g,
  /(?<=[A-Za-z])\s\((?:\d{4}[a-z]?)\)/g,
];
export const stripCitations = (t: string) => CITATIONS.reduce((x, re) => x.replace(re, ""), t);

const FILLER_START = /^(it is (important|worth|useful) (to note|noting|remembering) that|it should be noted that|note that|remember that|in other words,?|basically,?|essentially,?|simply put,?|put simply,?|as (we|you) (can )?see,?|importantly,?|interestingly,?|of course,?|in summary,?|to summari[sz]e,?|overall,?|so,|firstly,?|secondly,?|finally,?|in addition,?|additionally,?|furthermore,?|moreover,?|also,)\s+/i;
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
  [/^there (?:are|is) /i, ""],
];

/** Same meaning, fewer words. Nothing factual is removed. */
export function concise(line: string) {
  let t = stripCitations(line).replace(FILLER_START, "");
  for (const [re, to] of WORDY) t = t.replace(re, to);
  t = t.replace(/\s{2,}/g, " ").replace(/\s+([,.;:])/g, "$1").trim();
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}


const NUMBER_WORDS: Record<string, string> = { one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10", eleven: "11", twelve: "12" };

/**
 * Note style: a definition becomes "Term – meaning", small numbers become digits,
 * and the closing full stop goes, so each bullet reads at a glance.
 */
function noteLine(t: string, defs: ReturnType<typeof extractDefinitions>, sub: boolean): NoteLine {
  let text = t.replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b(?=\s+(?:out of|of|types?|kinds?|stages?|steps?|parts?|main|key|major|different|[a-z]+s\b))/gi, (w) => NUMBER_WORDS[w.toLowerCase()] ?? w);
  text = text.replace(/(?<![.\d])\.$/, "");
  const line: NoteLine = { kind: "bullet", text, depth: sub ? 1 : 0 };
  const lead = text.match(LEAD);
  if (lead && wordCount(lead[1]) <= 5 && !/[.!?]/.test(lead[1])) {
    line.term = lead[1].trim();
    line.text = lead[2].trim();
    line.sep = ": ";
    return line;
  }
  // "The stroma is the fluid…" → "Stroma – fluid…"
  const lower = text.toLowerCase();
  const d = defs.find((x) => [x.term, "the " + x.term, "a " + x.term, "an " + x.term].some((p) => lower.startsWith(p.toLowerCase() + " ")));
  const m = text.match(/^(?:the |a |an )?(.{2,50}?)\s+(?:is|are)\s+(?:(?:defined as|known as|called)\s+)?(?:the |a |an )?(.+)$/i);
  if (m && (d || (wordCount(m[1]) <= 4 && !/^(it|this|that|these|those|they|there|he|she|we|you|which|what|one|each|both|such|all|some|most|many)\b/i.test(m[1]) && /^(the |a |an )/i.test(text.slice(text.search(/\s(is|are)\s/i) + 4))))) {
    const term = m[1].trim();
    line.term = term[0].toUpperCase() + term.slice(1);
    line.text = m[2].trim();
    line.sep = " – ";
    return line;
  }
  if (d) {
    const idx = lower.indexOf(d.term.toLowerCase());
    line.term = text.slice(0, idx + d.term.length);
    line.text = text.slice(idx + d.term.length).trim();
    line.sep = " ";
  }
  return line;
}

export function noteSlide(page: Page, sectionTitle: string): NoteSlide {
  const { body } = splitBody(page.text);
  const raw = body
    .split(/\n+/)
    .map(clean)
    .filter(Boolean)
    .filter((l) => !same(l, page.title));
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
    // One point per bullet: long lines are split into their sentences.
    for (const sentence of splitSentences(l).length > 1 ? splitSentences(l) : [l]) {
      const t = concise(sentence);
      if (!t) continue;
      lines.push(noteLine(t, defs, underSub));
    }
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
  const pages = m.pages.filter((p) => p.included && (p.text.trim() || p.images?.some((x) => x.included) || p.imageDataUrl));
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
  for (const sec of sections) giveSubheadings(sec);
  return sections.filter((x) => x.slides.length);
}

const GENERIC_TITLE = /^((slide|page|section|part)\s*\d+|continued|cont\.?|untitled|notes?|summary slide|\d+)$/i;
const cleanTitle = (t: string) =>
  t
    .replace(/^(lecture|week|topic|unit|chapter|part|section)\s*\d+\s*[:.\-–]\s*/i, "")
    .replace(/^\d+(\.\d+)*[.)]?\s+/, "")
    .replace(/\s*[(\[]?(cont(inued|'d)?\.?|part\s*\d+|\d+\s*of\s*\d+)[)\]]?\s*$/i, "")
    .replace(/\s*[-–:]\s*(part\s*)?\d+$/i, "")
    .replace(/[?:]$/, "")
    .trim();
const SUBJECT = /^(.{2,40}?)\s+(is|are|was|were|has|have|holds?|stores?|transfers?|causes?|can|involves?|means|refers|occurs?|takes?|produces?|contains?|includes?|leads?|allows?|helps?)\b/i;
const sentence = (t: string) => (t ? t[0].toUpperCase() + t.slice(1) : t);
/** Lower-case the start unless it's a name or acronym (DNA, Calvin). */
const lowerStart = (t: string) => (/^[A-Z][a-z]/.test(t) && !/^[A-Z][a-z]+ [A-Z]/.test(t) ? t[0].toLowerCase() + t.slice(1) : t);

/** Every part of a topic gets a clear subheading; slides that continue the same heading are grouped under it. */
function giveSubheadings(sec: NoteSection) {
  let prev = "";
  sec.slides.forEach((s, i) => {
    let h = cleanTitle(s.page.title || "");
    if (!h || GENERIC_TITLE.test(h) || same(h, sec.title)) {
      if (i === 0) h = "Overview";
      else {
        // Name the part after what its points are about: "Long-term memory and rehearsal".
        const subjects: string[] = [];
        for (const l of s.lines) {
          const subj = (l.term ?? l.text.match(SUBJECT)?.[1] ?? "").replace(/^(the|a|an)\s+/i, "").trim();
          if (subj && subj.split(/\s+/).length <= 5 && !same(subj, sec.title) && !subjects.some((x) => same(x, subj))) subjects.push(subj);
        }
        if (subjects.length && subjects.length <= 3) h = sentence(subjects.map((x, j) => (j ? lowerStart(x) : x)).join(subjects.length === 2 ? " and " : ", ").replace(/, ([^,]*)$/, " and $1"));
        else h = "More on " + sec.title.toLowerCase();
      }
    }
    s.title = h.toLowerCase() === prev.toLowerCase() ? null : h;
    prev = h;
  });
}

/** The notes as a document for export (PDF, Word, text, Markdown, web page). */
export function notesExportDoc(m: Material): import("@/services/export").ExportDoc {
  const blocks: import("@/services/export").ExportDoc["blocks"] = [];
  for (const sec of buildNotes(m)) {
    blocks.push({ kind: "h2", text: sec.title });
    for (const s of sec.slides) {
      if (s.title) blocks.push({ kind: "p", text: s.title.toUpperCase() });
      const items = s.lines.map((l) => (l.term ? `${l.term}${l.sep ?? ": "}${l.text}` : l.text));
      if (s.table) items.push(...s.table.map((r) => r.join(" | ")));
      if (items.length) blocks.push({ kind: "list", items });
    }
  }
  return { title: `${m.title} notes`, subtitle: m.subject, blocks };
}
