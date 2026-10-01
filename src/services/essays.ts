/**
 * Essay practice (Pro): sets of essay questions and plans on one lecture or several
 * (e.g. a whole module folder). Kept with the rest of the student's data.
 */
import { nowISO, uid } from "@/lib/utils";
import { getState, setState } from "@/store/store";
import type { EssayQuestion, EssaySet, ID } from "@/types/models";

export const essaySets = () => getState().essays ?? [];
export const getSet = (id: ID) => essaySets().find((s) => s.id === id);

const sameIds = (a: ID[], b: ID[]) => a.length === b.length && a.every((x) => b.includes(x));

/** Moves essays saved on a lecture (the first version) into essay sets. */
export function migrateMaterialEssays() {
  const s0 = getState();
  if (!s0.materials.some((m) => m.essays?.questions.length || m.essays?.rubric)) return;
  setState((s) => {
    const sets = [...(s.essays ?? [])];
    const materials = s.materials.map((m) => {
      if (!m.essays) return m;
      const { essays, ...rest } = m;
      if ((essays.questions.length || essays.rubric) && !sets.some((x) => sameIds(x.materialIds, [m.id]))) sets.push({ id: uid("es"), title: m.title, materialIds: [m.id], createdAt: nowISO(), ...essays });
      return rest;
    });
    return { ...s, materials, essays: sets };
  });
}

export function createSet(title: string, materialIds: ID[], folderId?: ID): ID {
  const id = uid("es");
  setState((s) => ({ ...s, essays: [{ id, title, materialIds, folderId, createdAt: nowISO(), questions: [], level: lastLevel() }, ...(s.essays ?? [])] }));
  return id;
}

/** The set for exactly these lectures, made if there isn't one yet. */
export function setFor(materialIds: ID[], title: string, folderId?: ID): ID {
  return essaySets().find((x) => sameIds(x.materialIds, materialIds))?.id ?? createSet(title, materialIds, folderId);
}

/** The most recently used level, so new sets start with it. */
function lastLevel() {
  return essaySets().find((x) => x.level)?.level;
}

export function patchSet(id: ID, patch: Partial<EssaySet>) {
  setState((s) => ({ ...s, essays: (s.essays ?? []).map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
}

export function patchQuestion(id: ID, qid: ID, patch: Partial<EssayQuestion>) {
  const set = getSet(id);
  if (set) patchSet(id, { questions: set.questions.map((q) => (q.id === qid ? { ...q, ...patch } : q)) });
}

export function deleteSet(id: ID): () => void {
  const before = essaySets();
  setState((s) => ({ ...s, essays: (s.essays ?? []).filter((x) => x.id !== id) }));
  return () => setState((s) => ({ ...s, essays: before }));
}

/** Lectures that still exist, in the set's order. */
export function setMaterials(set: EssaySet) {
  const mats = getState().materials;
  return set.materialIds.map((id) => mats.find((m) => m.id === id)).filter((m): m is NonNullable<typeof m> => !!m);
}
