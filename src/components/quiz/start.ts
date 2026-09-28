import { toast } from "@/components/ui/toast";
import { navigate } from "@/lib/router";
import { pickStudyQuestions } from "@/services/study/analytics";
import { actions } from "@/store/actions";
import { getState } from "@/store/store";
import type { ID, QuizAttempt, QuizMode } from "@/types/models";

export function startQuiz(opts: { title: string; questionIds: ID[]; mode?: QuizMode; timeLimitSec?: number | null; origin?: QuizAttempt["origin"] }) {
  const d = getState();
  if (!opts.questionIds.length) {
    toast.info("No questions yet", { description: "Generate your first questions from your study material." });
    navigate("/materials");
    return null;
  }
  const materialIds = [...new Set(opts.questionIds.map((id) => d.questions.find((q) => q.id === id)?.materialId).filter(Boolean) as ID[])];
  const id = actions.createAttempt({ title: opts.title, questionIds: opts.questionIds, materialIds, mode: opts.mode ?? "practice", timeLimitSec: opts.timeLimitSec ?? null, origin: opts.origin });
  navigate(`/quiz/${id}`);
  return id;
}

/** One-click study: 10 questions weighted towards weak topics and mistakes. */
export function startQuickStudy(materialIds?: ID[]) {
  const d = getState();
  const ids = pickStudyQuestions(d, { count: 10, materialIds, focus: "mixed" });
  const title = materialIds?.length === 1 ? `${d.materials.find((m) => m.id === materialIds[0])?.title} quick study` : "Quick study";
  return startQuiz({ title, questionIds: ids, origin: "quick" });
}

export function startWeakAreas(materialIds?: ID[], topicIds?: ID[]) {
  const d = getState();
  const ids = pickStudyQuestions(d, { count: 10, materialIds, topicIds, focus: "weak" });
  return startQuiz({ title: "Weak areas review", questionIds: ids, origin: "weak" });
}
