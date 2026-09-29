/** Small helpers shared by the notes and the AI code (kept separate to avoid import loops). */
import type { Material } from "@/types/models";

/** Changes whenever the included slides or their text change. */
export function aiKey(m: Material): string {
  let h = 0;
  for (const p of m.pages) {
    if (!p.included) continue;
    const s = `${p.id}:${p.text.length}:${p.title}`;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return String(h >>> 0);
}

/** True when the AI's notes match the slides as they are now. */
export const aiReady = (m: Material) => !!m.ai?.notes?.length && m.ai.key === aiKey(m) && m.ai.status !== "failed";
