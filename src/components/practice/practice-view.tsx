import { ArrowLeft, ArrowRight, Check, ChevronDown, Loader2, Plus, RotateCcw, Shuffle, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { AIError, cloudMoreQuestions, refreshAllowance } from "@/services/ai/cloud";
import { cn } from "@/lib/utils";
import { endSentence, optionsAreSentences, tidyOption, tidyQuestion, tidySentence } from "@/lib/tidy";
import { AIWaiting, hasText } from "@/components/ai/ai-waiting";
import { confetti } from "@/lib/confetti";
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

/** `chosen` is null for a question that was skipped. */
type PastAnswer = { qid: ID; view: { options: string[]; correct: number }; chosen: number | null };
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

  // Rebuild the order when the topic filter or the question set changes. New questions being added
  // (e.g. "More questions") just join the end, so practice carries on without starting again.
  const filterKey = `${topicIds.join(",")}|${shuffle}`;
  const idsNow = topicQs.map((q) => q.id);
  const setKey = `${filterKey}|${idsNow.join(",")}`;
  const lastKey = useRef(setKey);
  const lastFilter = useRef(filterKey);
  const lastIds = useRef(idsNow);
  useEffect(() => {
    if (lastKey.current === setKey) return;
    lastKey.current = setKey;
    const prevIds = lastIds.current;
    lastIds.current = idsNow;
    if (lastFilter.current === filterKey) {
      const had = new Set(prevIds);
      const kept = prevIds.every((id) => idsNow.includes(id));
      if (kept) {
        const added = idsNow.filter((id) => !had.has(id));
        if (added.length) setQueue((qu) => [...qu, ...added.filter((id) => !qu.includes(id))]);
        return;
      }
    }
    lastFilter.current = filterKey;
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
  const sAnswered = rev ? rev.chosen !== null : answered;
  /** Looking back at a question that was skipped: it can still be answered here. */
  const revSkipped = !!rev && rev.chosen === null;
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
  const before = sq && !sAnswered ? sq.stats.lastResult : undefined;
  const qMaterial = sq ? (mixed ? mixed.find((m) => m.id === sq.materialId) : material) : undefined;
  const page = sq ? qMaterial?.pages.find((p) => p.id === sq.sources[0]?.pageId) : undefined;
  const topicName = sq ? (mixed ? qMaterial?.title : material.topics.find((t) => t.id === sq.topicId)?.name) : undefined;
  const coveredN = all.filter(isCovered).length;
  const prog = { total: all.length, covered: coveredN, review: all.filter(needsReview).length, pct: all.length ? Math.round((coveredN / all.length) * 100) : 0 };

  // Confetti: reaching 100% of this lecture, or finishing a round with a great score.
  const lastPct = useRef(prog.pct);
  useEffect(() => {
    if (prog.pct === 100 && lastPct.current < 100 && prog.total >= 3) confetti();
    lastPct.current = prog.pct;
  }, [prog.pct, prog.total]);
  const roundOver = all.length > 0 && !rev && !q;
  const celebrated = useRef(-1);
  useEffect(() => {
    const done = session.right + session.wrong;
    if (roundOver && celebrated.current !== round && done >= 5 && session.right / done >= 0.8 && prog.pct < 100) {
      celebrated.current = round;
      confetti({ count: 110 });
    }
  }, [roundOver, round, session.right, session.wrong, prog.pct]);

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

  /** Answering a skipped question after going back to it. */
  const answerPast = (i: number) => {
    if (viewIdx === null || !rev || rev.chosen !== null || !sq) return;
    const ok = i === rev.view.correct;
    setPast((ps) => ps.map((p, k) => (k === viewIdx ? { ...p, chosen: i } : p)));
    actions.answerPractice(sq.id, ok);
    setSession((s) => (ok ? { ...s, right: s.right + 1 } : { ...s, wrong: s.wrong + 1 }));
    // Got it right: no need for it to come back at the end of the round.
    if (ok)
      setQueue((qu) => {
        const at = qu.lastIndexOf(sq.id);
        return at > pos ? [...qu.slice(0, at), ...qu.slice(at + 1)] : qu;
      });
  };

  /** Skip this one for now: it comes back at the end of the round (and Back can still reach it). */
  const skip = () => {
    if (!q || !view) return;
    setPast((ps) => [...ps, { qid: q.id, view, chosen: null }]);
    setQueue((qu) => (pos + 1 < qu.length ? [...qu.slice(0, pos + 1), ...qu.slice(pos + 1), q.id] : qu));
    setChosen(null);
    setViewIdx(null);
    setPos((p) => p + 1);
  };

  /** Writing more questions (once everything's covered); they join the queue as each batch arrives. */
  const [making, setMaking] = useState(false);
  const makeMore = async () => {
    if (making || mixed) return;
    setMaking(true);
    try {
      const n = await cloudMoreQuestions(material.id);
      if (!n) toast("No new questions this time. Your slides may already be fully covered.");
    } catch (e) {
      const err = e as AIError;
      toast.error(err?.message === "busy" ? "SlideQuiz is very busy right now. Try again in a little while." : (err?.message ?? "Couldn't write more questions.").replace(/\s*\(\d{3}\)$/, ""));
    } finally {
      setMaking(false);
      refreshAllowance();
    }
  };

  /** Start this lecture's practice from scratch (with undo). */
  const resetProgress = () => {
    const undos = (mixed ? mixed.map((m) => m.id) : [material.id]).map((id) => actions.resetPractice(id));
    const keptPast = past;
    setPast(() => []);
    again();
    toast.undo("Progress reset", () => {
      undos.forEach((u) => u());
      setPast(() => keptPast);
    });
  };

  // Keep the question and what's said about the answer on screen, without having to scroll.
  const card = useRef<HTMLElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!sAnswered) return;
    const id = requestAnimationFrame(() => feedbackRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
    return () => cancelAnimationFrame(id);
  }, [sAnswered, viewIdx, qid]);
  // (Not when the page first opens: the controls at the top should stay in view then.)
  const firstShow = useRef(true);
  useEffect(() => {
    if (sAnswered) return;
    if (firstShow.current) {
      firstShow.current = false;
      return;
    }
    const id = requestAnimationFrame(() => card.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qid, pos, viewIdx]);

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
        if (revSkipped) {
          const k = e.key.toUpperCase();
          const i = /^[1-6]$/.test(k) ? Number(k) - 1 : LETTERS.indexOf(k);
          if (i >= 0 && i < rev.view.options.length) {
            e.preventDefault();
            answerPast(i);
            return;
          }
        }
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
        {prog.covered + prog.review > 0 && (
          <button type="button" onClick={resetProgress} title="Start this practice again from scratch" className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-full border bg-card px-3 text-[13px] text-muted-foreground transition-colors hover:text-foreground focus-ring">
            <RotateCcw className="size-3.5" /> Reset progress
          </button>
        )}
        <Pop label={`${count} options`} title="Answer options" align="right" className={cn(!(prog.covered + prog.review > 0) && "ml-auto")}>
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
          {making ? (
            <p className="mt-6 flex items-center justify-center gap-2 text-[14px] text-muted-foreground" aria-live="polite">
              <Loader2 className="size-4 animate-spin" /> Writing new questions… the first ones will appear here in a moment.
            </p>
          ) : (
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {!mixed && topicQs.every(isCovered) && (
                <Button onClick={makeMore}>
                  <Plus /> More questions
                </Button>
              )}
              <Button variant={!mixed && topicQs.every(isCovered) ? "outline" : "default"} onClick={again}>
                <RotateCcw /> Keep practising
              </Button>
            </div>
          )}
        </div>
      ) : (
        <article key={rev ? `past-${viewIdx}` : `${qid}-${pos}-${round}`} ref={card} className="animate-fade-up scroll-mt-20 scroll-mb-24 rounded-2xl border bg-card p-5 sm:p-6 lg:scroll-mb-6" aria-live="polite">
          <p className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-muted-foreground">
            {topicName && <span>{topicName}</span>}
            {before === "incorrect" && <span className="rounded-full bg-warning-soft px-2 py-0.5 font-medium text-warning">You got this wrong before</span>}
            {before === "correct" && <span className="rounded-full bg-success-soft px-2 py-0.5 font-medium text-success">You got this right before</span>}
            {rev && <span className="rounded-full bg-muted px-2 py-0.5 font-medium">{revSkipped ? "Skipped" : "Looking back"}</span>}
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
          <div className="mt-4 space-y-2" role="radiogroup" aria-label="Answers" data-no-bounce>
            {sView!.options.map((o, i, all) => {
              const sentences = optionsAreSentences(all);
              const isRight = i === sView!.correct;
              const isChosen = i === sChosen;
              return (
                <button
                  key={i}
                  type="button"
                  role="radio"
                  aria-checked={isChosen}
                  disabled={sAnswered}
                  onClick={() => (rev ? answerPast(i) : answer(i))}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-xl border px-3.5 py-2.5 text-left text-[15px] leading-snug transition-colors focus-ring disabled:cursor-default",
                    !sAnswered && "hover:border-foreground/40 hover:bg-accent",
                    sAnswered && isRight && "border-success bg-success-soft",
                    !rev && sAnswered && isRight && isChosen && "animate-correct-glow",
                    sAnswered && isChosen && !isRight && "border-destructive bg-destructive-soft",
                    !rev && sAnswered && isChosen && !isRight && "animate-shake",
                    sAnswered && !isRight && !isChosen && "opacity-60",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-6 shrink-0 place-items-center rounded-full border text-[12px] font-semibold",
                      sAnswered && isRight ? "border-success bg-success text-success-foreground" : sAnswered && isChosen ? "border-destructive bg-destructive text-destructive-foreground" : "text-muted-foreground",
                    )}
                  >
                    {sAnswered && isRight ? <Check className={cn("size-3.5", !rev && isChosen && "animate-tick-pop")} strokeWidth={3} /> : sAnswered && isChosen ? <X className="size-3.5" strokeWidth={3} /> : LETTERS[i]}
                  </span>
                  <span className="pt-0.5">{sentences ? endSentence(tidyOption(o)) : tidyOption(o)}</span>
                </button>
              );
            })}
          </div>

          {!sAnswered && (
            <div className="mt-4 flex items-center justify-between gap-2">
              <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={goBack} disabled={!canGoBack} data-no-bounce>
                <ArrowLeft /> Back
              </Button>
              {rev ? (
                <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={goForward} data-no-bounce>
                  {viewIdx !== null && (viewIdx + 1 >= past.length || (currentInPast && viewIdx + 1 === past.length - 1)) ? "Back to current question" : "Next"} <ArrowRight />
                </Button>
              ) : (
                <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={skip} data-no-bounce>
                  Skip <ArrowRight />
                </Button>
              )}
            </div>
          )}
          {!rev && view && view.options.length < frozen.current && !answered && (
            <p className="mt-3 text-[12.5px] text-muted-foreground">Your slides only give {view?.options.length} good options for this one.</p>
          )}
          {sAnswered && (
            <div ref={feedbackRef} className="mt-4 animate-fade-up scroll-mb-24 lg:scroll-mb-6">
              <p className={cn("text-[15px] font-semibold", sCorrect ? "text-success" : "text-destructive")}>
                {rev ? (sCorrect ? "You got this right" : `You got this wrong. The answer is ${LETTERS[sView!.correct]}.`) : sCorrect ? "Correct" : `Not quite. The answer is ${LETTERS[sView!.correct]}.`}
              </p>
              <p className="mt-1 text-[14.5px] leading-relaxed text-foreground/85">{tidySentence(sq!.explanation)}</p>
              {!rev && !sCorrect && <p className="mt-1 text-[13px] text-muted-foreground">This one will come up again later.</p>}
              <div className="mt-4 flex items-center justify-between gap-3">
                {page ? (
                  <button type="button" onClick={() => onOpenNotes(page.id, sq!.materialId)} className="text-[13px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-ring">
                    See it in your notes
                  </button>
                ) : (
                  <span />
                )}
                <div className="flex items-center gap-2">
                {canGoBack && (
                  <Button variant="ghost" className="text-muted-foreground" onClick={goBack} data-no-bounce>
                    <ArrowLeft /> Back
                  </Button>
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
            </div>
          )}
        </article>
      )}
    </div>
  );
}
