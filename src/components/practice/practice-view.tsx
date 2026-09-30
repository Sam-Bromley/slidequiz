import { ArrowLeft, ArrowRight, Check, ChevronDown, RotateCcw, Shuffle, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { tidyOption, tidyQuestion, tidySentence } from "@/lib/tidy";
import { AIWaiting, hasText } from "@/components/ai/ai-waiting";
import { isCovered, needsReview, practiceQueue, practiceSet, shuffleOptions } from "@/services/practice";
import { actions } from "@/store/actions";
import { getState, useData } from "@/store/store";
import type { ID, Material, Question } from "@/types/models";

const LETTERS = "ABCDEF";
const COUNTS = [3, 4, 5, 6];

/** "Complete the sentence: …" → a small label and the sentence on its own. */
function splitPrompt(prompt: string): { kicker: string | null; text: string } {
  const m = prompt.match(/^(Complete the sentence|Which term matches this description\?)\s*:?\s*(.+)$/s);
  return m ? { kicker: m[1].replace(/\?$/, "?"), text: m[2].replace(/^“|”$/g, "") } : { kicker: null, text: prompt };
}

/** A small button that opens a panel underneath it. */
function Pop({ label, title, children, align = "left", className }: { label: string; title: string; children: ReactNode; align?: "left" | "right"; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  return (
    <div ref={ref} className={cn("relative", className)}>
      <button type="button" aria-expanded={open} aria-haspopup="true" title={title} onClick={() => setOpen((o) => !o)} className="inline-flex h-8 max-w-full items-center gap-1.5 rounded-full border bg-card px-3 text-[13px] text-muted-foreground transition-colors hover:text-foreground focus-ring">
        <span className="truncate">{label}</span>
        <ChevronDown className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div role="dialog" aria-label={title} className={cn("absolute top-full z-30 mt-1.5 w-64 animate-scale-in rounded-xl border bg-popover p-1.5 shadow-pop", align === "right" ? "right-0" : "left-0")}>
          {children}
        </div>
      )}
    </div>
  );
}

type PastAnswer = { qid: ID; view: { options: string[]; correct: number }; chosen: number };
/** Answer history per material (or folder), for as long as the site is open. */
const HISTORY = new Map<string, PastAnswer[]>();

/**
 * One question at a time. Normally for one material (filtered by topic); with `mixed`,
 * questions come from several materials and the filter picks materials instead.
 */
