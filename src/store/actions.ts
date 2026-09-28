import { emptyData } from "./defaults";
import { nowISO, uid } from "@/lib/utils";
import type { FlashcardDraft, QuestionDraft } from "@/services/ai/types";
import type { AppData } from "@/services/db/types";
import { newSrs, schedule } from "@/services/study/srs";
import type {
  Answer,
  ChatMessage,
  Flashcard,
  FlashcardRating,
  GenerationRecord,
  ID,
  Material,
  NoteExtra,
  Question,
  QuizAttempt,
  Settings,
  StudyPlan,
  StudySession,
  SummaryDoc,
  User,
} from "@/types/models";
import { getState, replaceState, setState } from "./store";

type Undo = () => void;

const XP = { correct: 10, partial: 4, card: 2, quiz: 25 };

function addXp(s: AppData, n: number): AppData {
  return { ...s, user: { ...s.user, xp: Math.max(0, s.user.xp + n) } };
}

export const actions = {
  /* ------------------------------------------------------------ materials */
  addMaterials(materials: Material[]) {
    setState((s) => ({ ...s, materials: [...materials, ...s.materials] }));
  },
  updateMaterial(id: ID, patch: Partial<Material>) {
    setState((s) => ({ ...s, materials: s.materials.map((m) => (m.id === id ? { ...m, ...patch, updatedAt: nowISO() } : m)) }));
  },
  touchMaterial(id: ID) {
    setState((s) => ({ ...s, materials: s.materials.map((m) => (m.id === id ? { ...m, lastOpenedAt: nowISO() } : m)) }));
  },
  setPagesIncluded(materialId: ID, pageIds: ID[] | "all", included: boolean) {
    setState((s) => ({
      ...s,
      materials: s.materials.map((m) =>
        m.id !== materialId ? m : { ...m, updatedAt: nowISO(), pages: m.pages.map((p) => (pageIds === "all" || pageIds.includes(p.id) ? { ...p, included } : p)) },
      ),
    }));
  },
  setPageText(materialId: ID, pageId: ID, text: string) {
    setState((s) => ({
      ...s,
      materials: s.materials.map((m) =>
        m.id !== materialId ? m : { ...m, pages: m.pages.map((p) => (p.id === pageId ? { ...p, text, needsText: !text.trim(), included: text.trim() ? true : p.included } : p)) },
      ),
    }));
  },
  deleteMaterial(id: ID): Undo {
    const s0 = getState();
    const material = s0.materials.find((m) => m.id === id);
    if (!material) return () => {};
    const idx = s0.materials.indexOf(material);
    const questions = s0.questions.filter((q) => q.materialId === id);
    const flashcards = s0.flashcards.filter((c) => c.materialId === id);
    const qids = new Set(questions.map((q) => q.id));
    const saved = s0.saved.filter((x) => qids.has(x.questionId));
    const summary = s0.summaries[id];
    const chat = s0.chats[id];
    setState((s) => {
      const summaries = { ...s.summaries };
      const chats = { ...s.chats };
      delete summaries[id];
      delete chats[id];
      return {
        ...s,
        materials: s.materials.filter((m) => m.id !== id),
        questions: s.questions.filter((q) => q.materialId !== id),
        flashcards: s.flashcards.filter((c) => c.materialId !== id),
        saved: s.saved.filter((x) => !qids.has(x.questionId)),
        summaries,
        chats,
      };
    });
    return () =>
      setState((s) => {
        const materials = [...s.materials];
        materials.splice(Math.min(idx, materials.length), 0, material);
        return {
          ...s,
          materials,
          questions: [...s.questions, ...questions],
          flashcards: [...s.flashcards, ...flashcards],
          saved: [...s.saved, ...saved],
          summaries: summary ? { ...s.summaries, [id]: summary } : s.summaries,
          chats: chat ? { ...s.chats, [id]: chat } : s.chats,
        };
      });
  },

  /* ------------------------------------------------------------ folders */
  createFolder(name: string, parentId: ID | null = null): ID {
    const id = uid("fld");
    setState((s) => ({ ...s, folders: [...s.folders, { id, name: name.trim() || "New folder", parentId, createdAt: nowISO() }] }));
    return id;
  },
  renameFolder(id: ID, name: string) {
    setState((s) => ({ ...s, folders: s.folders.map((f) => (f.id === id ? { ...f, name: name.trim() || f.name } : f)) }));
  },
  setFolderWidth(id: ID, width: number) {
    setState((s) => ({ ...s, folders: s.folders.map((f) => (f.id === id ? { ...f, width } : f)) }));
  },
  setFolderColor(id: ID, color: string | undefined) {
    setState((s) => ({ ...s, folders: s.folders.map((f) => (f.id === id ? { ...f, color } : f)) }));
  },
  /** Deletes a folder (and sub-folders); its materials move up to the parent folder. */
  deleteFolder(id: ID): Undo {
    const s0 = getState();
    const folder = s0.folders.find((f) => f.id === id);
    if (!folder) return () => {};
    const ids = new Set<ID>([id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const f of s0.folders) if (f.parentId && ids.has(f.parentId) && !ids.has(f.id)) (ids.add(f.id), (grew = true));
    }
    setState((s) => ({
      ...s,
      folders: s.folders.filter((f) => !ids.has(f.id)),
      materials: s.materials.map((m) => (m.folderId && ids.has(m.folderId) ? { ...m, folderId: folder.parentId } : m)),
    }));
    return () => replaceState({ ...getState(), folders: s0.folders, materials: getState().materials.map((m) => ({ ...m, folderId: s0.materials.find((x) => x.id === m.id)?.folderId ?? m.folderId })) });
  },
  moveMaterial(materialId: ID, folderId: ID | null) {
    setState((s) => ({ ...s, materials: s.materials.map((m) => (m.id === materialId ? { ...m, folderId } : m)) }));
  },

  /* ------------------------------------------------------------ generation */
  recordGeneration(rec: Omit<GenerationRecord, "id" | "createdAt" | "questionIds" | "flashcardIds">, questions: QuestionDraft[], cards: FlashcardDraft[], summaries: Omit<SummaryDoc, "generatedAt">[]) {
    const id = uid("gen");
    const now = nowISO();
    const qs: Question[] = questions.map((q) => ({ ...q, id: uid("q"), createdAt: now, stats: { attempts: 0, correct: 0 }, generationId: id }));
    const fcs: Flashcard[] = cards.map((c) => ({ ...c, id: uid("fc"), bookmarked: false, srs: newSrs(), createdAt: now }));
    setState((s) => {
      const sums = { ...s.summaries };
      summaries.forEach((x) => (sums[x.materialId] = { ...x, generatedAt: now }));
      return {
        ...s,
        questions: [...qs, ...s.questions],
        flashcards: [...fcs, ...s.flashcards],
        summaries: sums,
        generations: [{ ...rec, id, createdAt: now, questionIds: qs.map((q) => q.id), flashcardIds: fcs.map((c) => c.id) }, ...s.generations],
      };
    });
    return { id, questionIds: qs.map((q) => q.id), flashcardIds: fcs.map((c) => c.id) };
  },

  /* ------------------------------------------------------------ practice (coverage MCQs) */
  /** Replace a material's practice questions, keeping progress on any question that is unchanged. */
  setPracticeQuestions(materialId: ID, drafts: QuestionDraft[]) {
    const now = nowISO();
    setState((s) => {
      const old = s.questions.filter((q) => q.materialId === materialId && q.pool);
      const key = (q: { prompt: string; answer: string }) => `${q.prompt}|${q.answer}`;
      const oldBy = new Map(old.map((q) => [key(q), q]));
      const next: Question[] = drafts.map((d) => {
        const prev = oldBy.get(key(d));
        return prev ? { ...prev, ...d, id: prev.id, stats: prev.stats, createdAt: prev.createdAt } : { ...d, id: uid("q"), createdAt: now, stats: { attempts: 0, correct: 0 } };
      });
      return { ...s, questions: [...next, ...s.questions.filter((q) => !(q.materialId === materialId && q.pool))] };
    });
  },
  answerPractice(questionId: ID, correct: boolean) {
    const now = nowISO();
    setState((s) => {
      const q = s.questions.find((x) => x.id === questionId);
      if (!q) return s;
      const next = {
        ...s,
        questions: s.questions.map((x) =>
          x.id !== questionId ? x : { ...x, stats: { ...x.stats, attempts: x.stats.attempts + 1, correct: x.stats.correct + (correct ? 1 : 0), lastResult: correct ? ("correct" as const) : ("incorrect" as const), lastAnsweredAt: now } },
        ),
        materials: s.materials.map((m) => (m.id === q.materialId ? { ...m, lastStudiedAt: now } : m)),
      };
      return addXp(next, correct ? XP.correct : 1);
    });
  },
  resetPractice(materialId: ID): Undo {
    const before = getState().questions.filter((q) => q.materialId === materialId && q.pool);
    setState((s) => ({ ...s, questions: s.questions.map((q) => (q.materialId === materialId && q.pool ? { ...q, stats: { attempts: 0, correct: 0 } } : q)) }));
    return () => setState((s) => ({ ...s, questions: s.questions.map((q) => before.find((b) => b.id === q.id) ?? q) }));
  },

  /* ------------------------------------------------------------ notes */
  addNoteExtra(materialId: ID, extra: Omit<NoteExtra, "id" | "createdAt">): ID {
    const id = uid("nx");
    setState((s) => ({ ...s, materials: s.materials.map((m) => (m.id === materialId ? { ...m, noteExtras: [...(m.noteExtras ?? []), { ...extra, id, createdAt: nowISO() }] } : m)) }));
    return id;
  },
  removeNoteExtra(materialId: ID, id: ID) {
    setState((s) => ({ ...s, materials: s.materials.map((m) => (m.id === materialId ? { ...m, noteExtras: (m.noteExtras ?? []).filter((x) => x.id !== id) } : m)) }));
  },

  /* ------------------------------------------------------------ questions */
  replaceQuestion(id: ID, draft: QuestionDraft) {
    setState((s) => ({
      ...s,
      questions: s.questions.map((q) => (q.id === id ? { ...draft, id, createdAt: nowISO(), stats: { attempts: 0, correct: 0 }, generationId: q.generationId } : q)),
    }));
  },
  deleteQuestion(id: ID): Undo {
    const s0 = getState();
    const q = s0.questions.find((x) => x.id === id);
    if (!q) return () => {};
    const idx = s0.questions.indexOf(q);
    const saved = s0.saved.find((x) => x.questionId === id);
    setState((s) => ({ ...s, questions: s.questions.filter((x) => x.id !== id), saved: s.saved.filter((x) => x.questionId !== id) }));
    return () =>
      setState((s) => {
        const questions = [...s.questions];
        questions.splice(idx, 0, q);
        return { ...s, questions, saved: saved ? [...s.saved, saved] : s.saved };
      });
  },
  toggleBookmark(id: ID) {
    setState((s) => ({
      ...s,
      saved: s.saved.some((x) => x.questionId === id) ? s.saved.filter((x) => x.questionId !== id) : [{ questionId: id, savedAt: nowISO() }, ...s.saved],
    }));
  },
  /** Record a standalone answer (outside a quiz) — updates stats and XP. */
  recordAnswer(a: Answer) {
    setState((s) => {
      const q = s.questions.find((x) => x.id === a.questionId);
      if (!q) return s;
      const next = applyAnswerToStats(s, a);
      return addXp(next, a.score >= 0.85 ? XP.correct : a.score >= 0.3 ? XP.partial : 1);
    });
  },

  /* ------------------------------------------------------------ flashcards */
  rateCard(id: ID, rating: FlashcardRating) {
    setState((s) => addXp({ ...s, flashcards: s.flashcards.map((c) => (c.id === id ? { ...c, srs: schedule(c.srs, rating) } : c)) }, XP.card));
  },
  toggleCardBookmark(id: ID) {
    setState((s) => ({ ...s, flashcards: s.flashcards.map((c) => (c.id === id ? { ...c, bookmarked: !c.bookmarked } : c)) }));
  },
  deleteCard(id: ID): Undo {
    const s0 = getState();
    const c = s0.flashcards.find((x) => x.id === id);
    if (!c) return () => {};
    const idx = s0.flashcards.indexOf(c);
    setState((s) => ({ ...s, flashcards: s.flashcards.filter((x) => x.id !== id) }));
    return () =>
      setState((s) => {
        const flashcards = [...s.flashcards];
        flashcards.splice(idx, 0, c);
        return { ...s, flashcards };
      });
  },
  resetCard(id: ID) {
    setState((s) => ({ ...s, flashcards: s.flashcards.map((c) => (c.id === id ? { ...c, srs: newSrs() } : c)) }));
  },

  /* ------------------------------------------------------------ quizzes */
  createAttempt(a: Pick<QuizAttempt, "title" | "materialIds" | "questionIds" | "mode" | "timeLimitSec" | "origin">): ID {
    const id = uid("att");
    setState((s) => ({
      ...s,
      attempts: [{ ...a, id, startedAt: nowISO(), elapsedMs: 0, currentIndex: 0, answers: {}, flagged: [], status: "in-progress" }, ...s.attempts],
    }));
    return id;
  },
  updateAttempt(id: ID, patch: Partial<QuizAttempt>) {
    setState((s) => ({ ...s, attempts: s.attempts.map((a) => (a.id === id ? { ...a, ...patch } : a)) }));
  },
  saveAttemptAnswer(id: ID, answer: Answer) {
    setState((s) => ({ ...s, attempts: s.attempts.map((a) => (a.id === id ? { ...a, answers: { ...a.answers, [answer.questionId]: answer } } : a)) }));
  },
  finishAttempt(id: ID) {
    setState((s) => {
      const a = s.attempts.find((x) => x.id === id);
      if (!a || a.status === "completed") return s;
      let next: AppData = { ...s, attempts: s.attempts.map((x) => (x.id === id ? { ...x, status: "completed" as const, finishedAt: nowISO() } : x)) };
      let xp = XP.quiz;
      for (const ans of Object.values(a.answers)) {
        if (!ans.response || ans.skipped) continue;
        next = applyAnswerToStats(next, ans);
        xp += ans.score >= 0.85 ? XP.correct : ans.score >= 0.3 ? XP.partial : 0;
      }
      const session: StudySession = { id: uid("ses"), kind: "quiz", materialIds: a.materialIds, startedAt: a.startedAt, durationMs: a.elapsedMs, items: Object.keys(a.answers).length };
      next = {
        ...next,
        sessions: [session, ...next.sessions],
        materials: next.materials.map((m) => (a.materialIds.includes(m.id) ? { ...m, lastStudiedAt: nowISO() } : m)),
      };
      return addXp(next, xp);
    });
  },
  deleteAttempt(id: ID): Undo {
    const s0 = getState();
    const a = s0.attempts.find((x) => x.id === id);
    if (!a) return () => {};
    setState((s) => ({ ...s, attempts: s.attempts.filter((x) => x.id !== id) }));
    return () => setState((s) => ({ ...s, attempts: [a, ...s.attempts].sort((x, y) => y.startedAt.localeCompare(x.startedAt)) }));
  },

  /* ------------------------------------------------------------ sessions, drafts, chat, summaries */
  addSession(session: Omit<StudySession, "id">) {
    if (session.durationMs < 5000) return;
    setState((s) => ({
      ...s,
      sessions: [{ ...session, id: uid("ses") }, ...s.sessions],
      materials: s.materials.map((m) => (session.materialIds.includes(m.id) ? { ...m, lastStudiedAt: nowISO() } : m)),
    }));
  },
  saveDraft(questionId: ID, text: string) {
    setState((s) => ({ ...s, drafts: { ...s.drafts, [questionId]: { text, savedAt: nowISO() } } }));
  },
  clearDraft(questionId: ID) {
    setState((s) => {
      if (!s.drafts[questionId]) return s;
      const drafts = { ...s.drafts };
      delete drafts[questionId];
      return { ...s, drafts };
    });
  },
  appendChat(materialId: ID, ...msgs: ChatMessage[]) {
    setState((s) => ({ ...s, chats: { ...s.chats, [materialId]: [...(s.chats[materialId] ?? []), ...msgs] } }));
  },
  clearChat(materialId: ID) {
    setState((s) => ({ ...s, chats: { ...s.chats, [materialId]: [] } }));
  },
  setSummary(sum: Omit<SummaryDoc, "generatedAt">) {
    setState((s) => ({ ...s, summaries: { ...s.summaries, [sum.materialId]: { ...sum, generatedAt: nowISO() } } }));
  },

  /* ------------------------------------------------------------ plans */
  addPlan(p: StudyPlan) {
    setState((s) => ({ ...s, plans: [p, ...s.plans.filter((x) => x.subject !== p.subject)] }));
  },
  toggleTask(planId: ID, taskId: ID) {
    setState((s) => ({
      ...s,
      plans: s.plans.map((p) => (p.id !== planId ? p : { ...p, days: p.days.map((d) => ({ ...d, tasks: d.tasks.map((t) => (t.id === taskId ? { ...t, done: !t.done } : t)) })) })),
    }));
  },
  deletePlan(id: ID): Undo {
    const p = getState().plans.find((x) => x.id === id);
    setState((s) => ({ ...s, plans: s.plans.filter((x) => x.id !== id) }));
    return () => p && setState((s) => ({ ...s, plans: [p, ...s.plans] }));
  },

  /* ------------------------------------------------------------ settings & data */
  updateSettings(patch: Partial<Settings>) {
    setState((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
  },
  updateUser(patch: Partial<User>) {
    setState((s) => ({ ...s, user: { ...s.user, ...patch } }));
  },
  setOnboarded() {
    setState((s) => ({ ...s, onboarded: true }));
  },
  setLastVisit(path: string, label: string) {
    setState((s) => (s.lastVisit?.path === path ? s : { ...s, lastVisit: { path, label, at: nowISO() } }));
  },
  deleteAllMaterials(): Undo {
    const s0 = getState();
    setState((s) => ({ ...s, materials: [], questions: [], flashcards: [], saved: [], summaries: {}, chats: {}, drafts: {}, generations: [], plans: [], folders: [] }));
    return () => replaceState({ ...getState(), materials: s0.materials, questions: s0.questions, flashcards: s0.flashcards, saved: s0.saved, summaries: s0.summaries, chats: s0.chats, drafts: s0.drafts, generations: s0.generations, plans: s0.plans, folders: s0.folders });
  },
  deleteHistory(): Undo {
    const s0 = getState();
    setState((s) => ({
      ...s,
      attempts: [],
      sessions: [],
      questions: s.questions.map((q) => ({ ...q, stats: { attempts: 0, correct: 0 } })),
      flashcards: s.flashcards.map((c) => ({ ...c, srs: newSrs() })),
      plans: s.plans.map((p) => ({ ...p, days: p.days.map((d) => ({ ...d, tasks: d.tasks.map((t) => ({ ...t, done: false })) })) })),
      user: { ...s.user, xp: 0 },
    }));
    return () => replaceState({ ...getState(), attempts: s0.attempts, sessions: s0.sessions, questions: s0.questions, flashcards: s0.flashcards, plans: s0.plans, user: s0.user });
  },
  deleteEverything() {
    replaceState({ ...emptyData(getState().settings.theme), onboarded: true });
  },
};

function applyAnswerToStats(s: AppData, a: Answer): AppData {
  return {
    ...s,
    questions: s.questions.map((q) => {
      if (q.id !== a.questionId) return q;
      const result = a.score >= 0.85 ? "correct" : a.score >= 0.3 ? "partial" : "incorrect";
      return {
        ...q,
        stats: {
          attempts: q.stats.attempts + 1,
          correct: q.stats.correct + (result === "correct" ? 1 : 0),
          lastResult: result,
          lastScore: a.score,
          lastAnsweredAt: a.answeredAt,
        },
      };
    }),
  };
}
