/**
 * Flashcards made from materials. Only facts with a single short answer become cards:
 * a definition asks for the term ("The green pigment that absorbs light energy" → Chlorophyll),
 * and a fill-the-gap card is kept only when the missing word is a real key term or a figure.
 */
import { getAI } from "@/services/ai";
import { groundingFor } from "@/services/grounding";
import { cloudFlashcards } from "@/services/ai/cloud";
import type { ID, Material } from "@/types/models";

export interface CardDraft {
  front: string;
  back: string;
  materialId: ID;
  topicId: ID | null;
  source?: { pageId: ID; label: string };
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export async function cardsFor(m: Material, topicIds: ID[] = []): Promise<CardDraft[]> {
  // Logged in: the AI writes the cards. Otherwise (or if it can't), the built-in rules do.
  const ai = await cloudFlashcards(m, topicIds);
  if (ai) {
    const seen = new Set<string>();
    return ai.flatMap((c) => {
      const k = c.back.trim().toLowerCase();
      if (seen.has(k)) return [];
      seen.add(k);
      const page = m.pages.find((p) => p.id === c.pageId);
      return [{ materialId: m.id, topicId: page?.topicId ?? null, source: page ? { pageId: page.id, label: page.label } : undefined, front: c.front.trim(), back: c.back.trim() }];
    });
  }
  const { pages, topics } = groundingFor([m], topicIds.length ? { topicIds } : {});
  const all = groundingFor([m]).pages.map((p) => p.title + "\n" + p.text).join("\n");
  const count = (t: string) => (all.match(new RegExp(`(?<![\\w-])${esc(t)}(?![\\w-])`, "gi")) ?? []).length;
  const qs = await getAI().mcqSet(pages, topics, m.subject);
  const out: CardDraft[] = [];
  const answers = new Set<string>();
  const add = (c: CardDraft) => {
    const key = c.back.toLowerCase().replace(/(es|s)$/, "");
    if (answers.has(key)) return;
    answers.add(key);
    out.push(c);
  };
  // Definitions first: they make the best "what is it called?" cards.
  for (const q of qs) {
    const def = q.prompt.match(/^What is meant by “?(.+?)”?\?$/);
    if (!def) continue;
    const term = def[1].trim();
    if (term.split(/\s+/).length > 4) continue;
    add({ materialId: m.id, topicId: q.topicId, source: q.sources[0], front: q.answer.replace(/\.$/, ""), back: term[0].toUpperCase() + term.slice(1) });
  }
  for (const q of qs) {
    const gap = q.prompt.match(/^Complete the sentence:\s*(.+)$/s);
    if (!gap) continue;
    const a = q.answer.trim();
    const figure = /\d/.test(a);
    // Keep only single-thing answers that matter: a figure, or a term the slides use more than once.
    if (a.split(/\s+/).length > 4) continue;
    if (!figure && count(a) < 2) continue;
    add({ materialId: m.id, topicId: q.topicId, source: q.sources[0], front: gap[1], back: a });
  }
  return out;
}
