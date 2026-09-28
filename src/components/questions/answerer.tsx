import { ArrowRight, Check, CircleCheck, CircleX, Save, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { answersMatch, wordCount } from "@/lib/text";
import { cn, hashString, nowISO, relativeTime, shuffle } from "@/lib/utils";
import { getAI } from "@/services/ai";
import { groundingFor } from "@/services/grounding";
import { actions } from "@/store/actions";
import { getState, useData } from "@/store/store";
import type { Answer, AnswerResponse, Question, WrittenFeedback } from "@/types/models";
import { isWritten } from "./meta";
import { Sources } from "./source";

const LETTERS = "ABCDEFGH";

export function gradeObjective(q: Question, r: AnswerResponse): Pick<Answer, "correct" | "score"> {
  if (r.kind === "choice") {
    const ok = r.index === q.correctIndex;
    return { correct: ok, score: ok ? 1 : 0 };
  }
  if (r.kind === "matching" && q.pairs) {
    const right = q.pairs.filter((_, i) => r.map[i] === i).length;
    return { correct: right === q.pairs.length, score: right / q.pairs.length };
  }
  if (r.kind === "text" && q.type === "fill_blank") {
    const ok = answersMatch(r.text, q.acceptedAnswers ?? [q.answer]);
    return { correct: ok, score: ok ? 1 : 0 };
  }
  return { correct: null, score: 0 };
}

export async function gradeWrittenAnswer(q: Question, text: string): Promise<WrittenFeedback> {
  const m = getState().materials.find((x) => x.id === q.materialId);
  const { pages } = groundingFor(m ? [m] : [], { includeExcluded: true });
  return getAI().gradeWritten(q, text, pages);
}

interface Props {
  question: Question;
  answer?: Answer;
  /** Show correctness + explanation for a submitted answer. */
  reveal: boolean;
  /** Exam mode: record answers without checking. */
  exam?: boolean;
  readOnly?: boolean;
  showExplanation?: boolean;
  onAnswer: (a: Answer) => void;
  /** Keyboard shortcuts (1–4, Enter) active for this question. */
  keyboard?: boolean;
}

/** Renders any question type and handles answering, checking and feedback. */
export function QuestionAnswerer({ question: q, answer, reveal, exam, readOnly, showExplanation = true, onAnswer, keyboard }: Props) {
  const submitted = !!answer?.response && !answer.skipped;
  const locked = readOnly || (submitted && !exam);
  const [choice, setChoice] = useState<number | null>(answer?.response?.kind === "choice" ? answer.response.index : null);
  const [text, setText] = useState(answer?.response?.kind === "text" ? answer.response.text : "");
  const [map, setMap] = useState<Record<number, number>>(answer?.response?.kind === "matching" ? answer.response.map : {});
  const [grading, setGrading] = useState(false);
  const started = useRef(Date.now());

  useEffect(() => {
    setChoice(answer?.response?.kind === "choice" ? answer.response.index : null);
    setText(answer?.response?.kind === "text" ? answer.response.text : (getState().drafts[q.id]?.text ?? ""));
    setMap(answer?.response?.kind === "matching" ? answer.response.map : {});
    started.current = Date.now();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.id]);

  const commit = async (response: AnswerResponse) => {
    const base = { questionId: q.id, response, answeredAt: nowISO(), timeMs: Date.now() - started.current };
    if (isWritten(q.type) && response.kind === "text") {
      if (exam) {
        onAnswer({ ...base, correct: null, score: 0 });
        actions.clearDraft(q.id);
        return;
      }
      setGrading(true);
      try {
        const fb = await gradeWrittenAnswer(q, response.text);
        onAnswer({ ...base, correct: fb.score >= 0.85 ? true : fb.score < 0.3 ? false : null, score: fb.score, feedback: fb });
        actions.clearDraft(q.id);
      } catch {
        toast.error("Something went wrong. Try again.");
      } finally {
        setGrading(false);
      }
      return;
    }
    onAnswer({ ...base, ...gradeObjective(q, response) });
  };

  const options = q.type === "true_false" ? ["True", "False"] : q.options ?? [];
  const isChoice = q.type === "mcq" || q.type === "true_false";

  // Keyboard: 1–n choose an option, Enter checks.
  useEffect(() => {
    if (!keyboard || !isChoice || locked) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input,textarea,select,[contenteditable]") || e.metaKey || e.ctrlKey || e.altKey) return;
      const n = Number(e.key);
      if (n >= 1 && n <= options.length) {
        e.preventDefault();
        setChoice(n - 1);
        if (exam) commit({ kind: "choice", index: n - 1 });
      } else if (e.key === "Enter" && choice != null && !exam) {
        e.preventDefault();
        commit({ kind: "choice", index: choice });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="space-y-4">
      {isChoice && (
        <div role="radiogroup" aria-label="Answer options" className="grid gap-2">
          {options.map((o, i) => {
            const selected = choice === i;
            const isCorrect = i === q.correctIndex;
            const showState = reveal && submitted;
            const state = showState ? (isCorrect ? "correct" : selected ? "wrong" : "idle") : selected ? "selected" : "idle";
            return (
              <button
                key={i}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={locked}
                onClick={() => {
                  setChoice(i);
                  if (exam) commit({ kind: "choice", index: i });
                }}
                className={cn(
                  "group flex w-full items-start gap-3 rounded-xl border p-3.5 text-left text-[14.5px] leading-snug transition-all focus-ring disabled:cursor-default sm:p-4",
                  state === "idle" && "bg-card hover:border-foreground/20 hover:bg-accent/60",
                  state === "idle" && showState && "opacity-60",
                  state === "selected" && "border-primary bg-primary-soft ring-1 ring-primary",
                  state === "correct" && "animate-hop border-success bg-success-soft ring-1 ring-success",
                  state === "wrong" && "animate-shake border-destructive bg-destructive-soft ring-1 ring-destructive",
                )}
              >
                <span
                  className={cn(
                    "grid size-6 shrink-0 place-items-center rounded-md border text-[12px] font-semibold",
                    state === "selected" && "border-primary bg-primary text-primary-foreground",
                    state === "correct" && "border-success bg-success text-success-foreground",
                    state === "wrong" && "border-destructive bg-destructive text-destructive-foreground",
                    state === "idle" && "text-muted-foreground",
                  )}
                  aria-hidden
                >
                  {state === "correct" ? <Check className="size-3.5" /> : state === "wrong" ? <CircleX className="size-3.5" /> : q.type === "true_false" ? (i === 0 ? "T" : "F") : LETTERS[i]}
                </span>
                <span className="flex-1 pt-0.5">{o}</span>
                {state === "correct" && <span className="shrink-0 pt-0.5 text-xs font-semibold text-success">Correct answer</span>}
                {state === "wrong" && <span className="shrink-0 pt-0.5 text-xs font-semibold text-destructive">Your answer</span>}
              </button>
            );
          })}
          {!exam && !locked && (
            <div className="flex items-center gap-3 pt-1">
              <Button onClick={() => choice != null && commit({ kind: "choice", index: choice })} disabled={choice == null}>
                Check answer
              </Button>
              {keyboard && <span className="hidden text-xs text-muted-foreground sm:inline">Press 1–{options.length} to choose, Enter to check</span>}
            </div>
          )}
        </div>
      )}

      {q.type === "fill_blank" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) commit({ kind: "text", text });
          }}
          className="flex flex-col gap-2 sm:flex-row"
        >
          <Input
            aria-label="Your answer"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (exam) onAnswer({ questionId: q.id, response: { kind: "text", text: e.target.value }, answeredAt: nowISO(), ...gradeObjective(q, { kind: "text", text: e.target.value }) });
            }}
            disabled={locked}
            placeholder="Type the missing word…"
            className={cn("h-11 text-[15px] sm:max-w-sm", reveal && submitted && (answer?.correct ? "border-success ring-1 ring-success" : "border-destructive ring-1 ring-destructive"))}
            autoComplete="off"
          />
          {!exam && !locked && (
            <Button type="submit" size="lg" disabled={!text.trim()}>
              Check answer
            </Button>
          )}
        </form>
      )}

      {q.type === "matching" && q.pairs && <Matching q={q} map={map} setMap={setMap} locked={locked} reveal={reveal && submitted} exam={exam} onCommit={(m) => commit({ kind: "matching", map: m })} onExamChange={(m) => onAnswer({ questionId: q.id, response: { kind: "matching", map: m }, answeredAt: nowISO(), ...gradeObjective(q, { kind: "matching", map: m }) })} />}

      {isWritten(q.type) && (
        <WritingArea q={q} text={text} setText={setText} locked={locked} grading={grading} exam={exam} submittedInExam={exam && submitted} onSubmit={() => commit({ kind: "text", text })} />
      )}

      {reveal && submitted && answer && <Feedback q={q} answer={answer} showExplanation={showExplanation} onOverride={readOnly ? undefined : (a) => onAnswer(a)} />}
    </div>
  );
}

