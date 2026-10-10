import { ArrowLeft, ArrowRight, Check, Eye, PenLine, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Shimmer } from "@/components/ui/shimmer";
import { toast } from "@/components/ui/toast";
import { endSentence, tidyQuestion, tidySentence } from "@/lib/tidy";
import { cn } from "@/lib/utils";
import { AIError, cloudMarkWritten, cloudWrittenQuestions, costText, ensureCredits, refreshAllowance, textSize } from "@/services/ai/cloud";
import { actions } from "@/store/actions";
import { getState } from "@/store/store";
import type { Material, WrittenQuestion } from "@/types/models";
import { Spinner } from "@/components/ui/spinner";
import { burst, chime, fanfare } from "@/lib/celebrate";
import { confetti } from "@/lib/confetti";
import { useCountUp } from "@/lib/count-up";

const list = (id: string) => getState().materials.find((m) => m.id === id)?.written ?? [];
const save = (id: string, written: WrittenQuestion[]) => actions.updateMaterial(id, { written });
const patch = (id: string, qid: string, p: Partial<WrittenQuestion>) => save(id, list(id).map((q) => (q.id === qid ? { ...q, ...p } : q)));

function aiMessage(e: unknown) {
  const err = e as AIError;
  if (err?.message === "busy") return "SlideQuiz is very busy right now. Try again in a little while.";
  return (err?.message ?? "Something went wrong.").replace(/\s*\(\d{3}\)$/, "");
}

/** Unsent answers, kept while moving between questions (until the page is refreshed). */
const drafts = new Map<string, string>();
const STAGES = ["Reading your answer…", "Checking it against the mark scheme…", "Adding up your marks…"];

/** The score as a ring that fills up, with the marks counting up in the middle. */
function ScoreRing({ got, of }: { got: number; of: number }) {
  const n = useCountUp(got, 900);
  const pct = of ? n / of : 0;
  const full = got === of;
  const colour = full ? "stroke-success" : got / of >= 0.5 ? "stroke-warning" : "stroke-destructive";
  const R = 26;
  const C = 2 * Math.PI * R;
  return (
    <div className="relative size-[72px] shrink-0" aria-label={`${got} out of ${of} marks`}>
      <svg viewBox="0 0 64 64" className="size-full -rotate-90" aria-hidden>
        <circle cx="32" cy="32" r={R} fill="none" strokeWidth="6" className="stroke-muted" />
        {pct > 0.01 && <circle cx="32" cy="32" r={R} fill="none" strokeWidth="6" strokeLinecap="round" strokeDasharray={`${pct * C} ${C}`} className={colour} />}
      </svg>
      <span data-score className={cn("absolute inset-0 grid place-items-center text-[17px] font-bold tabular-nums", full && n >= of - 0.01 && "animate-praise")}>
        {Math.round(n)}/{of}
      </span>
    </div>
  );
}

