/**
 * Essays: each essay is one question the student plans and writes in small boxes
 * (introduction, body points, conclusion, references). Kept with the rest of the student's data.
 */
import { nowISO, uid } from "@/lib/utils";
import { getState, setState } from "@/store/store";
import type { EssayConclusion, EssayDraft, EssayIntro, EssayLevel, EssayPoint, ID } from "@/types/models";

export const essays = () => getState().essayDrafts ?? [];
export const getEssay = (id: ID) => essays().find((e) => e.id === id);

export const emptyIntro = (): EssayIntro => ({ context: "", terms: "", problem: "", scope: "", thesis: "", text: "" });
export const emptyPoint = (): EssayPoint => ({ id: uid("pt"), topic: "", evidence: "", explain: "", link: "", text: "" });
export const emptyConclusion = (): EssayConclusion => ({ restate: "", findings: "", implications: "", final: "", future: "", text: "" });

/** The level last used, so a new essay starts with it. */
const lastLevel = (): EssayLevel | undefined => essays().find((e) => e.level)?.level;

export function createEssay(materialIds: ID[], question = ""): ID {
  const id = uid("ed");
  const at = nowISO();
  const e: EssayDraft = {
    id,
    question,
    materialIds,
    level: lastLevel(),
    mode: "guided",
    intro: emptyIntro(),
    points: [emptyPoint(), emptyPoint(), emptyPoint()],
    conclusion: emptyConclusion(),
    references: [{ id: uid("ref"), text: "" }],
    createdAt: at,
    updatedAt: at,
  };
  setState((s) => ({ ...s, essayDrafts: [e, ...(s.essayDrafts ?? [])] }));
  return id;
}

export function patchEssay(id: ID, patch: Partial<EssayDraft> | ((e: EssayDraft) => Partial<EssayDraft>)) {
  setState((s) => ({
    ...s,
    essayDrafts: (s.essayDrafts ?? []).map((e) => (e.id === id ? { ...e, ...(typeof patch === "function" ? patch(e) : patch), updatedAt: nowISO() } : e)),
  }));
}

export function deleteEssay(id: ID): () => void {
  const before = essays();
  setState((s) => ({ ...s, essayDrafts: (s.essayDrafts ?? []).filter((e) => e.id !== id) }));
  return () => setState((s) => ({ ...s, essayDrafts: before }));
}

/** Lectures that still exist, in the essay's order. */
export function essayMaterials(e: EssayDraft) {
  const mats = getState().materials;
  return e.materialIds.map((id) => mats.find((m) => m.id === id)).filter((m): m is NonNullable<typeof m> => !!m);
}

/* ---------------------------------------------------------------- reading the writing */

export const INTRO_KEYS = ["context", "terms", "problem", "scope", "thesis"] as const;
export const POINT_KEYS = ["topic", "evidence", "explain", "link"] as const;
export const CONCLUSION_KEYS = ["restate", "findings", "implications", "future", "final"] as const;

const join = (parts: string[]) => parts.map((p) => p.trim()).filter(Boolean).join(" ");

/** Each section as one paragraph, whichever way it was written. */
export const introText = (e: EssayDraft) => (e.mode === "simple" ? e.intro.text.trim() : join(INTRO_KEYS.map((k) => e.intro[k])));
export const pointText = (e: EssayDraft, p: EssayPoint) => (e.mode === "simple" ? p.text.trim() : join(POINT_KEYS.map((k) => p[k])));
export const conclusionText = (e: EssayDraft) => (e.mode === "simple" ? e.conclusion.text.trim() : join(CONCLUSION_KEYS.map((k) => e.conclusion[k])));

export const wordCount = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0);

export function essayWords(e: EssayDraft) {
  const intro = wordCount(introText(e));
  const points = e.points.map((p) => wordCount(pointText(e, p)));
  const conclusion = wordCount(conclusionText(e));
  return { intro, points, body: points.reduce((a, b) => a + b, 0), conclusion, total: intro + points.reduce((a, b) => a + b, 0) + conclusion };
}

/** The whole essay as plain text (for the preview and copying). */
export function essayPlainText(e: EssayDraft) {
  const refs = e.references.map((r) => r.text.trim()).filter(Boolean);
  return [e.question.trim(), introText(e), ...e.points.map((p) => pointText(e, p)), conclusionText(e), refs.length ? `References\n${refs.join("\n")}` : ""].filter(Boolean).join("\n\n");
}

/** Switch between small boxes and one box per section without losing anything. */
export function switchMode(e: EssayDraft, mode: EssayDraft["mode"]): Partial<EssayDraft> {
  if (mode === e.mode) return {};
  if (mode === "simple")
    return {
      mode,
      intro: { ...e.intro, text: e.intro.text.trim() || join(INTRO_KEYS.map((k) => e.intro[k])) },
      points: e.points.map((p) => ({ ...p, text: p.text.trim() || join(POINT_KEYS.map((k) => p[k])) })),
      conclusion: { ...e.conclusion, text: e.conclusion.text.trim() || join(CONCLUSION_KEYS.map((k) => e.conclusion[k])) },
    };
  // Back to small boxes: a section written in one box goes into its first box if the small boxes are empty.
  const empty = (o: object, keys: readonly string[]) => keys.every((k) => !String((o as Record<string, unknown>)[k] ?? "").trim());
  return {
    mode,
    intro: empty(e.intro, INTRO_KEYS) && e.intro.text.trim() ? { ...e.intro, context: e.intro.text } : e.intro,
    points: e.points.map((p) => (empty(p, POINT_KEYS) && p.text.trim() ? { ...p, topic: p.text } : p)),
    conclusion: empty(e.conclusion, CONCLUSION_KEYS) && e.conclusion.text.trim() ? { ...e.conclusion, restate: e.conclusion.text } : e.conclusion,
  };
}

/* ---------------------------------------------------------------- the first version */

/** Turns essay questions and plans from the earlier version into essays (once). */
export function migrateOldEssays() {
  const s0 = getState();
  const oldOnMaterials = s0.materials.some((m) => m.essays?.questions.length);
  if (!s0.essays?.length && !oldOnMaterials) return;
  setState((s) => {
    const drafts = [...(s.essayDrafts ?? [])];
    const sets = [...(s.essays ?? []), ...s.materials.filter((m) => m.essays?.questions.length).map((m) => ({ ...m.essays!, materialIds: [m.id] }))];
    for (const set of sets)
      for (const q of set.questions.filter((x) => x.saved || x.plan)) {
        const at = nowISO();
        const plan = q.plan;
        drafts.push({
          id: uid("ed"),
          question: q.question,
          materialIds: set.materialIds,
          level: set.level,
          words: set.words,
          rubric: set.rubric,
          mode: "guided",
          intro: { ...emptyIntro(), context: plan?.intro ?? "", thesis: plan?.thesis ?? "" },
          points: plan?.paragraphs.length
            ? plan.paragraphs.map((p) => ({ ...emptyPoint(), topic: p.point, evidence: p.evidence.map((x) => x.text).join(" "), explain: p.analysis }))
            : [emptyPoint(), emptyPoint(), emptyPoint()],
          conclusion: { ...emptyConclusion(), final: plan?.conclusion ?? "" },
          references: [{ id: uid("ref"), text: "" }],
          createdAt: q.at || at,
          updatedAt: at,
        });
      }
    return { ...s, essayDrafts: drafts, essays: [], materials: s.materials.map(({ essays: _e, ...m }) => m) };
  });
}
