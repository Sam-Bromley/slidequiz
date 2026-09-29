import { tidyHeading, jaccard, keywordSet, topKeywords, titleCase, truncate, wordCount } from "@/lib/text";

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

/** Signposting and slide furniture: fine as slides, but not names for a topic. */
const NOT_A_TOPIC =
  /^(coming up( next)?|up next|next( up| time| week| lecture| session)?|what'?s next|where next|now|then|so|and|but|finally|lastly|first(ly)?|next steps?|moving on|let'?s (begin|start|recap|review)|summary|conclusions?|in summary|key (points|messages|takeaways)|take[\s-]?home (messages?|points)|remember|reminder|note|notes|example|examples|case stud(y|ies)|question( \d+)?|answer( \d+)?|answers|solution|pause|stop|break|video|image|figure|diagram|table|chart|slide|page|section|untitled|title|continued|cont\.?)[\s.:!?…]*$/i;

/** A heading that can name a topic: real words, not a number, a slide label or a sign-post. */
export function isTopicTitle(raw: string): boolean {
  const t = cleanTitle(raw).replace(/[.…]+$/, "").trim();
  if (t.length < 3 || t.length > 70) return false;
  if (!/[a-z]{3}/i.test(t)) return false; // "33", "4.2", "—"
  if (/^(slide|page|section|part|figure|fig\.?|table)\s*\d+/i.test(t)) return false;
  if (/^\d+([.)]|\s*$)/.test(t) && !/[a-z]{3}.*[a-z]{3}/i.test(t)) return false;
  if (/(\.\.\.|…)$/.test(raw.trim())) return false; // "Coming up next…"
  if (SKIP_TITLE.test(t) || SKIP_EXACT.test(t) || NOT_A_TOPIC.test(t)) return false;
  if (wordCount(t) > 9) return false; // a sentence, not a heading
  return true;
}

function cleanTitle(t: string) {
  return tidyHeading(t)
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
    // A near-empty slide with a proper heading starts a new section ("Plasma proteins").
    const isDivider = i > 0 && wordCount(p.text) < 10 && isTopicTitle(p.title);
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
      // The group now starts with other slides, so its divider heading no longer names it.
      right.divider = g.divider;
    }
    g.kw.forEach((k) => into.kw.add(k));
    groups.splice(smallest, 1);
  }

  // Two neighbouring groups that would get the same name are really one topic.
  for (let i = groups.length - 1; i > 0; i--) {
    const a = groups[i - 1], b = groups[i];
    if ((a.divider ?? nameFor(a.idxs.map((x) => pages[x]))).toLowerCase() === (b.divider ?? nameFor(b.idxs.map((x) => pages[x]))).toLowerCase()) {
      a.idxs.push(...b.idxs);
      b.kw.forEach((k) => a.kw.add(k));
      groups.splice(i, 1);
    }
  }
  // Closing slides with little on them ("Thank you", "Questions?", "Further reading") join the topic before.
  for (let i = groups.length - 1; i > 0; i--) {
    const g = groups[i];
    const words = g.idxs.reduce((n, x) => n + wordCount(pages[x].text), 0);
    if (!g.divider && g.idxs.every((x) => !isTopicTitle(pages[x].title)) && words < 40) {
      groups[i - 1].idxs.push(...g.idxs);
      groups.splice(i, 1);
    }
  }
  const names = nameTopics(groups.map((g) => ({ pages: g.idxs.map((i) => pages[i]), preferred: g.divider })), pages[0]);
  return groups.map((g, gi) => ({ name: names[gi], pageIdxs: g.idxs.sort((a, b) => a - b) }));
}

/**
 * Names for a list of topics, each different: the section's own heading if it has a good one,
 * otherwise the heading its slides share, otherwise the main subject of its text.
 */
export function nameTopics(topics: { pages: PageLike[]; preferred?: string }[], firstPage?: PageLike): string[] {
  const used = new Set<string>();
  return topics.map((t0) => {
    // A long first-slide title is the whole lecture's name ("Phlebotomy plasma and blood recap"),
    // so it only names a topic if nothing else can. A short one ("Memory") is a fine topic name.
    const lectureTitle = firstPage && t0.pages.includes(firstPage) && wordCount(cleanTitle(firstPage.title)) >= 4 && t0.pages.some((p) => p !== firstPage && isTopicTitle(p.title));
    const t = lectureTitle ? { ...t0, pages: t0.pages.filter((p) => p !== firstPage) } : t0;
    const options = [
      t.preferred && isTopicTitle(t.preferred) ? cleanTitle(t.preferred) : "",
      nameFor(t.pages),
      ...t.pages.map((p) => (isTopicTitle(p.title) ? cleanTitle(p.title) : "")),
      // Next best: any real heading, even a plain one like "Further reading".
      ...t.pages.map((p) => (isPlainTitle(p.title) ? cleanTitle(p.title) : "")),
    ].filter(Boolean);
    let name = options.find((o) => !used.has(o.toLowerCase())) ?? "";
    if (!name) {
      const base = options[0] || subjectOf(t.pages) || "Other";
      // (Only reached when every heading is already taken or there are none.)
      name = base;
      for (let n = 2; used.has(name.toLowerCase()); n++) name = n === 2 ? `${base} (continued)` : `${base} (part ${n})`;
    }
    used.add(name.toLowerCase());
    return truncate(tidyHeading(name).replace(/[.:…]+$/, ""), 48);
  });
}

/** Words that could head a slide, even if it's not a subject ("Further reading" yes; "33", "Coming up next…" no). */
function isPlainTitle(raw: string) {
  const t = cleanTitle(raw);
  return /[a-z]{3}/i.test(t) && t.length <= 70 && !/(\.\.\.|…)$/.test(raw.trim()) && !/^(slide|page|section)\s*\d+$/i.test(t) && !/^(coming up|up next|next|what'?s next|untitled)\b/i.test(t);
}

/** "Plasma proteins" from the words the slides use most, when none of them has a usable heading. */
function subjectOf(ps: PageLike[]): string {
  const kw = topKeywords(ps.map((p) => p.text).join(" "), 2);
  return kw.length ? kw[0][0].toUpperCase() + kw[0].slice(1) + (kw[1] ? ` and ${kw[1]}` : "") : "";
}

function nameFor(ps: PageLike[]): string {
  const titles = ps.filter((p) => isTopicTitle(p.title)).map((p) => cleanTitle(p.title));
  if (!titles.length) return "";
  if (titles.length === 1) return titles[0];
  // Longest shared leading phrase, e.g. "DNA replication" from "DNA replication: enzymes", "DNA replication: steps".
  const split = titles.map((t) => t.split(/\s*:\s*|\s+[-–]\s+/)[0]);
  const counts = new Map<string, number>();
  split.forEach((s) => counts.set(s, (counts.get(s) ?? 0) + 1));
  const [best, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (n >= 2 && isTopicTitle(best)) return best;
  const kw = topKeywords(titles.join(" "), 2);
  if (kw.length === 2 && titles[0].toLowerCase().includes(kw[0])) return titles[0].length < 40 ? titles[0] : titleCase(kw.join(" & "));
  return titles[0];
}
