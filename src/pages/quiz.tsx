import { ArrowLeft, ArrowRight, Check, Flag, Grid3x3, LogOut, SkipForward, Timer } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { QuestionAnswerer, gradeWrittenAnswer } from "@/components/questions/answerer";
import { isWritten } from "@/components/questions/meta";
import { QuestionMeta } from "@/components/questions/question-card";
import { Button, buttonClass } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Kbd } from "@/components/ui/kbd";
import { toast } from "@/components/ui/toast";
import { Link, navigate } from "@/lib/router";
import { cn, formatClock } from "@/lib/utils";
import { actions } from "@/store/actions";
import { getState, useData } from "@/store/store";
import type { Answer, Question } from "@/types/models";
import { Spinner } from "@/components/ui/spinner";

export function QuizPage({ id }: { id: string }) {
  const data = useData();
  const attempt = data.attempts.find((a) => a.id === id);
  const questions = (attempt?.questionIds.map((qid) => data.questions.find((q) => q.id === qid)).filter(Boolean) ?? []) as Question[];
  const [index, setIndex] = useState(attempt?.currentIndex ?? 0);
  const [navOpen, setNavOpen] = useState(false);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [marking, setMarking] = useState(false);
  const [now, setNow] = useState(Date.now());
  const sessionStart = useRef(Date.now());
  const baseElapsed = useRef(attempt?.elapsedMs ?? 0);
  const exam = attempt?.mode === "exam";

  const elapsed = baseElapsed.current + (now - sessionStart.current);
  const remaining = attempt?.timeLimitSec ? attempt.timeLimitSec - elapsed / 1000 : null;

  // Tick + persist elapsed time.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const save = () => attempt && attempt.status === "in-progress" && actions.updateAttempt(id, { elapsedMs: baseElapsed.current + (Date.now() - sessionStart.current) });
    const t = setInterval(save, 5000);
    return () => {
      clearInterval(t);
      save();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  useEffect(() => {
    if (attempt?.status === "in-progress") actions.updateAttempt(id, { currentIndex: index });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const finish = useCallback(async () => {
    const a = getState().attempts.find((x) => x.id === id);
    if (!a) return;
    actions.updateAttempt(id, { elapsedMs: baseElapsed.current + (Date.now() - sessionStart.current) });
    // Exam mode: mark written answers now.
    const pending = Object.values(a.answers).filter((ans) => {
      const q = getState().questions.find((x) => x.id === ans.questionId);
      return q && isWritten(q.type) && ans.response?.kind === "text" && !ans.feedback;
    });
    if (pending.length) {
      setMarking(true);
      for (const ans of pending) {
        const q = getState().questions.find((x) => x.id === ans.questionId)!;
        try {
          const fb = await gradeWrittenAnswer(q, (ans.response as { text: string }).text);
          actions.saveAttemptAnswer(id, { ...ans, feedback: fb, score: fb.score, correct: fb.score >= 0.85 ? true : fb.score < 0.3 ? false : null });
        } catch {
          /* leave unmarked */
        }
      }
      setMarking(false);
    }
    actions.finishAttempt(id);
    navigate(`/quiz/${id}/results`, { replace: true });
  }, [id]);

  // Time's up.
  useEffect(() => {
    if (remaining != null && remaining <= 0 && attempt?.status === "in-progress" && !marking) {
      toast.info("Time's up", { description: "Your answers have been submitted." });
      finish();
    }
  }, [remaining, attempt?.status, marking, finish]);

  const q = questions[index];
  const answer = q ? attempt?.answers[q.id] : undefined;
  const answered = !!answer?.response;
  const flagged = q ? attempt?.flagged.includes(q.id) : false;
  const isLast = index === questions.length - 1;
  const unanswered = questions.filter((x) => !attempt?.answers[x.id]?.response).length;

  const go = (i: number) => setIndex(Math.max(0, Math.min(questions.length - 1, i)));
  const toggleFlag = () => q && actions.updateAttempt(id, { flagged: flagged ? attempt!.flagged.filter((x) => x !== q.id) : [...attempt!.flagged, q.id] });
  const next = () => (isLast ? (unanswered ? setConfirmFinish(true) : finish()) : go(index + 1));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input,textarea,select") || e.metaKey || e.ctrlKey || document.querySelector("[role=dialog]")) return;
      if (e.key === "ArrowRight") go(index + 1);
      else if (e.key === "ArrowLeft") go(index - 1);
      else if (e.key.toLowerCase() === "f") toggleFlag();
      else if (e.key === "Enter" && answered && !exam && !isWritten(q.type)) {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    if (attempt?.status === "completed") navigate(`/quiz/${id}/results`, { replace: true });
  }, [attempt?.status, id]);

  if (!attempt || !questions.length)
    return (
      <div className="mx-auto max-w-lg px-4 py-20">
        <EmptyState icon={Grid3x3} title="This quiz isn't available" description="It may have been deleted, or its questions were removed." action={<Link to="/history" className={buttonClass()}>Quiz history</Link>} />
      </div>
    );
  if (attempt.status === "completed") return null;

  const save = (a: Answer) => actions.saveAttemptAnswer(id, a);
  const lowTime = remaining != null && remaining < 60;

  return (
    <div className="flex min-h-[100dvh] flex-col">
      {/* Top bar */}
      <header className="sticky z-20 border-b bg-background/90 backdrop-blur-md" style={{ top: "env(safe-area-inset-top, 0px)" }}>
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-2 px-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              actions.updateAttempt(id, { elapsedMs: elapsed });
              toast("Progress saved", { description: "Resume this quiz any time from Home or Quiz History." });
              navigate("/");
            }}
          >
            <LogOut /> <span className="hidden sm:inline">Save & exit</span>
          </Button>
          <div className="min-w-0 flex-1 text-center">
            <p className="truncate text-[13px] font-semibold">{attempt.title}</p>
            <p className="text-[11.5px] text-muted-foreground">{exam ? "Exam mode. Answers shown at the end" : "Practice mode"}</p>
          </div>
          <span className={cn("inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] tabular-nums", lowTime ? "animate-pulse bg-destructive-soft text-destructive" : "bg-secondary")} aria-label={remaining != null ? "Time remaining" : "Time elapsed"} role="timer">
            <Timer className="size-3.5" /> {formatClock(remaining != null ? remaining : elapsed / 1000)}
          </span>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 pb-36 pt-6 sm:pt-10">
        <div className="mb-6 space-y-2.5">
          <div className="flex items-center justify-between text-[13px]">
            <span className="font-semibold">
              Question {index + 1} <span className="font-normal text-muted-foreground">of {questions.length}</span>
            </span>
            <button onClick={() => setNavOpen(true)} className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 font-medium text-muted-foreground hover:bg-accent hover:text-foreground focus-ring">
              <Grid3x3 className="size-3.5" /> {attempt.flagged.length ? `${attempt.flagged.length} flagged · ` : ""}All questions
            </button>
          </div>
          <div className="flex gap-1" aria-hidden>
            {questions.map((x, i) => {
              const a = attempt.answers[x.id];
              const state = !a?.response ? "none" : exam || a.correct == null && !a.feedback ? "answered" : a.score >= 0.85 ? "right" : a.score >= 0.3 ? "partial" : "wrong";
              return (
                <span
                  key={x.id}
                  className={cn(
                    "h-1.5 flex-1 rounded-full transition-colors",
                    state === "none" && "bg-secondary",
                    state === "answered" && "bg-primary",
                    state === "right" && "bg-success",
                    state === "partial" && "bg-warning",
                    state === "wrong" && "bg-destructive",
                    i === index && "ring-2 ring-primary/40 ring-offset-1 ring-offset-background",
                  )}
                />
              );
            })}
          </div>
          <div className="sr-only" role="progressbar" aria-valuenow={index + 1} aria-valuemin={1} aria-valuemax={questions.length} aria-label="Quiz progress" />
        </div>

        <article key={q.id} className="animate-fade-up space-y-5">
          <div className="flex items-start justify-between gap-3">
            <QuestionMeta q={q} />
            <Button variant={flagged ? "subtle" : "ghost"} size="sm" onClick={toggleFlag} aria-pressed={flagged} className="shrink-0">
              <Flag className={cn(flagged && "fill-current")} /> {flagged ? "Flagged" : "Flag"}
            </Button>
          </div>
          <h1 className="whitespace-pre-line text-[21px] font-medium leading-snug sm:text-[24px]">{q.prompt}</h1>
          <QuestionAnswerer question={q} answer={answer} reveal={!exam} exam={exam} keyboard showExplanation={data.settings.showExplanations} onAnswer={save} />
        </article>
      </main>

      {/* Bottom controls */}
      <footer className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/92 backdrop-blur-md" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3">
          <Button variant="outline" onClick={() => go(index - 1)} disabled={index === 0} aria-label="Previous question">
            <ArrowLeft /> <span className="hidden sm:inline">Previous</span>
          </Button>
          {!answered && !isLast && (
            <Button variant="ghost" onClick={() => go(index + 1)}>
              <SkipForward /> Skip
            </Button>
          )}
          <span className="ml-auto hidden items-center gap-1 text-[11.5px] text-muted-foreground md:inline-flex">
            <Kbd>←</Kbd>
            <Kbd>→</Kbd> move · <Kbd>F</Kbd> flag
          </span>
          <Button onClick={next} className="ml-auto md:ml-2" variant={isLast ? "default" : answered ? "default" : "outline"} loading={marking}>
            {isLast ? (
              <>
                <Check /> {marking ? "Marking…" : "Finish quiz"}
              </>
            ) : (
              <>
                Next <ArrowRight />
              </>
            )}
          </Button>
        </div>
      </footer>

      <Dialog open={navOpen} onClose={() => setNavOpen(false)} title="All questions" description={`${questions.length - unanswered} answered · ${unanswered} unanswered · ${attempt.flagged.length} flagged`}>
        <QuestionGrid questions={questions} answers={attempt.answers} flagged={attempt.flagged} exam={exam} current={index} onPick={(i) => { go(i); setNavOpen(false); }} />
        {attempt.flagged.length > 0 && (
          <div className="mt-5">
            <h3 className="mb-2 text-[13px] font-semibold">Review flagged questions</h3>
            <ul className="space-y-1.5">
              {attempt.flagged.map((fid) => {
                const i = questions.findIndex((x) => x.id === fid);
                if (i < 0) return null;
                return (
                  <li key={fid}>
                    <button className="flex w-full items-start gap-2 rounded-lg border p-2.5 text-left text-[13px] hover:bg-accent" onClick={() => { go(i); setNavOpen(false); }}>
                      <Flag className="mt-0.5 size-3.5 shrink-0 fill-current text-warning" />
                      <span className="font-medium">Q{i + 1}.</span>
                      <span className="line-clamp-2 text-muted-foreground">{questions[i].prompt}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        <Button className="mt-5 w-full" onClick={() => { setNavOpen(false); unanswered ? setConfirmFinish(true) : finish(); }}>
          Finish quiz
        </Button>
      </Dialog>

      <ConfirmDialog
        open={confirmFinish}
        onClose={() => setConfirmFinish(false)}
        onConfirm={finish}
        destructive={false}
        title="Finish the quiz?"
        confirmLabel="Finish anyway"
        description={`You have ${unanswered} unanswered question${unanswered === 1 ? "" : "s"}${attempt.flagged.length ? ` and ${attempt.flagged.length} flagged` : ""}. Unanswered questions count as skipped.`}
      />

      {marking && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 backdrop-blur-sm" role="status">
          <div className="text-center">
            <Spinner className="mx-auto block size-8 text-primary" />
            <p className="mt-4 font-semibold">Marking your written answers…</p>
          </div>
        </div>
      )}
    </div>
  );
}

function QuestionGrid({ questions, answers, flagged, exam, current, onPick }: { questions: Question[]; answers: Record<string, Answer>; flagged: string[]; exam: boolean; current: number; onPick: (i: number) => void }) {
  return (
    <ol className="grid grid-cols-6 gap-2 sm:grid-cols-8">
      {questions.map((q, i) => {
        const a = answers[q.id];
        const done = !!a?.response;
        const f = flagged.includes(q.id);
        const tone = !done ? "" : exam ? "bg-primary-soft border-primary/40 text-primary" : a.score >= 0.85 ? "bg-success-soft border-success/40 text-success" : a.score >= 0.3 ? "bg-warning-soft border-warning/40 text-warning" : "bg-destructive-soft border-destructive/40 text-destructive";
        return (
          <li key={q.id}>
            <button onClick={() => onPick(i)} className={cn("relative grid h-10 w-full place-items-center rounded-lg border text-[13px] font-semibold tabular-nums transition-colors hover:bg-accent focus-ring", tone, i === current && "ring-2 ring-primary")} aria-label={`Question ${i + 1}${done ? ", answered" : ", unanswered"}${f ? ", flagged" : ""}`}>
              {i + 1}
              {f && <Flag className="absolute -right-1 -top-1 size-3 fill-warning text-warning" />}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
