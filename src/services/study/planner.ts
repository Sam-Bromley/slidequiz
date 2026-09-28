/** Builds a realistic revision plan: learn each topic, then practise, then a mock exam. */
import { addDays, daysBetween, uid } from "@/lib/utils";
import type { AppData } from "@/services/db/types";
import type { ID, PlanDay, PlanTask, StudyPlan } from "@/types/models";
import { topicStats } from "./analytics";

export interface PlanInput {
  subject: string;
  examDate: string; // yyyy-mm-dd
  minutesPerDay: number;
  materialIds: ID[];
}

export class PlanError extends Error {}

export function generatePlan(input: PlanInput, data: AppData, today = new Date()): StudyPlan {
  const exam = new Date(input.examDate + "T09:00:00");
  const totalDays = daysBetween(today, exam);
  if (Number.isNaN(totalDays)) throw new PlanError("Choose a valid exam date.");
  if (totalDays < 1) throw new PlanError("Pick an exam date after today.");
  if (!input.materialIds.length) throw new PlanError("Choose at least one material to revise.");
  const days = Math.min(totalDays, 42);
  const perDay = Math.max(15, input.minutesPerDay);

  const order = { weak: 0, new: 1, review: 2, strong: 3 } as const;
  const topics = topicStats(data)
    .filter((t) => input.materialIds.includes(t.materialId))
    .sort((a, b) => order[a.status] - order[b.status] || (a.mastery ?? 0.5) - (b.mastery ?? 0.5));
  if (!topics.length) throw new PlanError("These materials don't have any topics yet.");

  const withCards = perDay >= 30;
  const main = withCards ? perDay - 10 : perDay;
  const mcqCount = Math.max(5, Math.min(25, Math.round(main / 1.5 / 5) * 5));
  const plan: PlanDay[] = [];
  const hasMock = days >= 3;
  const learnDays = hasMock ? days - 1 : days;

  for (let i = 0; i < days; i++) {
    const date = addDays(today, i);
    const tasks: PlanTask[] = [];
    if (hasMock && i === days - 1) {
      tasks.push({ id: uid("task"), kind: "mock", label: `Timed practice exam: all ${input.subject} topics`, minutes: perDay, done: false });
    } else {
      const round = Math.floor(i / topics.length);
      const t = topics[i % topics.length];
      const kinds = ["learn", "flashcards", "written", "review"] as const;
      const kind = i < topics.length ? "learn" : kinds[(round + (i % 2)) % kinds.length];
      const label =
        kind === "learn"
          ? `${t.name} + ${mcqCount} MCQs`
          : kind === "flashcards"
            ? `${t.name} + flashcards`
            : kind === "written"
              ? `${t.name} + ${main >= 35 ? "essay" : "long answer"}`
              : `${t.name}: review weak questions`;
      tasks.push({ id: uid("task"), kind: kind === "learn" ? "mcq" : kind, label, topicId: t.topicId, materialId: t.materialId, minutes: main, done: false });
      if (i >= learnDays) break;
    }
    if (withCards && !(hasMock && i === days - 1)) tasks.push({ id: uid("task"), kind: "flashcards", label: "Flashcard review: due cards", minutes: 10, done: false });
    plan.push({ date: date.toISOString(), tasks });
  }

  return {
    id: uid("plan"),
    subject: input.subject,
    examDate: exam.toISOString(),
    minutesPerDay: perDay,
    materialIds: input.materialIds,
    createdAt: new Date().toISOString(),
    days: plan,
  };
}

export function planProgress(p: StudyPlan) {
  const tasks = p.days.flatMap((d) => d.tasks);
  const done = tasks.filter((t) => t.done).length;
  return { done, total: tasks.length, fraction: tasks.length ? done / tasks.length : 0 };
}
