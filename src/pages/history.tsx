import { ArrowRight, Clock, History, MoreHorizontal, Play, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { PageHeader, SectionTitle } from "@/components/layout/page-header";
import { startQuiz } from "@/components/quiz/start";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/input";
import { Menu } from "@/components/ui/menu";
import { toast } from "@/components/ui/toast";
import { Link, navigate } from "@/lib/router";
import { openQuizSetup } from "@/lib/ui";
import { cn, formatDate, formatDuration, pct, plural, relativeTime } from "@/lib/utils";
import { scoreAttempt } from "@/services/study/analytics";
import { actions } from "@/store/actions";
import { inProgressAttempts, topicNameFn } from "@/store/selectors";
import { useData } from "@/store/store";

export function HistoryPage() {
  const data = useData();
  const [material, setMaterial] = useState("all");
  const tn = topicNameFn(data);
  const inProg = inProgressAttempts(data);
  const done = data.attempts
    .filter((a) => a.status === "completed" && (material === "all" || a.materialIds.includes(material)))
    .sort((a, b) => (b.finishedAt ?? "").localeCompare(a.finishedAt ?? ""));

  if (!data.attempts.length)
    return (
      <div>
        <PageHeader title="Quiz History" />
        <EmptyState icon={History} title="No quizzes yet" description="Your scores, times and topic breakdowns will appear here after your first quiz." action={<Button onClick={() => openQuizSetup({})}><Play /> Take a quiz</Button>} />
      </div>
    );

  return (
    <div className="space-y-8">
      <PageHeader title="Quiz History" description={`${plural(done.length, "completed quiz", "completed quizzes")}. Open any result to review answers or retry.`} actions={<Button onClick={() => openQuizSetup({})}><Play /> Take a quiz</Button>} className="mb-0 sm:mb-0" />

      {inProg.length > 0 && (
        <section aria-labelledby="unfinished-h">
          <SectionTitle id="unfinished-h">Unfinished</SectionTitle>
          <ul className="space-y-2">
            {inProg.map((a) => {
              const n = Object.keys(a.answers).length;
              return (
                <li key={a.id} className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{a.title}</p>
                    <p className="text-[12.5px] text-muted-foreground">
                      {n} of {a.questionIds.length} answered · {a.mode === "exam" ? "Exam mode" : "Practice"} · started {relativeTime(a.startedAt)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => toast.undo("Quiz discarded", actions.deleteAttempt(a.id))}>
                      Discard
                    </Button>
                    <Link to={`/quiz/${a.id}`} className={buttonClass("default", "sm")}>
                      Resume <ArrowRight />
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section aria-labelledby="completed-h">
        <SectionTitle
          id="completed-h"
          action={
            <Select aria-label="Filter by material" value={material} onChange={(e) => setMaterial(e.target.value)} className="h-8 w-44 text-[13px]">
              <option value="all">All materials</option>
              {data.materials.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
            </Select>
          }
        >
          Completed
        </SectionTitle>
        {done.length ? (
          <ul className="divide-y overflow-hidden rounded-xl border bg-card">
            {done.map((a) => {
              const s = scoreAttempt(a, data.questions, tn);
              const tone = s.score >= 0.75 ? "success" : s.score >= 0.5 ? "warning" : "danger";
              return (
                <li key={a.id} className="group relative flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-accent/50">
                  <span className={cn("grid size-12 shrink-0 place-items-center rounded-xl font-display text-[14px] font-bold tabular-nums", tone === "success" ? "bg-success-soft text-success" : tone === "warning" ? "bg-warning-soft text-warning" : "bg-destructive-soft text-destructive")}>
                    {pct(s.score)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link to={`/quiz/${a.id}/results`} className="block truncate text-[14.5px] font-semibold after:absolute after:inset-0 focus-ring">
                      {a.title}
                    </Link>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12.5px] text-muted-foreground">
                      <span>{formatDate(a.finishedAt!, { weekday: "short", day: "numeric", month: "short" })}</span>
                      <span aria-hidden>·</span>
                      <span>{s.correct}/{s.total} correct</span>
                      <span aria-hidden>·</span>
                      <span className="inline-flex items-center gap-1"><Clock className="size-3" /> {formatDuration(a.elapsedMs)}</span>
                    </p>
                  </div>
                  {a.mode === "exam" && <Badge tone="primary" className="hidden sm:inline-flex">Exam</Badge>}
                  <div className="relative z-10">
                    <Menu
                      label="Quiz actions"
                      items={[
                        { label: "Review answers", icon: ArrowRight, onSelect: () => navigate(`/quiz/${a.id}/results`) },
                        { label: "Retry", icon: RotateCcw, onSelect: () => startQuiz({ title: a.title.replace(/ \(retry\)$/, "") + " (retry)", questionIds: a.questionIds, mode: a.mode, timeLimitSec: a.timeLimitSec, origin: "retry" }) },
                        { label: "Delete from history", icon: Trash2, danger: true, separatorBefore: true, onSelect: () => toast.undo("Quiz deleted from history", actions.deleteAttempt(a.id)) },
                      ]}
                      trigger={(p) => <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${a.title}`} {...p}><MoreHorizontal /></Button>}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">No completed quizzes for this material yet.</p>
        )}
      </section>
    </div>
  );
}
