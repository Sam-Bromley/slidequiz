import { keywordSet, stripTrailingPunct, truncate } from "@/lib/text";
import type { ID, SummaryDoc } from "@/types/models";
import type { GroundingPage, GroundingTopic } from "../types";
import { buildKnowledge, refOf, type Fact } from "./knowledge";

const COUNTS = { brief: { notes: 2, detail: 3, facts: 5 }, standard: { notes: 3, detail: 5, facts: 8 }, detailed: { notes: 5, detail: 8, facts: 12 } };

function distinct(facts: Fact[], n: number) {
  const out: Fact[] = [];
  for (const f of facts) {
    if (out.length >= n) break;
    const kw = keywordSet(f.text);
    if (out.some((o) => [...keywordSet(o.text)].filter((w) => kw.has(w)).length >= 4)) continue;
    out.push(f);
  }
  return out;
}

/** Extractive summariser: every line is lifted from the student's own material. */
export function summarize(materialId: ID, pages: GroundingPage[], topics: GroundingTopic[], detail: SummaryDoc["detail"]): Omit<SummaryDoc, "generatedAt"> {
  const k = buildKnowledge(pages);
  const c = COUNTS[detail];
  const topicList = topics.filter((t) => pages.some((p) => p.topicId === t.id));
  const groups = topicList.length ? topicList.map((t) => ({ t, facts: k.facts.filter((f) => f.topicId === t.id) })) : [{ t: { id: "all", name: "Key ideas", materialId }, facts: k.facts }];

  const leadFacts = distinct(
    groups.map((g) => g.facts[0]).filter(Boolean).sort((a, b) => b.score - a.score),
    detail === "brief" ? 2 : 3,
  );
  const names = topicList.map((t) => t.name);
  const tldr = [
    names.length ? `This material covers ${names.length > 1 ? names.slice(0, -1).join(", ") + " and " + names[names.length - 1] : names[0]}.` : "",
    ...leadFacts.map((f) => stripTrailingPunct(f.text) + "."),
  ]
    .filter(Boolean)
    .join(" ");

  const revisionNotes = groups
    .map((g) => {
      const pts = distinct(g.facts, c.notes);
      return { heading: g.t.name, points: pts.map((f) => truncate(f.text, 180)), sources: [...new Map(pts.map((f) => [f.page.id, refOf(f.page)])).values()] };
    })
    .filter((n) => n.points.length);

  const detailed = groups
    .map((g) => {
      const pts = distinct(
        g.facts.slice().sort((a, b) => a.page.id.localeCompare(b.page.id) || 0),
        c.detail,
      );
      // Keep original reading order within the topic.
      const ordered = pts.sort((a, b) => pages.indexOf(a.page) - pages.indexOf(b.page));
      return { heading: g.t.name, body: ordered.map((f) => stripTrailingPunct(f.text) + ".").join(" "), sources: [...new Map(ordered.map((f) => [f.page.id, refOf(f.page)])).values()] };
    })
    .filter((d) => d.body);

  const definitions = k.concepts.map((x) => ({ term: x.term, definition: stripTrailingPunct(x.definition), source: refOf(x.page) }));
  const keyConcepts = k.concepts.slice(0, detail === "brief" ? 6 : detail === "standard" ? 10 : 16).map((x) => ({ term: x.term, note: truncate(stripTrailingPunct(x.definition.split(/[;,]/)[0]), 90) }));
  const facts = distinct(k.facts.filter((f) => f.hasNumber), c.facts).map((f) => ({ text: f.text, source: refOf(f.page) }));
  const remember = distinct(
    [...k.facts.filter((f) => f.isImportant), ...groups.map((g) => g.facts[0]).filter(Boolean)],
    detail === "brief" ? 4 : detail === "standard" ? 6 : 8,
  ).map((f) => truncate(f.text, 170));

  return { materialId, detail, tldr, revisionNotes, detailed, keyConcepts, definitions, facts, remember };
}