export function PracticeView({ material, mixed, topicIds, onTopicsChange, onOpenNotes }: { material: Material; mixed?: Material[]; topicIds: ID[]; onTopicsChange: (t: ID[]) => void; onOpenNotes: (pageId: string, materialId: ID) => void }) {
  const data = useData();
  const count = Math.min(6, Math.max(3, data.settings.mcqOptions ?? 5));
  const setFor = (d: typeof data) => (mixed ? mixed.flatMap((m) => practiceSet(d, m.id)) : practiceSet(d, material.id));
  const groupOf = (x: Question) => (mixed ? x.materialId : x.topicId);
  const all = setFor(data);
  const topicQs = topicIds.length ? all.filter((q) => groupOf(q) && topicIds.includes(groupOf(q)!)) : all;
  const shuffle = !!data.settings.practiceShuffle;
  const [queue, setQueue] = useState<ID[]>(() => practiceQueue(topicQs, shuffle));
  const [pos, setPos] = useState(0);
  const [chosen, setChosen] = useState<number | null>(null);
  const [round, setRound] = useState(0);
  const [session, setSession] = useState({ right: 0, wrong: 0 });
  const nextBtn = useRef<HTMLButtonElement>(null);
  /** Every question answered (kept while the site is open, across rounds and tab switches), so you can go back to any of them. */
  const historyKey = mixed ? mixed.map((m) => m.id).join(",") : material.id;
  const [past, setPastState] = useState<PastAnswer[]>(() => HISTORY.get(historyKey) ?? []);
  const setPast = (fn: (ps: PastAnswer[]) => PastAnswer[]) =>
    setPastState((ps) => {
      const next = fn(ps);
      HISTORY.set(historyKey, next);
      return next;
    });
  /** Which past question is on screen (null = the current one). */
  const [viewIdx, setViewIdx] = useState<number | null>(null);

  // Rebuild the order when the topic filter or the question set changes.
  const setKey = `${topicIds.join(",")}|${shuffle}|${topicQs.map((q) => q.id).join(",")}`;
  const lastKey = useRef(setKey);
  useEffect(() => {
    if (lastKey.current === setKey) return;
    lastKey.current = setKey;
    setQueue(practiceQueue(topicQs, shuffle));
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
  // Looking back at an earlier question, or at the current one.
  const rev = viewIdx !== null ? past[viewIdx] : null;
  const sq = rev ? all.find((x) => x.id === rev.qid) : q;
  const sView = rev ? rev.view : view;
  const sChosen = rev ? rev.chosen : chosen;
  const sAnswered = rev ? true : answered;
  const sCorrect = sAnswered && sView ? sChosen === sView.correct : false;
  const currentInPast = answered && past.length > 0 && past[past.length - 1].qid === qid;
  const canGoBack = viewIdx !== null ? viewIdx > 0 : past.length - (currentInPast ? 1 : 0) > 0;
  const goBack = () => setViewIdx((v) => (v !== null ? Math.max(0, v - 1) : past.length - (currentInPast ? 2 : 1)));
  const goForward = () =>
    setViewIdx((v) => {
      if (v === null) return null;
      const n = v + 1;
      return n >= past.length || (currentInPast && n === past.length - 1) ? null : n;
    });
  // How it went last time (only shown before answering the current question).
  const before = !rev && q && !answered ? q.stats.lastResult : undefined;
  const qMaterial = sq ? (mixed ? mixed.find((m) => m.id === sq.materialId) : material) : undefined;
  const page = sq ? qMaterial?.pages.find((p) => p.id === sq.sources[0]?.pageId) : undefined;
  const topicName = sq ? (mixed ? qMaterial?.title : material.topics.find((t) => t.id === sq.topicId)?.name) : undefined;
  const coveredN = all.filter(isCovered).length;
  const prog = { total: all.length, covered: coveredN, review: all.filter(needsReview).length, pct: all.length ? Math.round((coveredN / all.length) * 100) : 0 };

  const answer = (i: number) => {
    if (!q || !view || answered) return;
    setChosen(i);
    setPast((ps) => [...ps, { qid: q.id, view, chosen: i }]);
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
    // Ready for Enter / → without scrolling the page.
    requestAnimationFrame(() => nextBtn.current?.focus({ preventScroll: true }));
  };

  const next = () => {
    setChosen(null);
    setViewIdx(null);
    setPos((p) => p + 1);
  };

  /** Skip this one for now: it comes back at the end of the round. */
  const skip = () => {
    if (!q) return;
    setQueue((qu) => (pos + 1 < qu.length ? [...qu.slice(0, pos + 1), ...qu.slice(pos + 1), q.id] : qu));
    setChosen(null);
    setViewIdx(null);
    setPos((p) => p + 1);
  };

  const again = () => {
    const d = getState();
    const qs = setFor(d).filter((x) => !topicIds.length || (groupOf(x) && topicIds.includes(groupOf(x)!)));
    setQueue(practiceQueue(qs, shuffle));
    setPos(0);
    setChosen(null);
    setRound((r) => r + 1);
    setSession({ right: 0, wrong: 0 });
    setViewIdx(null);
  };

  // Keyboard: A–F or 1–6 to answer, Enter or → for the next question.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input,textarea,select,[contenteditable]") || e.metaKey || e.ctrlKey || e.altKey || document.querySelector("[role=dialog]")) return;
      // ← goes back to earlier questions; → / Enter comes forward again.
      if (e.key === "ArrowLeft" && canGoBack) {
        e.preventDefault();
        goBack();
        return;
      }
      if (rev) {
        if (e.key === "Enter" || e.key === "ArrowRight") {
          e.preventDefault();
          goForward();
        }
        return;
      }
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

  const topics = (mixed ? mixed.map((m) => ({ id: m.id, name: m.title })) : material.topics).filter((t) => all.some((x) => groupOf(x) === t.id));

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Pop
          label={topicIds.length === 0 ? (mixed ? "All materials" : "All topics") : topicIds.length === 1 ? topics.find((t) => t.id === topicIds[0])?.name ?? "1 topic" : `${topicIds.length} ${mixed ? "materials" : "topics"}`}
          title={mixed ? "Materials to practise" : "Topics to practise"}
          className="max-w-[70%]"
        >
          <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-[14px] hover:bg-accent">
            <input type="checkbox" className="size-4 accent-foreground" checked={topicIds.length === 0} onChange={() => onTopicsChange([])} />
            {mixed ? "All materials" : "All topics"}
          </label>
          <div className="my-1 border-t" />
          {topics.map((t) => {
            const on = topicIds.includes(t.id);
            return (
              <label key={t.id} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-[14px] hover:bg-accent">
                <input
                  type="checkbox"
                  className="size-4 accent-foreground"
                  checked={on}
                  onChange={() => {
                    const next = on ? topicIds.filter((x) => x !== t.id) : [...topicIds, t.id];
                    onTopicsChange(next.length === topics.length ? [] : next);
                  }}
                />
                <span className="min-w-0 flex-1 truncate">{t.name}</span>
                <span className="text-[12px] tabular-nums text-muted-foreground">{all.filter((x) => groupOf(x) === t.id).length}</span>
              </label>
            );
          })}
        </Pop>
        <button
          type="button"
          aria-pressed={shuffle}
          title={shuffle ? "Questions in a random order" : "Questions in slide order"}
          onClick={() => actions.updateSettings({ practiceShuffle: !shuffle })}
          className={cn("inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] transition-colors focus-ring", shuffle ? "border-foreground bg-foreground text-background" : "bg-card text-muted-foreground hover:text-foreground")}
        >
          <Shuffle className="size-3.5" /> Shuffle
        </button>
        <Pop label={`${count} options`} title="Answer options" align="right" className="ml-auto">
          <div className="grid grid-cols-4 gap-1 p-1" role="radiogroup" aria-label="Answer options per question">
            {COUNTS.map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={count === n}
                onClick={() => actions.updateSettings({ mcqOptions: n })}
                className={cn("h-9 rounded-lg text-[14px] font-medium tabular-nums transition-colors focus-ring", count === n ? "bg-foreground text-background" : "hover:bg-accent")}
              >
                {n}
              </button>
            ))}
          </div>
          <p className="px-2 pb-1 pt-2 text-[12px] text-muted-foreground">A to {LETTERS[count - 1]} for each question</p>
        </Pop>
      </div>

      <div className="mb-5">
        <div className="mb-1.5 flex items-center justify-between text-[12.5px] text-muted-foreground">
          <span>
            {prog.covered} of {prog.total} covered
          </span>
          <span className="tabular-nums">{prog.pct}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={prog.pct} aria-valuemin={0} aria-valuemax={100} aria-label="Material covered">
          <div className="h-full rounded-full bg-foreground transition-[width] duration-500" style={{ width: `${prog.pct}%` }} />
        </div>
      </div>

      {!all.length && !mixed && hasText(material) && material.ai?.status !== "done" ? (
        <AIWaiting material={material} what="questions" />
      ) : !all.length ? (
        <div className="rounded-2xl border border-dashed py-14 text-center">
          <p className="font-medium">No questions yet</p>
          <p className="mt-1 text-[14px] text-muted-foreground">Questions are made from the facts in your slides. Include slides with some text to get started.</p>
        </div>
      ) : !sq || !sView ? (
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
        <article key={rev ? `past-${viewIdx}` : `${qid}-${pos}-${round}`} className="animate-fade-up rounded-2xl border bg-card p-5 sm:p-7" aria-live="polite">
          <p className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-muted-foreground">
            {topicName && <span>{topicName}</span>}
            {page && (
              <>
                <span aria-hidden>·</span>
                <span>{page.label}</span>
              </>
            )}
            {before === "incorrect" && <span className="rounded-full bg-warning-soft px-2 py-0.5 font-medium text-warning">You got this wrong before</span>}
            {before === "correct" && <span className="rounded-full bg-success-soft px-2 py-0.5 font-medium text-success">You got this right before</span>}
            {rev && <span className="rounded-full bg-muted px-2 py-0.5 font-medium">Looking back</span>}
            {canGoBack && (
              <button type="button" onClick={goBack} className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 hover:bg-accent hover:text-foreground focus-ring" aria-label="Previous question">
                <ArrowLeft className="size-3.5" /> Previous
              </button>
            )}
          </p>
          {(() => {
            const p = splitPrompt(sq!.prompt);
            return (
              <>
                {p.kicker && <p className="mb-1 text-[13px] font-medium text-muted-foreground">{p.kicker}</p>}
                <h2 className="text-[19px] font-semibold leading-snug sm:text-[20px]">{tidyQuestion(p.text)}</h2>
              </>
            );
          })()}
          <div className="mt-5 space-y-2" role="radiogroup" aria-label="Answers" data-no-bounce>
            {sView!.options.map((o, i) => {
              const isRight = i === sView!.correct;
              const isChosen = i === sChosen;
              return (
                <button
                  key={i}
                  type="button"
                  role="radio"
                  aria-checked={isChosen}
                  disabled={sAnswered}
                  onClick={() => !rev && answer(i)}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-xl border px-3.5 py-3 text-left text-[15px] leading-snug transition-colors focus-ring disabled:cursor-default",
                    !sAnswered && "hover:border-foreground/40 hover:bg-accent",
                    sAnswered && isRight && "border-success bg-success-soft",
                    sAnswered && isChosen && !isRight && "border-destructive bg-destructive-soft",
                    sAnswered && !isRight && !isChosen && "opacity-60",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-6 shrink-0 place-items-center rounded-full border text-[12px] font-semibold",
                      sAnswered && isRight ? "border-success bg-success text-success-foreground" : sAnswered && isChosen ? "border-destructive bg-destructive text-destructive-foreground" : "text-muted-foreground",
                    )}
                  >
                    {sAnswered && isRight ? <Check className="size-3.5" strokeWidth={3} /> : sAnswered && isChosen ? <X className="size-3.5" strokeWidth={3} /> : LETTERS[i]}
                  </span>
                  <span className="pt-0.5">{tidyOption(o)}</span>
                </button>
              );
            })}
          </div>

          {!rev && !answered && (
            <div className="mt-4 flex justify-end">
              <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={skip} data-no-bounce>
                Skip <ArrowRight />
              </Button>
            </div>
          )}
          {!rev && view && view.options.length < frozen.current && !answered && (
            <p className="mt-3 text-[12.5px] text-muted-foreground">Your slides only give {view?.options.length} good options for this one.</p>
          )}
          {sAnswered && (
            <div className="mt-5 animate-fade-up">
              <p className={cn("text-[15px] font-semibold", sCorrect ? "text-success" : "text-destructive")}>
                {rev ? (sCorrect ? "You got this right" : `You got this wrong. The answer is ${LETTERS[sView!.correct]}.`) : sCorrect ? "Correct" : `Not quite. The answer is ${LETTERS[sView!.correct]}.`}
              </p>
              <p className="mt-1 text-[14.5px] leading-relaxed text-foreground/85">{tidySentence(sq!.explanation)}</p>
              {!rev && !sCorrect && <p className="mt-1 text-[13px] text-muted-foreground">This one will come up again later.</p>}
              <div className="mt-5 flex items-center justify-between gap-3">
                {page ? (
                  <button type="button" onClick={() => onOpenNotes(page.id, sq!.materialId)} className="text-[13px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-ring">
                    See it in your notes
                  </button>
                ) : (
                  <span />
                )}
                {rev ? (
                  <Button onClick={goForward} data-no-bounce>
                    {viewIdx !== null && (viewIdx + 1 >= past.length || (currentInPast && viewIdx + 1 === past.length - 1)) ? "Back to current question" : "Next"} <ArrowRight />
                  </Button>
                ) : (
                  <Button ref={nextBtn} onClick={next} data-no-bounce>
                    Next question <ArrowRight />
                  </Button>
                )}
              </div>
            </div>
          )}
        </article>
      )}
    </div>
  );
}
