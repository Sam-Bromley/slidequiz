import { CircleCheck, CircleMinus, CircleX, Clock, Download, RotateCcw, SquarePen, Target, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { ExportDialog } from "@/components/export/export-dialog";
import { PageHeader } from "@/components/layout/page-header";
import { QuestionAnswerer } from "@/components/questions/answerer";
import { QuestionMeta } from "@/components/questions/question-card";
import { startQuiz, startWeakAreas } from "@/components/quiz/start";
import { Button, buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Progress } from "@/components/ui/progress";
import { Segmented } from "@/components/ui/segmented";
import { Link, navigate } from "@/lib/router";
import { cn, formatDate, formatDuration, pct } from "@/lib/utils";
import { scoreAttempt } from "@/services/study/analytics";
import { topicNameFn } from "@/store/selectors";
import { useData } from "@/store/store";
import type { Question } from "@/types/models";

function ScoreRing({ value }: { value: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const tone = value >= 0.75 ? "text-success" : value >= 0.5 ? "text-warning" : "text-destructive";
  return (
    <div className="relative size-[132px] shrink-0">
      <svg viewBox="0 0 120 120" className="size-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" strokeWidth="10" className="stroke-secondary" />
        <circle cx="60" cy="60" r={r} fill="none" strokeWidth="10" strokeLinecap="round" className={cn("stroke-current transition-[stroke-dashoffset] duration-1000 ease-out", tone)} strokeDasharray={c} strokeDashoffset={c * (1 - value)} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="font-display text-[32px] font-extrabold tabular-nums leading-none">{pct(value)}</p>
          <p className="mt-1 text-[11.5px] text-muted-foreground">score</p>
        </div>
      </div>
    </div>
  );
}

export function QuizResultsPage({ id }: { id: string }) {
  const data = useData();
  const [filter, setFilter] = useState<"all" | "wrong" | "flagged">("all");
  const [exporting, setExporting] = useState(false);
  const a = data.attempts.find((x) => x.id === id);
  if (!a)
    return <EmptyState icon={Target} title="Quiz not found" description="It may have been deleted." action={<Link to="/history" className={buttonClass()}>Quiz history</Link>} />;
  if (a.status !== "completed") {
    return <EmptyState icon={Clock} title="This quiz isn't finished yet" action={<Link to={`/quiz/${a.id}`} className={buttonClass()}>Resume quiz</Link>} />;
  }
  const s = scoreAttempt(a, data.questions, topicNameFn(data));
  const qs = a.questionIds.map((qid) => data.questions.find((q) => q.id === qid)).filter(Boolean) as Question[];
  const weakTopicIds = s.byTopic.filter((t) => t.score < 0.7 && t.topicId).map((t) => t.topicId!) as string[];
  const shown = qs.filter((q) => (filter === "all" ? true : filter === "flagged" ? a.flagged.includes(q.id) : (a.answers[q.id]?.score ?? 0) < 0.85));
  const verdict = `${s.correct} of ${s.total} correct`;

  return (
    <div className="space-y-8">
      <PageHeader back={{ to: "/", label: "Home" }} eyebrow={`${a.mode === "exam" ? "Exam" : "Practice"} · ${formatDate(a.finishedAt!, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`} title={a.title} className="mb-0 sm:mb-0" />

      <section className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <div className="flex flex-col items-center gap-6 rounded-2xl border bg-card p-6 sm:flex-row">
          <ScoreRing value={s.score} />
          <div className="w-full flex-1">
            <p className="text-[17px] font-semibold">{verdict}</p>
            <ul className="mt-4 grid grid-cols-2 gap-2 text-[13.5px]">
              <li className="flex items-center gap-2 rounded-lg bg-subtle px-3 py-2"><CircleCheck className="size-4 text-success" /> <span className="font-semibold tabular-nums">{s.correct}</span> correct</li>
              <li className="flex items-center gap-2 rounded-lg bg-subtle px-3 py-2"><CircleX className="size-4 text-destructive" /> <span className="font-semibold tabular-nums">{s.incorrect}</span> incorrect</li>
              {s.partial > 0 && <li className="flex items-center gap-2 rounded-lg bg-subtle px-3 py-2"><TriangleAlert className="size-4 text-warning" /> <span className="font-semibold tabular-nums">{s.partial}</span> partly correct</li>}
              <li className="flex items-center gap-2 rounded-lg bg-subtle px-3 py-2"><CircleMinus className="size-4 text-muted-foreground" /> <span className="font-semibold tabular-nums">{s.skipped}</span> skipped</li>
              <li className="flex items-center gap-2 rounded-lg bg-subtle px-3 py-2"><Clock className="size-4 text-muted-foreground" /> <span className="font-semibold tabular-nums">{formatDuration(a.elapsedMs)}</span></li>
            </ul>
          </div>
        </div>
        <div className="rounded-2xl border bg-card p-6">
          <h2 className="text-[15px] font-semibold">Topic performance</h2>
          <ul className="mt-4 space-y-3.5">
            {s.byTopic.map((t) => (
              <li key={(t.topicId ?? "x") + t.name}>
                <div className="mb-1.5 flex items-center justify-between text-[13.5px]">
                  <span className="font-medium">{t.name}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {t.correct}/{t.total} · {pct(t.score)}
                  </span>
                </div>
                <Progress value={t.score} tone={t.score >= 0.75 ? "success" : t.score >= 0.5 ? "warning" : "danger"} size="sm" label={`${t.name} score`} />
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="flex flex-wrap gap-2" aria-label="Next steps">
        <Button onClick={() => document.getElementById("review")?.scrollIntoView({ behavior: "smooth" })} variant="outline">
          Review answers
        </Button>
        <Button variant="outline" onClick={() => startQuiz({ title: a.title.replace(/ \(retry\)$/, "") + " (retry)", questionIds: a.questionIds, mode: a.mode, timeLimitSec: a.timeLimitSec, origin: "retry" })}>
          <RotateCcw /> Retry
        </Button>
        <Button variant="outline" onClick={() => navigate(`/generate?m=${a.materialIds.join(",")}`)}>
          <SquarePen /> New questions
        </Button>
        <Button onClick={() => startWeakAreas(a.materialIds, weakTopicIds.length ? weakTopicIds : undefined)} disabled={!weakTopicIds.length && s.score >= 0.99}>
          <Target /> Study weak areas
        </Button>
        <Button variant="ghost" onClick={() => setExporting(true)} className="sm:ml-auto">
          <Download /> Export
        </Button>
      </section>

      <section id="review" aria-labelledby="review-h" className="scroll-mt-24">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 id="review-h" className="text-[18px] font-bold">Review answers</h2>
          <Segmented
            size="sm"
            label="Filter answers"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: `All (${qs.length})` },
              { value: "wrong", label: `To review (${qs.filter((q) => (a.answers[q.id]?.score ?? 0) < 0.85).length})` },
              ...(a.flagged.length ? [{ value: "flagged" as const, label: `Flagged (${a.flagged.length})` }] : []),
            ]}
          />
        </div>
        <div className="space-y-4">
          {shown.map((q) => {
            const i = qs.indexOf(q);
            const ans = a.answers[q.id];
            return (
              <article key={q.id} className="rounded-xl border bg-card p-4 sm:p-5">
                <QuestionMeta q={q} number={i + 1} />
                <p className="mb-4 mt-2.5 whitespace-pre-line text-[16.5px] leading-relaxed">{q.prompt}</p>
                {ans?.response ? (
                  <QuestionAnswerer question={q} answer={ans} reveal readOnly onAnswer={() => {}} />
                ) : (
                  <div className="space-y-2 rounded-lg border border-dashed p-3.5 text-[14px]">
                    <p className="font-medium text-muted-foreground">Skipped</p>
                    <p>
                      <span className="font-medium">Answer:</span> {q.options && q.correctIndex != null ? q.options[q.correctIndex] : q.answer.split("\n")[0]}
                    </p>
                    <p className="text-muted-foreground">{q.explanation}</p>
                  </div>
                )}
              </article>
            );
          })}
          {!shown.length && <p className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">Nothing to review here. Nice.</p>}
        </div>
      </section>
      {exporting && <ExportDialog open onClose={() => setExporting(false)} questions={qs} title={a.title} />}
    </div>
  );
}