function Matching({ q, map, setMap, locked, reveal, exam, onCommit, onExamChange }: { q: Question; map: Record<number, number>; setMap: (m: Record<number, number>) => void; locked: boolean; reveal: boolean; exam?: boolean; onCommit: (m: Record<number, number>) => void; onExamChange: (m: Record<number, number>) => void }) {
  const order = useMemo(() => shuffle(q.pairs!.map((_, i) => i), hashString(q.id)), [q]);
  const complete = q.pairs!.every((_, i) => map[i] != null);
  return (
    <div className="space-y-3">
      <ol className="grid gap-2" aria-label="Descriptions">
        {order.map((pi, k) => (
          <li key={pi} className="flex gap-3 rounded-lg border bg-subtle px-3 py-2 text-[13.5px]">
            <span className="font-semibold text-muted-foreground">{LETTERS[k]}</span>
            <span>{q.pairs![pi].right}</span>
          </li>
        ))}
      </ol>
      <div className="grid gap-2">
        {q.pairs!.map((p, i) => {
          const val = map[i];
          const ok = reveal ? val === i : null;
          return (
            <div key={i} className={cn("flex flex-col gap-2 rounded-lg border bg-card p-3 sm:flex-row sm:items-center", ok === true && "border-success bg-success-soft", ok === false && "border-destructive bg-destructive-soft")}>
              <label htmlFor={`m-${q.id}-${i}`} className="flex-1 text-[14px] font-medium">
                {p.left}
              </label>
              <div className="flex items-center gap-2">
                <select
                  id={`m-${q.id}-${i}`}
                  disabled={locked}
                  value={val ?? ""}
                  onChange={(e) => {
                    const next = { ...map, [i]: Number(e.target.value) };
                    setMap(next);
                    if (exam) onExamChange(next);
                  }}
                  className="h-9 w-full rounded-lg border bg-card px-2 text-sm sm:w-40"
                >
                  <option value="" disabled>
                    Choose…
                  </option>
                  {order.map((pi, k) => (
                    <option key={pi} value={pi}>
                      {LETTERS[k]}
                    </option>
                  ))}
                </select>
                {ok === true && <CircleCheck className="size-5 shrink-0 text-success" aria-label="Correct" />}
                {ok === false && (
                  <span className="shrink-0 text-xs font-semibold text-destructive">
                    Answer: {LETTERS[order.indexOf(i)]}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {!exam && !locked && (
        <Button onClick={() => onCommit(map)} disabled={!complete}>
          Check answers
        </Button>
      )}
    </div>
  );
}

function WritingArea({ q, text, setText, locked, grading, exam, submittedInExam, onSubmit }: { q: Question; text: string; setText: (s: string) => void; locked: boolean; grading: boolean; exam?: boolean; submittedInExam?: boolean; onSubmit: () => void }) {
  const data = useData();
  const draft = data.drafts[q.id];
  const wc = wordCount(text);
  const [lo, hi] = q.suggestedWords ?? [0, 0];
  const big = q.type === "essay" || q.type === "long";
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const change = (v: string) => {
    setText(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => v.trim() && actions.saveDraft(q.id, v), 800); // autosave
  };

  return (
    <div className="space-y-3">
      {q.rubric && !locked && (
        <details className="group rounded-lg border bg-subtle px-3.5 py-2.5 text-[13px]">
          <summary className="cursor-pointer font-medium marker:text-muted-foreground">Mark scheme ({q.marks} marks)</summary>
          <ul className="mt-2 space-y-1.5 text-muted-foreground">
            {q.rubric.map((r) => (
              <li key={r.band}>
                <span className="font-medium text-foreground">{r.band}:</span> {r.descriptor}
              </li>
            ))}
          </ul>
        </details>
      )}
      <Textarea
        aria-label="Your answer"
        value={text}
        onChange={(e) => change(e.target.value)}
        disabled={locked || grading}
        placeholder={q.type === "essay" ? "Plan your argument, then write your essay here…" : "Write your answer here…"}
        className={cn("resize-y text-[15px] leading-7", big ? "min-h-[280px] sm:min-h-[340px]" : "min-h-[140px]")}
      />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12.5px] text-muted-foreground">
        <span className={cn("tabular-nums", lo && wc >= lo && wc <= hi * 1.2 && "text-success")}>
          {wc} {wc === 1 ? "word" : "words"}
        </span>
        {lo > 0 && (
          <span>
            Suggested: {lo}–{hi} words
          </span>
        )}
        {q.marks && q.marks > 1 && <span>{q.marks} marks</span>}
        {draft && !locked && <span className="inline-flex items-center gap-1"><Check className="size-3.5" /> Draft saved {relativeTime(draft.savedAt)}</span>}
        {submittedInExam && <span className="inline-flex items-center gap-1 text-primary"><Check className="size-3.5" /> Answer saved. Marked when you finish</span>}
      </div>
      {!locked && (
        <div className="flex flex-wrap gap-2">
          <Button onClick={onSubmit} disabled={!text.trim() || grading} loading={grading}>
            {grading ? "Marking…" : exam ? (submittedInExam ? "Update answer" : "Save answer") : "Submit answer"}
          </Button>
          <Button
            variant="outline"
            disabled={!text.trim()}
            onClick={() => {
              actions.saveDraft(q.id, text);
              toast("Draft saved");
            }}
          >
            <Save /> Save draft
          </Button>
        </div>
      )}
    </div>
  );
}

function Feedback({ q, answer, showExplanation, onOverride }: { q: Question; answer: Answer; showExplanation: boolean; onOverride?: (a: Answer) => void }) {
  const written = isWritten(q.type);
  const fb = answer.feedback;
  const status = answer.score >= 0.85 ? "correct" : answer.score >= 0.3 && (written || q.type === "matching") ? "partial" : "incorrect";
  const correctText = q.options && q.correctIndex != null ? `${q.type === "mcq" ? LETTERS[q.correctIndex] + ". " : ""}${q.options[q.correctIndex]}` : q.type === "fill_blank" ? q.answer : null;
  const Icon = status === "correct" ? CircleCheck : status === "partial" ? TriangleAlert : CircleX;
  return (
    <div className="animate-fade-up space-y-4 rounded-xl border bg-card p-4 sm:p-5" aria-live="polite">
      <div className="flex items-start gap-3">
        <Icon className={cn("mt-0.5 size-5 shrink-0 animate-boop", status === "correct" ? "text-success" : status === "partial" ? "text-warning" : "text-destructive")} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            {status === "correct" ? "Correct" : status === "partial" ? "Partly correct" : answer.skipped ? "Skipped" : "Not quite"}
            {fb?.estimatedMark && <span className="ml-2 font-normal text-muted-foreground">· Estimated mark {fb.estimatedMark}</span>}
            {q.type === "matching" && <span className="ml-2 font-normal text-muted-foreground">· {Math.round(answer.score * (q.pairs?.length ?? 0))}/{q.pairs?.length} pairs</span>}
          </p>
          {correctText && status !== "correct" && (
            <p className="mt-1 text-[14px]">
              Correct answer: <span className="font-medium">{correctText}</span>
            </p>
          )}
          {fb && <p className="mt-1 text-[14px] text-muted-foreground">{fb.feedback}</p>}
        </div>
      </div>

      {showExplanation && !written && <p className="text-[15px] leading-relaxed">{q.explanation}</p>}

      {written && fb && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <h4 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Key points</h4>
            <ul className="space-y-1.5 text-[13.5px]">
              {q.keyPoints.map((k) => {
                const hit = fb.keyPointsHit.includes(k);
                return (
                  <li key={k} className="flex gap-2">
                    {hit ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-label="Covered" /> : <CircleX className="mt-0.5 size-4 shrink-0 text-muted-foreground/60" aria-label="Missing" />}
                    <span className={hit ? "" : "text-muted-foreground"}>{k}</span>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="space-y-3">
            {fb.missingConcepts.length > 0 && (
              <div className="space-y-1.5">
                <h4 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Missing concepts</h4>
                <div className="flex flex-wrap gap-1.5">
                  {fb.missingConcepts.map((m) => (
                    <Badge key={m} tone="warning" className="h-auto whitespace-normal py-0.5 text-left">
                      {m.split(" · ")[0]}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <h4 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">How to improve</h4>
              <ul className="space-y-1 text-[13.5px]">
                {fb.improvements.map((i) => (
                  <li key={i} className="flex gap-2">
                    <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-primary" /> {i}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {written && (
        <details className="rounded-lg border bg-subtle px-3.5 py-2.5" open={q.type !== "essay"}>
          <summary className="cursor-pointer text-[13px] font-medium">{q.type === "essay" ? "Model answer plan" : "Model answer"}</summary>
          <div className="mt-2 whitespace-pre-line text-[15px] leading-relaxed">{q.answer}</div>
          {q.rubric && (
            <div className="mt-3 border-t pt-3">
              <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Mark scheme</p>
              <ul className="space-y-1 text-[13px] text-muted-foreground">
                {q.rubric.map((r) => (
                  <li key={r.band}>
                    <span className="font-medium text-foreground">{r.band}:</span> {r.descriptor}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </details>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Sources sources={q.sources} />
        {written && onOverride && answer.score < 0.85 && fb && (
          <button className="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline" onClick={() => onOverride({ ...answer, score: 1, correct: true, selfMarked: true })}>
            I covered this, mark as correct
          </button>
        )}
      </div>
    </div>
  );
}
