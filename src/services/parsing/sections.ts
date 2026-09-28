import { jaccard, keywordSet, topKeywords, titleCase, truncate, wordCount } from "@/lib/text";

export interface TopicGroup {
  name: string;
  pageIdxs: number[];
}

interface PageLike {
  title: string;
  text: string;
}

const SKIP_TITLE =
  /^(thank\s*you|thanks|any\s+questions\??|questions\??|q\s*&\s*a|references|bibliography|further reading|reading list|recommended reading|resources|contents|table of contents|agenda|outline|housekeeping|welcome( to [^:]*)?$|introductions$|about (me|us|the (module|course|lecturer))|meet the team|(session|lecture|module|course|lesson|today'?s) (overview|plan|outline|objectives|aims|outcomes|structure|information|info)|(learning|lesson|session|lecture) (objectives|outcomes|aims|goals)|objectives|aims( and objectives)?|intended learning outcomes|assessment( information| details| criteria)?|deadlines?|timetable|office hours|contact( details)?|module (information|handbook|details)|course (information|details)|what we('ll| will) cover|in this (lecture|session)|recap|last (week|lecture|time|session)|previously|where we left off|starter|plenary|warm[\s-]?up|break|discussion( questions?)?|group (activity|work|task)|activity|task \d*|exercise \d*|quiz|poll|questions to (consider|think about)|think about( this)?|key questions)\b/i;

/** Titles that are only framing when they are the whole title ("Introduction" yes, "Introduction to enzymes" no). */
const SKIP_EXACT = /^(introduction|intro|overview|background|today|this week|plan|the plan|summary of today|lecture summary|next (week|time|lecture|session)|coming up|homework|independent study|self[\s-]study)[\s.:!?]*$/i;

const OBJECTIVE_VERB = /^(describe|explain|evaluate|outline|discuss|compare|state|identify|define|understand|know|be able|analyse|analyze|list|recall|apply|recognise|recognize|demonstrate|summarise|summarize|appreciate)\b/i;

/** Pages students usually don't want questions from (title slides, references, "Any questions?"). */
export function isLikelyIrrelevant(p: PageLike, idx: number): boolean {
  const t = p.title.trim();
  if (SKIP_TITLE.test(t) || SKIP_EXACT.test(t)) return true;
  const body = p.text.split(/\n\s*Speaker notes:\s*\n/i)[0];
  if (idx === 0 && wordCount(body) < 14 && !/:/.test(body)) return true; // title slide
  // Learning outcomes with an unusual title: "By the end of this lecture you will…" or mostly "Describe…/Explain…" lines.
  if (/\b(by the end of (this|the|today)|you will be able to|you should be able to|students will be able to)\b/i.test(body.slice(0, 200))) return true;
  const lines = body.split(/\n+/).map((l) => l.replace(/^[\s•\-–*▪◦·]+/, "").trim()).filter(Boolean);
  const verbs = lines.filter((l) => OBJECTIVE_VERB.test(l)).length;
  if (lines.length >= 2 && verbs / lines.length >= 0.6) return true;
  return false;
}

function cleanTitle(t: string) {
  return t
    .replace(/^(lecture|week|topic|unit|chapter|part)\s*\d+\s*[:.\-–]\s*/i, "")
    .replace(/\s*\((cont(inued)?\.?|part\s*\d+)\)\s*$/i, "")
    .replace(/\s*[-–:]\s*(part\s*)?\d+\s*$/i, "")
    .replace(/\s*(i{1,3}|iv)$/i, "")
    .trim();
}

/**
 * Heuristic topic detection. Groups consecutive pages that share vocabulary,
 * treats short "divider" pages as section starts, then merges tiny groups.
 * A real AI provider can replace this with semantic clustering.
 */
export function detectTopics(pages: PageLike[]): TopicGroup[] {
  if (!pages.length) return [];
  const kws = pages.map((p) => {
    const titleKw = keywordSet(cleanTitle(p.title));
    const bodyKw = new Set(topKeywords(p.text, 6).map((w) => w.replace(/s$/, "")));
    return new Set([...titleKw, ...titleKw, ...bodyKw]);
  });

  const groups: { idxs: number[]; kw: Set<string>; divider?: string }[] = [];
  pages.forEach((p, i) => {
    const isDivider = wordCount(p.text) < 10 && p.title.length > 2 && p.title.length < 60 && i > 0;
    const cur = groups[groups.length - 1];
    const sim = cur ? jaccard(kws[i], cur.kw) : 0;
    const titleSim = cur ? jaccard(keywordSet(cleanTitle(p.title)), keywordSet(cleanTitle(pages[cur.idxs[0]].title))) : 0;
    if (!cur || isDivider || (sim < 0.08 && titleSim < 0.34 && (cur.idxs.length >= 2 || pages.length <= 8))) {
      groups.push({ idxs: [i], kw: new Set(kws[i]), divider: isDivider ? cleanTitle(p.title) : undefined });
    } else {
      cur.idxs.push(i);
      kws[i].forEach((k) => cur.kw.add(k));
    }
  });

  const target = pages.length <= 4 ? pages.length : Math.max(2, Math.min(8, Math.ceil(pages.length / 3)));
  while (groups.length > target) {
    let smallest = 0;
    groups.forEach((g, i) => {
      if (g.idxs.length < groups[smallest].idxs.length) smallest = i;
    });
    const g = groups[smallest];
    const left = groups[smallest - 1];
    const right = groups[smallest + 1];
    const into = !left ? right : !right ? left : jaccard(g.kw, left.kw) >= jaccard(g.kw, right.kw) ? left : right;
    if (!into) break;
    if (into === left) {
      left.idxs.push(...g.idxs);
    } else {
      right.idxs.unshift(...g.idxs);
      if (g.divider) right.divider = g.divider;
    }
    g.kw.forEach((k) => into.kw.add(k));
    groups.splice(smallest, 1);
  }

  const used = new Set<string>();
  return groups.map((g, gi) => {
    let name = g.divider ?? nameFor(g.idxs.map((i) => pages[i]));
    if (!name || used.has(name.toLowerCase())) name = `${name || "Topic"} ${gi + 1}`;
    used.add(name.toLowerCase());
    return { name: truncate(name, 48), pageIdxs: g.idxs.sort((a, b) => a - b) };
  });
}

function nameFor(ps: PageLike[]): string {
  const titles = ps.map((p) => cleanTitle(p.title)).filter((t) => t && !SKIP_TITLE.test(t));
  if (!titles.length) return "Overview";
  if (titles.length === 1) return titles[0];
  // Longest shared leading phrase, e.g. "DNA replication" from "DNA replication: enzymes", "DNA replication: steps".
  const split = titles.map((t) => t.split(/\s*:\s*|\s+[-–]\s+/)[0]);
  const counts = new Map<string, number>();
  split.forEach((s) => counts.set(s, (counts.get(s) ?? 0) + 1));
  const [best, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (n >= 2) return best;
  const kw = topKeywords(titles.join(" "), 2);
  if (kw.length === 2 && titles[0].toLowerCase().includes(kw[0])) return titles[0].length < 40 ? titles[0] : titleCase(kw.join(" & "));
  return titles[0];
}
