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
      pages.push({ id: p.id, materialId: m.id, materialTitle: m.title, label: p.label, title: p.title, text: p.text, topicId: p.topicId });
    }
  }
  return { pages, topics };
}
