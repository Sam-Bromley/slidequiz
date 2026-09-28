import { jaccard, keywordSet, topKeywords, titleCase, truncate, wordCount } from "@/lib/text";

export interface TopicGroup {
  name: string;
  pageIdxs: number[];
}

interface PageLike {
  title: string;
  text: string;
}

const SKIP_TITLE = /^(thank\s*you|thanks|any\s+questions\??|questions\??|q\s*&\s*a|references|bibliography|further reading|reading list|contents|table of contents|agenda|outline|housekeeping)\b/i;

/** Pages students usually don't want questions from (title slides, references, "Any questions?"). */
export function isLikelyIrrelevant(p: PageLike, idx: number): boolean {
  const t = p.title.trim();
  if (SKIP_TITLE.test(t)) return true;
  if (idx === 0 && wordCount(p.text) < 14 && !/:/.test(p.text)) return true; // title slide
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
