import { stripReferences } from "@/lib/references";
import type { Material } from "@/types/models";
import type { GroundingPage, GroundingTopic } from "./ai/types";

/** Convert materials into the page/topic payload sent to the AI. Excluded pages are never sent. */
export function groundingFor(materials: Material[], opts: { includeExcluded?: boolean; topicIds?: string[] } = {}) {
  const pages: GroundingPage[] = [];
  const topics: GroundingTopic[] = [];
  for (const m of materials) {
    for (const t of m.topics) if (!opts.topicIds || opts.topicIds.includes(t.id)) topics.push({ id: t.id, name: t.name, materialId: m.id });
    for (const p of m.pages) {
      if (!opts.includeExcluded && !p.included) continue;
      if (opts.topicIds && (!p.topicId || !opts.topicIds.includes(p.topicId))) continue;
      if (!p.text.trim()) continue;
      // Materials saved before speaker notes were dropped may still contain them.
      // Reference-list entries are sources, not facts, so questions and flashcards skip them.
      const text = stripReferences(p.text.split(/\n\s*Speaker notes:\s*\n/i)[0])
        .split("\n")
        // Bullets and list numbering ("2)", "(b)", "iv.") aren't part of the content.
        .map((l) => l.replace(/^[\s•●○■□▪◦·➢➤►▶✓✔*>–—-]+/, "").replace(/^(?:\(?\d{1,2}[.)]|\(?[a-h][.)]|\(?(?:i{1,3}|iv|v|vi{0,3}|ix|x)[.)])\s+/i, ""))
        .join("\n");
      pages.push({ id: p.id, materialId: m.id, materialTitle: m.title, label: p.label, title: p.title, text, topicId: p.topicId });
    }
  }
  return { pages, topics };
}