/** Written-answer practice: short exam questions (1 to 6 marks), typed answers, marked against a mark scheme. */
export function WrittenView({ material: m }: { material: Material }) {
  const qs = m.written ?? [];
  const [busy, setBusy] = useState(false);
  const [i, setI] = useState(0);
  const [resets, setResets] = useState(0);
  const idx = Math.min(i, Math.max(0, qs.length - 1));

  // A set of written questions uses about half the lecture's credits.
  const cost = Math.ceil(textSize(m) / 2);
  const generate = async () => {
    if (!ensureCredits(cost)) return;
    setBusy(true);
    try {
      const fresh = await cloudWrittenQuestions(getState().materials.find((x) => x.id === m.id)!, 6);
      if (!fresh.length) throw new Error("No questions came back. Try again.");
      const before = list(m.id);
      save(m.id, [...before, ...fresh]);
      setI(before.length);
    } catch (e) {
      if (!(e as AIError).credits) toast.error(aiMessage(e));
    } finally {
      setBusy(false);
      refreshAllowance();
    }
  };

  if (!qs.length)
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed p-8 text-center">
        <span className="grid size-12 place-items-center rounded-2xl bg-primary-soft text-primary">
          <PenLine className="size-6" />
        </span>
        <h2 className="text-[16px] font-semibold">Written answers</h2>
        <p className="max-w-sm text-[13.5px] text-muted-foreground">Exam-style questions worth 1 to 6 marks. Type your answer and get it marked against a mark scheme, with what you got and what you missed.</p>
        {busy ? (
          <div className="mt-2 w-full max-w-md space-y-2" aria-busy aria-label="Writing questions">
            <p className="flex items-center justify-center gap-2 text-[13px] text-muted-foreground">
              <Spinner className="size-3.5" /> Writing questions…
            </p>
            <Shimmer className="h-4 w-full rounded" />
            <Shimmer className="h-4 w-2/3 rounded" />
          </div>
        ) : (
          <div className="mt-2 flex flex-col items-center gap-1.5">
            <Button onClick={generate}>
              <PenLine /> Write questions
            </Button>
            <span className="text-[12px] text-muted-foreground">Uses {costText(cost)}</span>
          </div>
        )}
      </div>
    );

  const q = qs[idx];
  const totalBest = qs.reduce((n, x) => n + (x.best ?? 0), 0);
  const totalMarks = qs.reduce((n, x) => n + x.marks, 0);
  const tried = qs.filter((x) => x.last).length;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {tried > 0 && (
        <div className="flex items-center gap-3" aria-label={`Best so far: ${totalBest} of ${totalMarks} marks`}>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <div className={cn("h-full rounded-full transition-[width] duration-700 ease-out", totalBest === totalMarks ? "bg-success" : "bg-primary")} style={{ width: `${(totalBest / Math.max(1, totalMarks)) * 100}%` }} />
          </div>
          <span className="text-[12.5px] font-semibold tabular-nums">
            {totalBest}/{totalMarks} <span className="font-normal text-muted-foreground">marks</span>
          </span>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
        <span>
          Question {idx + 1} of {qs.length}
        </span>
        {tried > 0 && (
          <button
            type="button"
            onClick={() => {
              const before = list(m.id);
              save(m.id, before.map(({ last: _l, best: _b, ...rest }) => rest));
              setI(0);
              setResets((n) => n + 1);
              toast.undo("Progress reset", () => {
                save(m.id, before);
                setResets((n) => n + 1);
              });
            }}
            title="Clear your answers and marks and start again"
            className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-full border bg-card px-3 text-[13px] text-muted-foreground transition-colors hover:text-foreground focus-ring"
          >
            <RotateCcw className="size-3.5" /> Reset progress
          </button>
        )}
        <Button variant="outline" size="sm" className={cn(!tried && "ml-auto")} onClick={generate} loading={busy} title={`Uses ${costText(cost)}`}>
          <Plus /> More questions
        </Button>
      </div>
      <QuestionCard key={`${q.id}-${resets}`} material={m} q={q} onNext={idx < qs.length - 1 ? () => setI(idx + 1) : undefined} />
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" disabled={idx === 0} onClick={() => setI(idx - 1)}>
          <ArrowLeft /> Back
        </Button>
        <div className="flex flex-wrap justify-center gap-1" role="tablist" aria-label="Questions">
          {qs.map((x, k) => (
            <button
              key={x.id}
              type="button"
              aria-label={`Question ${k + 1}${x.last ? `, ${x.best}/${x.marks}` : ""}`}
              aria-current={k === idx}
              onClick={() => setI(k)}
              className={cn(
                "size-2.5 rounded-full transition-colors focus-ring",
                k === idx ? "bg-foreground" : x.last ? (x.best === x.marks ? "bg-success" : "bg-warning") : "bg-muted-foreground/30 hover:bg-muted-foreground/60",
              )}
            />
          ))}
        </div>
        <Button variant="ghost" size="sm" disabled={idx >= qs.length - 1} onClick={() => setI(idx + 1)}>
          Next <ArrowRight />
        </Button>
      </div>
    </div>
  );
}

