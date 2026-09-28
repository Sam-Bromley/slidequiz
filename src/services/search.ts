/** Find words in the notes of every material. */
import { stripCitations } from "@/services/notes";
import type { ID, Material } from "@/types/models";

export interface SearchHit {
  materialId: ID;
  materialTitle: string;
  pageId: ID;
  pageTitle: string;
  /** The matching line, trimmed around the match. */
  snippet: string;
}

const norm = (s: string) => s.toLowerCase();

export function searchNotes(materials: Material[], query: string, limit = 60): SearchHit[] {
  const terms = norm(query).split(/\s+/).filter((t) => t.length > 1);
  if (!terms.length) return [];
  const hits: SearchHit[] = [];
  for (const m of materials)
    for (const p of m.pages) {
      if (!p.included) continue;
      const lines = [p.title, ...stripCitations(p.text).split(/\n+/)].map((l) => l.replace(/^[•\-–*]\s*/, "").trim()).filter(Boolean);
      const seen = new Set<string>();
      for (const line of lines) {
        const l = norm(line);
        if (!terms.every((t) => l.includes(t)) || seen.has(l)) continue;
        seen.add(l);
        hits.push({ materialId: m.id, materialTitle: m.title, pageId: p.id, pageTitle: p.title, snippet: trimAround(line, terms[0]) });
        if (hits.length >= limit) return hits;
      }
    }
  return hits;
}

function trimAround(line: string, term: string, max = 160) {
  if (line.length <= max) return line;
  const at = norm(line).indexOf(term);
  const start = Math.max(0, Math.min(at - 50, line.length - max));
  return (start > 0 ? "…" : "") + line.slice(start, start + max).trim() + (start + max < line.length ? "…" : "");
}

/** Split text into plain and matching parts, for highlighting. */
export function highlightParts(text: string, query: string): { text: string; hit: boolean }[] {
  const terms = norm(query).split(/\s+/).filter((t) => t.length > 1).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!terms.length) return [{ text, hit: false }];
  const re = new RegExp(`(${terms.join("|")})`, "gi");
  return text.split(re).filter(Boolean).map((part) => ({ text: part, hit: terms.some((t) => new RegExp(`^${t}$`, "i").test(part)) }));
}
