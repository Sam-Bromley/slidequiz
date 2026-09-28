/**
 * "More detail" without a language model: gathers everything else the slides say about the
 * requested part (definitions, related points on other slides, speaker notes). It never invents facts.
 */
import { extractDefinitions, keywordSet, splitSentences, stripTrailingPunct } from "@/lib/text";
import type { DetailRequest, DetailResult, GroundingPage } from "../types";

const body = (p: GroundingPage) => p.text.split(/\n\s*Speaker notes:\s*\n/i)[0];
const notes = (p: GroundingPage) => p.text.split(/\n\s*Speaker notes:\s*\n/i)[1] ?? "";

function overlap(a: Set<string>, b: Set<string>) {
  let n = 0;
  a.forEach((w) => b.has(w) && n++);
  return n;
}

export function buildDetail(req: DetailRequest): DetailResult {
  const q = keywordSet(req.request.replace(/\b(more|detail|details|explain|about|on|the|please|expand|elaborate|tell|me)\b/gi, " "));
  const pages = req.pages;
  let anchor = req.pageId ? pages.find((p) => p.id === req.pageId) : undefined;
  if (!anchor) {
    let best = 0;
    for (const p of pages) {
      const score = overlap(q, keywordSet(p.title)) * 3 + overlap(q, keywordSet(body(p)));
      if (score > best) (best = score), (anchor = p);
    }
  }
  if (!anchor) return { pageId: null, blocks: [] };
  const focus = q.size ? q : keywordSet(anchor.title);
  const anchorKw = keywordSet(anchor.title + " " + body(anchor));
  const anchorText = body(anchor).toLowerCase();
  const blocks: DetailResult["blocks"] = [];
  const seen = new Set<string>(splitSentences(body(anchor)).map((s) => s.toLowerCase()));

  // 1) Definitions of terms this part uses, defined on other slides.
  for (const p of pages) {
    if (p.id === anchor.id) continue;
    for (const d of extractDefinitions(body(p))) {
      const tk = keywordSet(d.term);
      if (!overlap(tk, focus) && !anchorText.includes(d.term.toLowerCase())) continue;
      const key = d.sentence.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      blocks.push({ kind: "definition", text: `${d.term}: ${stripTrailingPunct(d.definition)}.`, label: p.label, pageId: p.id });
    }
  }

  // 2) Related points from other slides.
  const related: { text: string; p: GroundingPage; score: number }[] = [];
  for (const p of pages) {
    if (p.id === anchor.id) continue;
    for (const s of splitSentences(body(p))) {
      if (seen.has(s.toLowerCase()) || s.includes(" | ") || (s.match(/: /g) ?? []).length >= 2 || s.split(/\s+/).length < 4) continue;
      const k = keywordSet(s);
      const score = overlap(k, focus) * 2 + overlap(k, anchorKw) * 0.5;
      if (score >= 2) related.push({ text: s, p, score });
    }
  }
  for (const r of related.sort((a, b) => b.score - a.score).slice(0, 6)) {
    seen.add(r.text.toLowerCase());
    blocks.push({ kind: "fact", text: r.text, label: r.p.label, pageId: r.p.id });
  }

  // 3) Speaker notes that mention it (the anchor's own notes are already in the notes).
  for (const p of pages) {
    if (p.id === anchor.id) continue;
    for (const s of splitSentences(notes(p))) if (overlap(keywordSet(s), focus) >= 1 && !seen.has(s.toLowerCase())) blocks.push({ kind: "note", text: s, label: p.label, pageId: p.id });
  }

  return { pageId: anchor.id, blocks };
}
