import type { AppData } from "@/services/db/types";
import type { ID, Material, Question } from "@/types/models";

export const materialById = (d: AppData, id?: ID | null) => d.materials.find((m) => m.id === id);

export const topicName = (d: AppData, materialId: ID, topicId: ID | null) =>
  d.materials.find((m) => m.id === materialId)?.topics.find((t) => t.id === topicId)?.name ?? "General";

export const topicNameFn = (d: AppData) => (id: ID | null, materialId: ID) => topicName(d, materialId, id);

export const isSaved = (d: AppData, qid: ID) => d.saved.some((s) => s.questionId === qid);

export function materialCounts(d: AppData, m: Material) {
  return {
    pages: m.pages.length,
    included: m.pages.filter((p) => p.included).length,
    questions: d.questions.filter((q) => q.materialId === m.id).length,
    flashcards: d.flashcards.filter((c) => c.materialId === m.id).length,
  };
}

export const unitWord = (m: Pick<Material, "unit">, n = 2) => {
  const w = m.unit === "slides" ? "slide" : m.unit === "pages" ? "page" : "section";
  return n === 1 ? w : w + "s";
};

export const materialLabel = (m: Material) => `${m.subject} · ${m.title}`;

export function questionsFor(d: AppData, materialIds: ID[]) {
  return d.questions.filter((q) => materialIds.includes(q.materialId));
}

export function inProgressAttempts(d: AppData) {
  return d.attempts.filter((a) => a.status === "in-progress").sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export function recentMaterials(d: AppData, n = 4) {
  return [...d.materials]
    .sort((a, b) => (b.lastOpenedAt ?? b.lastStudiedAt ?? b.createdAt).localeCompare(a.lastOpenedAt ?? a.lastStudiedAt ?? a.createdAt))
    .slice(0, n);
}

export function questionSource(q: Question) {
  return q.sources.map((s) => s.label).join(", ");
}
