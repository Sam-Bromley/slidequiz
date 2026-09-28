/**
 * Flashcards made from materials: every definition becomes term → meaning, every fact
 * becomes a fill-the-gap card. Built from the same pass that makes the practice questions.
 */
import { getAI } from "@/services/ai";
import { groundingFor } from "@/services/grounding";
import type { ID, Material } from "@/types/models";

export interface CardDraft {
  front: string;
  back: string;
  materialId: ID;
  topicId: ID | null;
  source?: { pageId: ID; label: string };
}

export async function cardsFor(m: Material, topicIds: ID[] = []): Promise<CardDraft[]> {
  const { pages, topics } = groundingFor([m], topicIds.length ? { topicIds } : {});
  const qs = await getAI().mcqSet(pages, topics, m.subject);
  const out: CardDraft[] = [];
  for (const q of qs) {
    const base = { materialId: m.id, topicId: q.topicId, source: q.sources[0] };
    const def = q.prompt.match(/^What is meant by “?(.+?)”?\?$/);
    const gap = q.prompt.match(/^Complete the sentence:\s*(.+)$/s);
    if (def) out.push({ ...base, front: def[1], back: q.answer });
    else if (gap) out.push({ ...base, front: gap[1], back: q.answer });
    // "Which term matches…" repeats a definition card, so it's skipped.
  }
  return out;
}
