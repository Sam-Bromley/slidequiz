import { ArrowRight, Check, RotateCcw, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isCovered, needsReview, overallProgress, practiceQueue, practiceSet, shuffleOptions } from "@/services/practice";
import { actions } from "@/store/actions";
import { getState, useData } from "@/store/store";
import type { ID, Material } from "@/types/models";

const LETTERS = "ABCDEF";
const COUNTS = [3, 4, 5, 6];

/** "Complete the sentence: …" → a small label and the sentence on its own. */
function splitPrompt(prompt: string): { kicker: string | null; text: string } {
  const m = prompt.match(/^(Complete the sentence|Which term matches this description\?)\s*:?\s*(.+)$/s);
  return m ? { kicker: m[1].replace(/\?$/, "?"), text: m[2].replace(/^“|”$/g, "") } : { kicker: null, text: prompt };
}

export function PracticeView({ material, topicId, onTopicChange, onOpenNotes }: { material: Material; topicId: ID | null; onTopicChange: (t: ID | null) => void; onOpenNotes: (pageId: string) => void }) {
  const data = useData();
  const count = Math.min(6, Math.max(3, data.settings.mcqOptions ?? 5));
  const all = practiceSet(data, material.id);
  const topicQs = topicId ? all.filter((q) => q.topicId === topicId) : all;
  const [queue, setQueue] = useState<ID[]>(() => practiceQueue(topicQs));
  const [pos, setPos] = useState(0);
  const [chosen, setChosen] = useState<number | null>(null);
  const [round, setRound] = useState(0);
  const [session, setSession] = useState({ right: 0, wrong: 0 });
  const nextBtn = useRef<HTMLButtonElement>(null);

  // Rebuild the order when the topic filter or the question set changes.
  const setKey = `${topicId}|${topicQs.map((q) => q.id).join(",")}`;
  const lastKey = useRef(setKey);
  useEffect(() => {
    if (lastKey.current === setKey) return;
    lastKey.current = setKey;
    setQueue(practiceQueue(topicQs));
    setPos(0);
    setChosen(null);
    setRound((r) => r + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setKey]);

  const qid = queue[pos];
  const q = all.find((x) => x.id === qid);
  const answered = chosen !== null;
  // A fresh random order every time a question is shown. A new option count applies straight away,
  // unless the question has already been answered (then it waits for the next one).
  const frozen = useRef(count);
  if (!answered) frozen.current = count;
  const view = useMemo(() => (q ? shuffleOptions(q, frozen.current) : null), [qid, pos, round, frozen.current]); // eslint-disable-line react-hooks/exhaustive-deps
  const correct = answered && view ? chosen === view.correct : false;
  const isRetry = q ? needsReview(q) && !answered : false;
  const page = q ? material.pages.find((p) => p.id === q.sources[0]?.pageId) : undefined;
  const topicName = q ? material.topics.find((t) => t.id === q.topicId)?.name : undefined;
  const prog = overallProgress(data, material);

  const answer = (i: number) => {
    if (!q || !view || answered) return;
    setChosen(i);
    const ok = i === view.correct;
    actions.answerPractice(q.id, ok);
    setSession((s) => (ok ? { ...s, right: s.right + 1 } : { ...s, wrong: s.wrong + 1 }));
    if (!ok) {
      // Ask it again a few questions later.
      setQueue((qu) => {
        const later = qu.slice(pos + 1);
        if (later.slice(0, 6).includes(q.id)) return qu;
        const at = Math.min(qu.length, pos + 4);
        return [...qu.slice(0, at), q.id, ...qu.slice(at)];
      });
    }
    setTimeout(() => nextBtn.current?.focus(), 30);
  };

  const next = () => {
    setChosen(null);
    setPos((p) => p + 1);
  };

  const again = () => {
    const d = getState();
    const qs = practiceSet(d, material.id).filter((x) => !topicId || x.topicId === topicId);
    setQueue(practiceQueue(qs));
    setPos(0);
    setChosen(null);
    setRound((r) => r + 1);
    setSession({ right: 0, wrong: 0 });
  };

  // Keyboard: A–F or 1–6 to answer, Enter or → for the next question.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input,textarea,select,[contenteditable]") || e.metaKey || e.ctrlKey || e.altKey || document.querySelector("[role=dialog]")) return;
      if (!view) return;
      if (!answered) {
        const k = e.key.toUpperCase();
        const i = /^[1-6]$/.test(k) ? Number(k) - 1 : LETTERS.indexOf(k);
        if (i >= 0 && i < view.options.length) {
          e.preventDefault();
          answer(i);
        }
      } else if (e.key === "Enter" || e.key === "ArrowRight") {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const topics = material.topics.filter((t) => all.some((x) => x.topicId === t.id));

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          value={topicId ?? ""}
          onChange={(e) => onTopicChange(e.target.value || null)}
          aria-label="Topic"
          className="h-8 max-w-[60%] rounded-full border bg-card px-3 text-[13px] focus-ring"
        >
          <option value="">All topics</option>
          {topics.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <div className="ml-auto flex items-center gap-2 text-[13px] text-muted-foreground">
          <span className="hidden sm:inline">Options</span>
          <div className="inline-flex rounded-full border bg-card p-0.5" role="radiogroup" aria-label="Answer options per question">
            {COUNTS.map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={count === n}
                onClick={() => actions.updateSettings({ mcqOptions: n })}
                className={cn("h-7 min-w-7 rounded-full px-2 text-[12.5px] font-medium tabular-nums transition-colors focus-ring", count === n ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
                title={`${n} options (A to ${LETTERS[n - 1]})`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mb-5">
        <div className="mb-1.5 flex items-center justify-between text-[12.5px] text-muted-foreground">
          <span>
            {prog.covered} of {prog.total} covered
            {prog.review > 0 && <> · {prog.review} to review</>}
          </span>
          <span className="tabular-nums">{prog.pct}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={prog.pct} aria-valuemin={0} aria-valuemax={100} aria-label="Material covered">
          <div className="h-full rounded-full bg-foreground transition-[width] duration-500" style={{ width: `${prog.pct}%` }} />
        </div>
      </div>

      {!all.length ? (
        <div className="rounded-2xl border border-dashed py-14 text-center">
          <p className="font-medium">No questions yet</p>
          <p className="mt-1 text-[14px] text-muted-foreground">Questions are made from the facts in your slides. Include slides with some text to get started.</p>
        </div>
      ) : !q || !view ? (
        <div className="animate-fade-up rounded-2xl border bg-card p-8 text-center">
          <p className="text-[20px] font-semibold">{topicQs.every(isCovered) ? "You've covered everything here" : "Round finished"}</p>
          <p className="mt-2 text-[14px] text-muted-foreground">
            This round: {session.right} right, {session.wrong} wrong.
            {topicQs.some(needsReview) ? " The ones you got wrong will come up again." : ""}
          </p>
          <Button className="mt-6" onClick={again}>
            <RotateCcw /> Keep practising
          </Button>
        </div>
      ) : (
        <article key={`${qid}-${pos}-${round}`} className="animate-fade-up rounded-2xl border bg-card p-5 sm:p-7" aria-live="polite">
          <p className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-muted-foreground">
            {topicName && <span>{topicName}</span>}
            {page && (
              <>
                <span aria-hidden>·</span>
                <span>{page.label}</span>
              </>
            )}
            {isRetry && <span className="rounded-full bg-warning-soft px-2 py-0.5 font-medium text-warning">You got this wrong before</span>}
          </p>
          {(() => {
            const p = splitPrompt(q.prompt);
            return (
              <>
                {p.kicker && <p className="mb-1 text-[13px] font-medium text-muted-foreground">{p.kicker}</p>}
                <h2 className="text-[19px] font-semibold leading-snug sm:text-[20px]">{p.text}</h2>
              </>
            );
          })()}
          <div className="mt-5 space-y-2" role="radiogroup" aria-label="Answers">
            {view.options.map((o, i) => {
              const isRight = i === view.correct;
              const isChosen = i === chosen;
              return (
                <button
                  key={i}
                  type="button"
                  role="radio"
                  aria-checked={isChosen}
                  disabled={answered}
                  onClick={() => answer(i)}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-xl border px-3.5 py-3 text-left text-[15px] leading-snug transition-colors focus-ring disabled:cursor-default",
                    !answered && "hover:border-foreground/40 hover:bg-accent",
                    answered && isRight && "border-success bg-success-soft",
                    answered && isChosen && !isRight && "border-destructive bg-destructive-soft",
                    answered && !isRight && !isChosen && "opacity-60",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-6 shrink-0 place-items-center rounded-full border text-[12px] font-semibold",
                      answered && isRight ? "border-success bg-success text-success-foreground" : answered && isChosen ? "border-destructive bg-destructive text-destructive-foreground" : "text-muted-foreground",
                    )}
                  >
                    {answered && isRight ? <Check className="size-3.5" strokeWidth={3} /> : answered && isChosen ? <X className="size-3.5" strokeWidth={3} /> : LETTERS[i]}
                  </span>
                  <span className="pt-0.5">{o}</span>
                </button>
              );
            })}
          </div>

          {view.options.length < frozen.current && !answered && (
            <p className="mt-3 text-[12.5px] text-muted-foreground">Your slides only give {view.options.length} good options for this one.</p>
          )}
          {answered && (
            <div className="mt-5 animate-fade-up">
              <p className={cn("text-[15px] font-semibold", correct ? "text-success" : "text-destructive")}>
                {correct ? "Correct" : `Not quite. The answer is ${LETTERS[view.correct]}.`}
              </p>
              <p className="mt-1 text-[14.5px] leading-relaxed text-foreground/85">{q.explanation}</p>
              {!correct && <p className="mt-1 text-[13px] text-muted-foreground">This one will come up again later.</p>}
              <div className="mt-5 flex items-center justify-between gap-3">
                {page ? (
                  <button type="button" onClick={() => onOpenNotes(page.id)} className="text-[13px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-ring">
                    See it in your notes
                  </button>
                ) : (
                  <span />
                )}
                <Button ref={nextBtn} onClick={next}>
                  Next question <ArrowRight />
                </Button>
              </div>
            </div>
          )}
        </article>
      )}
      {q && !answered && <p className="mt-3 hidden text-center text-[12px] text-muted-foreground sm:block">Press A to {LETTERS[view!.options.length - 1]} to answer</p>}
    </div>
  );
}
