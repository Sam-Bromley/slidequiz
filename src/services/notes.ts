/**
 * Turns the included slides into organised study notes: grouped by topic, every line kept,
 * with key terms picked out, sub-points nested, tables laid out and speaker notes kept separate.
 */
import { extractDefinitions, splitSentences, stripTrailingPunct, wordCount } from "@/lib/text";
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
  speaker: string[];
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
const LEAD = /^([^:–—]{2,48}?)\s*(?::|\s[–—-]\s)\s*(.+)$/;

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

export function noteSlide(page: Page, sectionTitle: string): NoteSlide {
  const { body, speaker } = splitBody(page.text);
  const raw = body.split(/\n+/).map(clean).filter(Boolean);
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
    speaker: speaker.split(/\n+/).map(clean).filter(Boolean),
    images: (page.images ?? []).filter((i) => i.included),
    photo: page.imageDataUrl,
  };
}

/** The whole material as notes. Only included slides (and their included pictures) appear. */
export function buildNotes(m: Material): NoteSection[] {
  const pages = m.pages.filter((p) => p.included && (p.text.trim() || p.images?.some((i) => i.included) || p.imageDataUrl));
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
    sec.slides.push(noteSlide(p, sec.title));
    for (const d of extractDefinitions(splitBody(p.text).body))
      if (!sec.terms.some((t) => t.term.toLowerCase() === d.term.toLowerCase())) sec.terms.push({ term: d.term, definition: stripTrailingPunct(d.definition), label: p.label, pageId: p.id });
  }
  return sections;
}
