/** Small helpers shared by the notes and the AI code (kept separate to avoid import loops). */
import type { Material } from "@/types/models";

/** Anything with slides (and maybe AI results), e.g. a material or a draft of one. */
type HasSlides = { pages: Material["pages"]; ai?: Material["ai"] };

/** Changes whenever the included slides or their text change. */
export function aiKey(m: HasSlides): string {
  let h = 0;
  for (const p of m.pages) {
    if (!p.included) continue;
    const s = `${p.id}:${p.text.length}:${p.title}`;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return String(h >>> 0);
}

/** True when the AI's notes match the slides as they are now. */
export const aiReady = (m: HasSlides) => !!m.ai?.notes?.length && m.ai.key === aiKey(m);

/** True when the practice questions are the AI's, for the slides as they are now. */
export const aiQuestionsReady = (m: HasSlides) => !!m.ai?.questions && m.ai.key === aiKey(m);

/**
 * Only while the AI helper isn't set up at all: use the built-in notes and questions so the
 * site isn't empty. Once the AI is live this is never true, and everything comes from the AI.
 */
export const usesBuiltIn = (m: HasSlides) => m.ai?.status === "off";