function QuestionCard({ material: m, q, onNext }: { material: Material; q: WrittenQuestion; onNext?: () => void }) {
  const [text, setTextState] = useState(() => drafts.get(q.id) ?? "");
  const setText = (t: string) => {
    drafts.set(q.id, t);
    setTextState(t);
  };
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState(0);
  // How the last marking compared with the best before it (for "+2 marks better").
  const [gain, setGain] = useState<number | null>(null);
  const [fresh, setFresh] = useState(false);
  useEffect(() => {
    if (!busy) return;
    setStage(0);
    const t = setInterval(() => setStage((n) => Math.min(STAGES.length - 1, n + 1)), 1400);
    return () => clearInterval(t);
  }, [busy]);
  const [showModel, setShowModel] = useState(false);
  const [editing, setEditing] = useState(!q.last);
  const area = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (editing) area.current?.focus({ preventScroll: true });
  }, [editing]);
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;

  const mark = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const r = await cloudMarkWritten(q, text.trim());
      const before = q.best;
      patch(m.id, q.id, { last: r, best: Math.max(q.best ?? 0, r.awarded) });
      drafts.delete(q.id);
      actions.writtenMarked(r.awarded);
      setGain(before !== undefined && r.awarded > before ? r.awarded - before : null);
      setFresh(true);
      setEditing(false);
      // A little celebration that grows with the marks.
      const sound = getState().settings.soundEffects !== false;
      setTimeout(() => {
        const el = document.querySelector("[data-score]");
        if (r.awarded === q.marks) {
          if (q.marks >= 3) confetti();
          else burst(el);
          if (sound) fanfare();
        } else if (r.awarded > 0) {
          burst(el, ["#f59e0b", "#fbbf24", "#fde68a"]);
          if (sound) chime(0);
        }
      }, 650);
    } catch (e) {
      toast.error(aiMessage(e));
    } finally {
      setBusy(false);
      refreshAllowance();
    }
  };

  const last = q.last;
  const pct = last ? last.awarded / q.marks : 0;

  return (
    <article className="rounded-2xl border bg-card p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <p className="flex-1 text-[16.5px] font-semibold leading-snug">{tidyQuestion(q.question)}</p>
        <span className="shrink-0 rounded-md bg-secondary px-2 py-1 text-[12px] font-semibold tabular-nums text-secondary-foreground">
          {q.marks} {q.marks === 1 ? "mark" : "marks"}
        </span>
        <button
          type="button"
          aria-label="Delete question"
          title="Delete"
          className="-mr-1 grid size-7 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-destructive focus-ring"
          onClick={() => {
            const before = list(m.id);
            save(m.id, before.filter((x) => x.id !== q.id));
            toast.undo("Question deleted", () => save(m.id, before));
          }}
        >
          <Trash2 className="size-4" />
        </button>
      </div>

      {editing ? (
        <div className="mt-4">
          <textarea
            ref={area}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) mark();
            }}
            rows={Math.min(10, 3 + q.marks)}
            maxLength={3000}
            placeholder="Type your answer…"
            aria-label="Your answer"
            className="w-full resize-y rounded-xl border bg-background px-3.5 py-3 text-[15px] leading-relaxed focus-ring"
          />
          {busy && (
            <div className="mt-3 flex items-center gap-2.5 rounded-xl bg-primary/[0.06] px-3.5 py-2.5 text-[13px]" aria-live="polite">
              <Spinner className="size-3.5" />
              <span key={stage} className="animate-fade-up">{STAGES[stage]}</span>
            </div>
          )}
          <div className="mt-2 flex items-center gap-2">
            <span className="text-[12px] text-muted-foreground">
              {words} {words === 1 ? "word" : "words"} · aim for {q.marks} {q.marks === 1 ? "point" : "key points"}
              <span className="hidden sm:inline"> · Ctrl+Enter to mark</span>
            </span>
            {last && (
              <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            )}
            <Button size="sm" className={cn(!last && "ml-auto")} onClick={mark} loading={busy} disabled={!text.trim()}>
              <Check /> Mark my answer
            </Button>
          </div>
        </div>
      ) : (
        last && (
          <div className="mt-4 space-y-4">
            <div className="rounded-xl border bg-subtle/60 px-4 py-3">
              <p className="text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">Your answer</p>
              <p className="mt-1 whitespace-pre-wrap text-[14.5px] leading-relaxed">{last.answer}</p>
            </div>

            <div className="flex items-center gap-4">
              <ScoreRing got={last.awarded} of={q.marks} />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-[15px] font-semibold">
                  {pct === 1 ? "Full marks!" : pct >= 0.5 ? "Good start" : last.awarded > 0 ? "Getting there" : "Not quite there yet"}
                  {gain !== null && <span className="animate-praise rounded-full bg-success-soft px-2 py-0.5 text-[12px] font-semibold text-success">+{gain} on last time</span>}
                </p>
                {last.feedback && <p className="mt-0.5 text-[13.5px] text-foreground/85">{tidySentence(last.feedback)}</p>}
              </div>
            </div>

            <ul className="space-y-1.5" aria-label="Mark scheme">
              {q.points.map((p, k) => {
                const got = last.hit.includes(k);
                return (
                  <li key={k} className={cn("flex items-start gap-2.5 rounded-lg px-3 py-2 text-[14px]", got ? "bg-success-soft" : "bg-muted/60", fresh && "animate-fade-up")} style={fresh ? { animationDelay: `${250 + k * 120}ms` } : undefined}>
                    {got ? <Check className={cn("mt-0.5 size-4 shrink-0 text-success", fresh && "animate-tick-pop")} style={fresh ? { animationDelay: `${330 + k * 120}ms` } : undefined} /> : <X className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
                    <span className={cn(!got && "text-foreground/75")}>
                      {endSentence(p.text)}
                    </span>
                  </li>
                );
              })}
            </ul>

            {last.improve && (
              <p className="rounded-xl bg-warning-soft/70 px-4 py-3 text-[13.5px]">
                <span className="font-semibold">To get more marks: </span>
                {tidySentence(last.improve)}
              </p>
            )}

            {showModel && q.model && (
              <div className="rounded-r-xl border-l-4 border-success bg-card px-4 py-3">
                <p className="text-[11.5px] font-semibold uppercase tracking-wide text-success">Full-mark answer</p>
                <p className="mt-1 text-[14px] leading-relaxed">{tidySentence(q.model)}</p>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setText(last.answer);
                  setEditing(true);
                }}
              >
                <RotateCcw /> Improve my answer
              </Button>
              {q.model && !showModel && (
                <Button variant="ghost" size="sm" onClick={() => setShowModel(true)}>
                  <Eye /> Show a full-mark answer
                </Button>
              )}
              {onNext && (
                <Button size="sm" className="ml-auto" onClick={onNext}>
                  Next question <ArrowRight />
                </Button>
              )}
            </div>
          </div>
        )
      )}
    </article>
  );
}
