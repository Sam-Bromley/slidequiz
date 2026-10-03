import { BookOpen, Check, ChevronDown, CircleCheck, Copy, Crown, Eye, Lightbulb, ListChecks, MessageSquareText, PenLine, Plus, RefreshCw, Settings2, Trash2, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { toast } from "@/components/ui/toast";
import { confetti } from "@/lib/confetti";
import { Link, navigate } from "@/lib/router";
import { cn } from "@/lib/utils";
import { AIError, cloudEssayFeedback, cloudEssayQuestion, refreshAllowance } from "@/services/ai/cloud";
import {
  CONCLUSION_KEYS,
  INTRO_KEYS,
  POINT_KEYS,
  emptyPoint,
  essayMaterials,
  essayPlainText,
  essayWords,
  getEssay,
  introText,
  patchEssay,
  pointText,
  conclusionText,
  switchMode,
  wordCount,
} from "@/services/essays";
import { uid } from "@/lib/utils";
import type { EssayDraft, EssayLevel, EssayPoint, Material } from "@/types/models";

/* ---------------------------------------------------------------- what goes in each box */

type FieldDef = { key: string; label: string; hint: string; ph: string; optional?: boolean };

const INTRO_FIELDS: FieldDef[] = [
  { key: "context", label: "Background context", hint: "What the topic is and why it matters. Keep it brief: the detail goes in the body.", ph: "e.g. Antibiotic resistance is one of the fastest-growing threats to modern medicine…" },
  { key: "terms", label: "Key terms", hint: "Define the terms you'll use throughout.", ph: "e.g. Antibiotic resistance is the ability of bacteria to survive a drug that once killed them…" },
  { key: "problem", label: "The question or problem", hint: "What issue is the essay addressing?", ph: "e.g. This raises the question of which uses of antibiotics drive resistance most…" },
  { key: "scope", label: "Scope", hint: "What the essay covers, and sometimes what it won't.", ph: "e.g. This essay considers medicine and farming, but not…" },
  { key: "thesis", label: "Thesis statement", hint: "Your main argument in one clear, concise sentence.", ph: "e.g. Overuse in farming, more than in medicine, is the main driver of resistance." },
];
const POINT_FIELDS: FieldDef[] = [
  { key: "topic", label: "Topic sentence", hint: "The one main idea of this paragraph, flowing on from the last one.", ph: "e.g. Firstly, routine use in livestock exposes bacteria to low doses…" },
  { key: "evidence", label: "Evidence", hint: "Data, a study or an example that backs it up.", ph: "e.g. Around 70% of medically important antibiotics are sold for use in animals (Smith et al., 2021)." },
  { key: "explain", label: "Explanation", hint: "What the evidence shows and why it matters for your argument.", ph: "e.g. This suggests resistant strains are selected far more often on farms than in hospitals…" },
  { key: "link", label: "Link", hint: "How it supports your thesis and leads into the next point.", ph: "e.g. However, hospital prescribing also plays a part, as the next section shows." },
];
const CONCLUSION_FIELDS: FieldDef[] = [
  { key: "restate", label: "Restated thesis", hint: "Your argument again, in new words (not copied from the introduction).", ph: "e.g. Overall, agricultural overuse is the leading cause of…" },
  { key: "findings", label: "Key findings", hint: "Sum up your main points. No new evidence here.", ph: "e.g. Higher sales, weaker regulation and direct spread into the food chain…" },
  { key: "implications", label: "Implications", hint: "Why do the findings matter in this subject?", ph: "e.g. This means policies that only target doctors are unlikely to…" },
  { key: "future", label: "Future directions", hint: "Unanswered questions or areas for further research.", ph: "e.g. Further research could measure…", optional: true },
  { key: "final", label: "Final sentence", hint: "A strong last line that shows why your argument matters.", ph: "e.g. Without action on farms, …" },
];

const TIPS = {
  intro: {
    role: "Explains the focus and why the subject matters.",
    do: ["Start broad, then narrow down to your focus", "Set the stage; don't tell the whole story", "Formal, objective language", "Keep it concise: about 10–15% of the words"],
    avoid: ["Starting with a dictionary definition", "Vague openers like “In this essay I will talk about…”", "Results or conclusions (they come later)", "Unsupported claims or opinions", "Too much background", "Forgetting the thesis statement", "Exaggeration, like “the perfect solution”"],
  },
  body: {
    role: "Builds your argument, point by point, with evidence.",
    do: ["One main idea per point", "Back every point with evidence", "Explain what the evidence means", "Use transitions: “Furthermore”, “In contrast”, “As a result”", "Be concise and precise", "Make the relevance clear"],
    avoid: ["Several ideas in one paragraph", "Evidence without explaining why it matters", "Paragraphs that are too short or too long", "Not linking back to your argument", "Informal or chatty language"],
  },
  conclusion: {
    role: "Wraps up your argument and reinforces your key points.",
    do: ["Keep it to about one paragraph (around 10%)", "No new information or evidence", "Formal, objective language", "End with a strong final sentence"],
    avoid: ["Repeating the introduction word for word", "New data, citations or arguments", "Ending abruptly", "Vague lines like “In conclusion, microbiology is important”", "Unsupported claims or opinions"],
  },
};

const SCIENCE = /biolog|chemi|physic|science|medic|microbio|biochem|genetic|ecolog|anatom|physiol|pharma|neuro|psycholog|biomed|nursing|immun/i;
const LEVELS: { value: EssayLevel; label: string }[] = [
  { value: "gcse", label: "GCSE" },
  { value: "alevel", label: "A-level" },
  { value: "uni", label: "University" },
];
const DEFAULT_WORDS: Record<EssayLevel, number> = { gcse: 800, alevel: 1500, uni: 2000 };

const filled = (t: string) => wordCount(t) >= 3;

function aiMessage(e: unknown) {
  const err = e as AIError;
  if (err?.message === "busy") return "SlideQuiz is very busy right now. Try again in a little while.";
  return (err?.message ?? "Something went wrong.").replace(/\s*\(\d{3}\)$/, "");
}

/* ---------------------------------------------------------------- a writing box */

/** A textarea that grows with its text and saves shortly after you stop typing. */
function Box({ id, value, onCommit, placeholder, className, minRows = 2, label }: { id?: string; value: string; onCommit: (v: string) => void; placeholder?: string; className?: string; minRows?: number; label?: string }) {
  const [v, setV] = useState(value);
  const ref = useRef<HTMLTextAreaElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef(value);
  const focused = useRef(false);
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;
  useEffect(() => {
    if (!focused.current) setV(value);
  }, [value]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [v]);
  // Save anything still waiting when the box goes away.
  useEffect(
    () => () => {
      if (timer.current !== undefined) {
        clearTimeout(timer.current);
        commitRef.current(latest.current);
      }
    },
    [],
  );
  const flush = () => {
    if (timer.current !== undefined) clearTimeout(timer.current);
    timer.current = undefined;
    commitRef.current(latest.current);
  };
  return (
    <textarea
      ref={ref}
      id={id}
      aria-label={label}
      value={v}
      rows={minRows}
      placeholder={placeholder}
      onFocus={() => (focused.current = true)}
      onBlur={() => {
        focused.current = false;
        if (latest.current !== value) flush();
      }}
      onChange={(e) => {
        setV(e.target.value);
        latest.current = e.target.value;
        if (timer.current !== undefined) clearTimeout(timer.current);
        timer.current = window.setTimeout(() => {
          timer.current = undefined;
          commitRef.current(latest.current);
        }, 400);
      }}
      className={cn("block w-full resize-none overflow-hidden rounded-xl border bg-background px-3.5 py-2.5 text-[14.5px] leading-relaxed placeholder:text-muted-foreground/60 focus-ring", className)}
    />
  );
}

function Note({ text }: { text: string }) {
  return (
    <p className="mt-1.5 flex gap-2 rounded-lg bg-warning-soft/70 px-3 py-2 text-[13px] leading-snug">
      <MessageSquareText className="mt-0.5 size-3.5 shrink-0 text-warning" />
      <span>{text}</span>
    </p>
  );
}

/** One small box with its label, hint, tick and any feedback for it. */
function Field({ f, value, onCommit, notes, boxId }: { f: FieldDef; value: string; onCommit: (v: string) => void; notes: string[]; boxId: string }) {
  const done = filled(value);
  return (
    <div>
      <label htmlFor={boxId} className="mb-1 flex items-center gap-2">
        <span className={cn("grid size-4 shrink-0 place-items-center rounded-full border transition-colors", done ? "border-success bg-success text-white" : "border-muted-foreground/40")} aria-hidden>
          {done && <Check className="size-3" strokeWidth={3} />}
        </span>
        <span className="text-[13.5px] font-semibold">{f.label}</span>
        {f.optional && <span className="text-[12px] text-muted-foreground">optional</span>}
        <span className="sr-only">{done ? "(filled in)" : "(not filled in yet)"}</span>
      </label>
      <p className="mb-1.5 pl-6 text-[12.5px] text-muted-foreground">{f.hint}</p>
      <div className="pl-6">
        <Box id={boxId} value={value} onCommit={onCommit} placeholder={f.ph} />
        {notes.map((n, i) => (
          <Note key={i} text={n} />
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- sections */

function Tips({ which }: { which: keyof typeof TIPS }) {
  const t = TIPS[which];
  return (
    <div className="grid gap-3 rounded-xl bg-subtle/70 p-3.5 text-[13px] sm:grid-cols-2">
      <div>
        <p className="mb-1 font-semibold text-success">Do</p>
        <ul className="space-y-1">
          {t.do.map((x) => (
            <li key={x} className="flex gap-1.5">
              <Check className="mt-0.5 size-3.5 shrink-0 text-success" />
              {x}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="mb-1 font-semibold text-destructive">Avoid</p>
        <ul className="space-y-1">
          {t.avoid.map((x) => (
            <li key={x} className="flex gap-1.5">
              <X className="mt-0.5 size-3.5 shrink-0 text-destructive" />
              {x}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Section({ id, title, role, progress, words, tips, children, defaultOpen = true }: { id: string; title: string; role?: string; progress?: string; words?: ReactNode; tips?: keyof typeof TIPS; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [showTips, setShowTips] = useState(false);
  return (
    <section className="rounded-2xl border bg-card" aria-labelledby={`${id}-h`}>
      <div className="flex items-center gap-2 px-4 py-3 sm:px-5">
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls={`${id}-body`} className="flex min-w-0 flex-1 items-center gap-2 rounded-lg text-left focus-ring">
          <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", !open && "-rotate-90")} />
          <span className="min-w-0">
            <span id={`${id}-h`} className="block text-[15.5px] font-semibold">
              {title}
            </span>
            {role && <span className="block truncate text-[12.5px] text-muted-foreground">{role}</span>}
          </span>
        </button>
        {progress && <span className="shrink-0 rounded-md bg-secondary px-2 py-0.5 text-[12px] font-medium tabular-nums text-secondary-foreground">{progress}</span>}
        {words && <span className="hidden shrink-0 text-[12px] tabular-nums text-muted-foreground sm:inline">{words}</span>}
        {tips && (
          <Button variant="ghost" size="xs" onClick={() => (setShowTips(!showTips), setOpen(true))} aria-pressed={showTips} className="text-muted-foreground">
            <Lightbulb /> Tips
          </Button>
        )}
      </div>
      {open && (
        <div id={`${id}-body`} className="space-y-4 border-t px-4 pb-5 pt-4 sm:px-5">
          {tips && showTips && <Tips which={tips} />}
          {children}
        </div>
      )}
    </section>
  );
}

/* ---------------------------------------------------------------- feedback */

const BOX_LABEL = (box: string) => {
  const [a, b] = box.split(".");
  const part = (defs: FieldDef[]) => defs.find((f) => f.key === b)?.label;
  if (a === "intro") return b ? `Introduction · ${part(INTRO_FIELDS) ?? b}` : "Introduction";
  if (a === "conclusion") return b ? `Conclusion · ${part(CONCLUSION_FIELDS) ?? b}` : "Conclusion";
  const m = a.match(/^point(\d+)$/);
  if (m) return b ? `Point ${m[1]} · ${part(POINT_FIELDS) ?? b}` : `Point ${m[1]}`;
  return { references: "References", flow: "Flow", style: "Style", question: "The question" }[a] ?? box;
};

function FeedbackPanel({ e, onAgain, busy }: { e: EssayDraft; onAgain: () => void; busy: boolean }) {
  const f = e.feedback!;
  // Notes that don't sit under a box on the page are listed here.
  const shown = new Set(visibleBoxes(e));
  const loose = f.notes.filter((n) => !shown.has(n.box));
  return (
    <section className="rounded-2xl border border-primary/25 bg-card p-4 sm:p-5" aria-label="Feedback">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
          <ListChecks className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold">Feedback</p>
          <p className="mt-1 text-[14px] leading-relaxed">{f.overall}</p>
        </div>
        <Button variant="ghost" size="icon-sm" aria-label="Hide feedback" onClick={() => patchEssay(e.id, { feedback: undefined })}>
          <X />
        </Button>
      </div>
      {f.strengths.length > 0 && (
        <ul className="mt-3 space-y-1 pl-12 text-[13.5px]">
          {f.strengths.map((s, i) => (
            <li key={i} className="flex gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-success" />
              {s}
            </li>
          ))}
        </ul>
      )}
      {loose.length > 0 && (
        <ul className="mt-3 space-y-1.5 pl-12">
          {loose.map((n, i) => (
            <li key={i} className="rounded-lg bg-warning-soft/70 px-3 py-2 text-[13px] leading-snug">
              <span className="font-semibold">{BOX_LABEL(n.box)}: </span>
              {n.text}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2 pl-12 text-[12.5px] text-muted-foreground">
        {f.notes.length - loose.length > 0 && <span>The other notes are under the boxes they're about.</span>}
        <Button variant="outline" size="xs" onClick={onAgain} loading={busy} className="ml-auto">
          <RefreshCw /> Check again
        </Button>
      </div>
    </section>
  );
}

/** Boxes on the page right now, so feedback for them is shown in place. */
function visibleBoxes(e: EssayDraft): string[] {
  if (e.mode === "simple") return ["intro", ...e.points.map((_, i) => `point${i + 1}`), "conclusion", "references"];
  return [...INTRO_KEYS.map((k) => `intro.${k}`), ...e.points.flatMap((_, i) => POINT_KEYS.map((k) => `point${i + 1}.${k}`)), ...CONCLUSION_KEYS.map((k) => `conclusion.${k}`), "intro", "conclusion", ...e.points.map((_, i) => `point${i + 1}`), "references"];
}

/* ---------------------------------------------------------------- the editor */

export function EssayEditor({ essay: e, materials }: { essay: EssayDraft; materials: Material[] }) {
  const [genBusy, setGenBusy] = useState(false);
  const [fbBusy, setFbBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const [settings, setSettings] = useState(false);
  const notesFor = (box: string) => (e.feedback?.notes ?? []).filter((n) => n.box === box).map((n) => n.text);
  const w = essayWords(e);
  const target = e.words || DEFAULT_WORDS[e.level ?? "uni"];
  const pct = (n: number) => (w.total ? Math.round((n / w.total) * 100) : 0);
  const sci = materials.some((m) => SCIENCE.test(m.subject ?? "") || SCIENCE.test(m.title));

  const generate = async () => {
    setGenBusy(true);
    try {
      const qs = await cloudEssayQuestion(getEssay(e.id)!, materials);
      patchEssay(e.id, (cur) => ({
        question: qs[0],
        ideas: [...qs.slice(1), ...(cur.question.trim() ? [cur.question.trim()] : []), ...(cur.ideas ?? [])].filter((q, i, a) => a.indexOf(q) === i && q !== qs[0]).slice(0, 6),
        asked: [...(cur.asked ?? []), ...qs].slice(-40),
      }));
    } catch (err) {
      toast.error(aiMessage(err));
    } finally {
      setGenBusy(false);
      refreshAllowance();
    }
  };

  const feedback = async () => {
    setFbBusy(true);
    try {
      // Make sure the very latest typing is saved first.
      (document.activeElement as HTMLElement | null)?.blur();
      await new Promise((r) => setTimeout(r, 30));
      const f = await cloudEssayFeedback(getEssay(e.id)!, materials);
      patchEssay(e.id, { feedback: f });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      toast.error(aiMessage(err));
    } finally {
      setFbBusy(false);
      refreshAllowance();
    }
  };

  const setIntro = (k: string) => (v: string) => patchEssay(e.id, (cur) => ({ intro: { ...cur.intro, [k]: v } }));
  const setConclusion = (k: string) => (v: string) => patchEssay(e.id, (cur) => ({ conclusion: { ...cur.conclusion, [k]: v } }));
  const setPoint = (pid: string, k: keyof EssayPoint) => (v: string) => patchEssay(e.id, (cur) => ({ points: cur.points.map((p) => (p.id === pid ? { ...p, [k]: v } : p)) }));

  const introDone = INTRO_KEYS.filter((k) => filled(e.intro[k])).length;
  const concDone = CONCLUSION_KEYS.filter((k) => k !== "future" && filled(e.conclusion[k])).length;
  const canCheck = !!e.question.trim() && w.total >= 25;

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-16">
      {/* The question */}
      <section className="rounded-2xl border bg-card p-4 sm:p-5" aria-label="Essay question">
        <div className="mb-2 flex items-center gap-2">
          <label htmlFor="essay-q" className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
            Essay question
          </label>
          <span className="ml-auto" />
          <Button variant="ghost" size="xs" className="text-muted-foreground" onClick={() => setSettings(true)}>
            <Settings2 /> {LEVELS.find((l) => l.value === (e.level ?? "uni"))?.label} · {target} words
          </Button>
        </div>
        <Box id="essay-q" value={e.question} onCommit={(v) => patchEssay(e.id, { question: v })} placeholder="Type your essay question, or generate one from your lectures" className="border-0 bg-transparent px-0 py-1 text-[17px] font-semibold leading-snug shadow-none focus-visible:ring-0" minRows={1} />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant={e.question.trim() ? "outline" : "default"} size="sm" onClick={generate} loading={genBusy}>
            {e.question.trim() ? <RefreshCw /> : <PenLine />} {e.question.trim() ? "Another question" : "Generate a question"}
          </Button>
          <Button
            variant={e.completed ? "subtle" : "ghost"}
            size="sm"
            aria-pressed={!!e.completed}
            onClick={() => {
              patchEssay(e.id, { completed: !e.completed });
              if (!e.completed) {
                confetti({ count: 60 });
                toast("Marked as completed");
              }
            }}
          >
            <CircleCheck /> {e.completed ? "Completed" : "Mark as completed"}
          </Button>
        </div>
        {(e.ideas?.length ?? 0) > 0 && (
          <div className="mt-3">
            <p className="mb-1.5 text-[12px] text-muted-foreground">Other questions you could use:</p>
            <div className="flex flex-col gap-1.5">
              {e.ideas!.slice(0, 4).map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => patchEssay(e.id, (cur) => ({ question: q, ideas: [...(cur.question.trim() ? [cur.question.trim()] : []), ...(cur.ideas ?? []).filter((x) => x !== q)] }))}
                  className="rounded-lg border px-3 py-2 text-left text-[13.5px] transition-colors hover:bg-accent focus-ring"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        {materials.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {materials.map((m) => (
              <Link key={m.id} to={`/materials/${m.id}`} className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[12px] text-muted-foreground hover:text-foreground focus-ring">
                <BookOpen className="size-3" /> {m.title}
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Tools */}
      <div className="sticky top-14 z-20 -mx-1 flex flex-wrap items-center gap-2 rounded-2xl bg-background/80 px-1 py-2 backdrop-blur-md lg:top-0">
        <Segmented
          size="sm"
          label="How to write"
          value={e.mode}
          onChange={(m) => patchEssay(e.id, (cur) => switchMode(cur, m))}
          options={[
            { value: "guided", label: "Guided", hint: "Small boxes for each part" },
            { value: "simple", label: "Simple", hint: "One box per section" },
          ]}
        />
        <span className={cn("text-[12.5px] tabular-nums", w.total > target * 1.1 ? "text-warning" : "text-muted-foreground")}>
          {w.total} / {target} words
        </span>
        <span className="ml-auto" />
        <Button variant="outline" size="sm" onClick={() => setPreview(true)} disabled={!w.total}>
          <Eye /> Preview
        </Button>
        <Button size="sm" onClick={feedback} loading={fbBusy} disabled={!canCheck} title={canCheck ? undefined : "Add a question and write a little first"}>
          <ListChecks /> Get feedback
        </Button>
      </div>

      {e.feedback && <FeedbackPanel e={e} onAgain={feedback} busy={fbBusy} />}

      {/* Introduction */}
      <Section
        id="sec-intro"
        title="Introduction"
        role={TIPS.intro.role}
        tips="intro"
        progress={e.mode === "guided" ? `${introDone}/5` : undefined}
        words={<WordGuide n={w.intro} p={pct(w.intro)} aim={[10, 15]} total={w.total} />}
      >
        {e.mode === "guided" ? (
          INTRO_FIELDS.map((f) => <Field key={f.key} f={f} boxId={`intro-${f.key}`} value={e.intro[f.key as keyof typeof e.intro]} onCommit={setIntro(f.key)} notes={notesFor(`intro.${f.key}`)} />)
        ) : (
          <SimpleBox value={e.intro.text} onCommit={setIntro("text")} label="Introduction" ph="Background, key terms, the question, scope, and your thesis statement…" />
        )}
        {notesFor("intro").map((n, i) => (
          <Note key={i} text={n} />
        ))}
      </Section>

      {/* Body */}
      <Section id="sec-body" title="Body" role={TIPS.body.role} tips="body" progress={`${e.points.length} ${e.points.length === 1 ? "point" : "points"}`} words={`${w.body} words`}>
        {e.points.map((p, i) => (
          <PointCard key={p.id} e={e} p={p} n={i + 1} words={w.points[i]} setPoint={setPoint} notesFor={notesFor} />
        ))}
        <Button variant="outline" size="sm" onClick={() => patchEssay(e.id, (cur) => ({ points: [...cur.points, emptyPoint()] }))}>
          <Plus /> Add point
        </Button>
      </Section>

      {/* Conclusion */}
      <Section
        id="sec-conclusion"
        title="Conclusion"
        role={TIPS.conclusion.role}
        tips="conclusion"
        progress={e.mode === "guided" ? `${concDone}/4` : undefined}
        words={<WordGuide n={w.conclusion} p={pct(w.conclusion)} aim={[8, 12]} total={w.total} />}
      >
        {e.mode === "guided" ? (
          CONCLUSION_FIELDS.map((f) => <Field key={f.key} f={f} boxId={`conc-${f.key}`} value={e.conclusion[f.key as keyof typeof e.conclusion]} onCommit={setConclusion(f.key)} notes={notesFor(`conclusion.${f.key}`)} />)
        ) : (
          <SimpleBox value={e.conclusion.text} onCommit={setConclusion("text")} label="Conclusion" ph="Restate your thesis, sum up your points, say why it matters, and finish strongly…" />
        )}
        {notesFor("conclusion").map((n, i) => (
          <Note key={i} text={n} />
        ))}
      </Section>

      {/* References */}
      <Section id="sec-refs" title="References" role="One source per box, in the style your course uses." progress={`${e.references.filter((r) => r.text.trim()).length}`}>
        <ul className="space-y-2">
          {e.references.map((r, i) => (
            <li key={r.id} className="flex items-start gap-2">
              <span className="mt-2.5 w-5 shrink-0 text-right text-[12.5px] tabular-nums text-muted-foreground">{i + 1}.</span>
              <Box
                value={r.text}
                minRows={1}
                label={`Reference ${i + 1}`}
                placeholder="e.g. Smith, J. et al. (2021) Antibiotic use in livestock. Journal of Microbiology, 12(3), pp. 45–60."
                onCommit={(v) => patchEssay(e.id, (cur) => ({ references: cur.references.map((x) => (x.id === r.id ? { ...x, text: v } : x)) }))}
              />
              {e.references.length > 1 && (
                <Button variant="ghost" size="icon-sm" className="mt-1 text-muted-foreground" aria-label={`Remove reference ${i + 1}`} onClick={() => patchEssay(e.id, (cur) => ({ references: cur.references.filter((x) => x.id !== r.id) }))}>
                  <X />
                </Button>
              )}
            </li>
          ))}
        </ul>
        <Button variant="outline" size="sm" onClick={() => patchEssay(e.id, (cur) => ({ references: [...cur.references, { id: uid("ref"), text: "" }] }))}>
          <Plus /> Add reference
        </Button>
        {notesFor("references").map((n, i) => (
          <Note key={i} text={n} />
        ))}
      </Section>

      <StyleGuide science={sci} />

      {preview && <PreviewDialog e={e} onClose={() => setPreview(false)} />}
      {settings && <SettingsDialog e={e} onClose={() => setSettings(false)} />}
    </div>
  );
}

function WordGuide({ n, p, aim, total }: { n: number; p: number; aim: [number, number]; total: number }) {
  const off = total >= 200 && (p < aim[0] - 3 || p > aim[1] + 3);
  return (
    <span className={cn(off && "text-warning")} title={`Aim for about ${aim[0]}–${aim[1]}% of your words`}>
      {n} words{total >= 100 ? ` · ${p}%` : ""}
    </span>
  );
}

function SimpleBox({ value, onCommit, label, ph }: { value: string; onCommit: (v: string) => void; label: string; ph: string }) {
  return <Box value={value} onCommit={onCommit} label={label} placeholder={ph} minRows={5} />;
}

function PointCard({ e, p, n, words, setPoint, notesFor }: { e: EssayDraft; p: EssayPoint; n: number; words: number; setPoint: (pid: string, k: keyof EssayPoint) => (v: string) => void; notesFor: (box: string) => string[] }) {
  const done = POINT_KEYS.filter((k) => filled(p[k])).length;
  return (
    <div className="rounded-xl border p-3.5 sm:p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid size-6 place-items-center rounded-full bg-primary-soft text-[12px] font-bold text-primary">{n}</span>
        <span className="text-[14.5px] font-semibold">Point {n}</span>
        {e.mode === "guided" && <span className="rounded-md bg-secondary px-1.5 py-px text-[11.5px] tabular-nums text-secondary-foreground">{done}/4</span>}
        <span className="text-[12px] tabular-nums text-muted-foreground">{words} words</span>
        {e.points.length > 1 && (
          <Button
            variant="ghost"
            size="icon-sm"
            className="ml-auto text-muted-foreground hover:text-destructive"
            aria-label={`Remove point ${n}`}
            onClick={() => {
              const before = getEssay(e.id)!.points;
              patchEssay(e.id, (cur) => ({ points: cur.points.filter((x) => x.id !== p.id) }));
              toast.undo(`Point ${n} removed`, () => patchEssay(e.id, { points: before }));
            }}
          >
            <Trash2 />
          </Button>
        )}
      </div>
      <div className="space-y-4">
        {e.mode === "guided" ? (
          POINT_FIELDS.map((f) => <Field key={f.key} f={f} boxId={`p${p.id}-${f.key}`} value={p[f.key as keyof EssayPoint]} onCommit={setPoint(p.id, f.key as keyof EssayPoint)} notes={notesFor(`point${n}.${f.key}`)} />)
        ) : (
          <SimpleBox value={p.text} onCommit={setPoint(p.id, "text")} label={`Point ${n}`} ph="Topic sentence, evidence, what it shows, and a link to the next point…" />
        )}
        {notesFor(`point${n}`).map((t, i) => (
          <Note key={i} text={t} />
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- style guide, preview, settings */

function StyleGuide({ science }: { science: boolean }) {
  const [open, setOpen] = useState(false);
  const List = ({ items, ok }: { items: string[]; ok: boolean }) => (
    <ul className="space-y-1">
      {items.map((x) => (
        <li key={x} className="flex gap-1.5">
          {ok ? <Check className="mt-0.5 size-3.5 shrink-0 text-success" /> : <X className="mt-0.5 size-3.5 shrink-0 text-destructive" />}
          <span>{x}</span>
        </li>
      ))}
    </ul>
  );
  return (
    <section className="rounded-2xl border bg-card">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-2 rounded-2xl px-4 py-3 text-left focus-ring sm:px-5">
        <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", !open && "-rotate-90")} />
        <span className="text-[15px] font-semibold">Style guide</span>
        <span className="text-[12.5px] text-muted-foreground">Flow, writing style{science ? ", figures and tables" : ""}</span>
      </button>
      {open && (
        <div className="space-y-5 border-t px-4 pb-5 pt-4 text-[13.5px] sm:px-5">
          <div>
            <p className="mb-1 font-semibold">A coherent narrative</p>
            <p className="mb-2 text-muted-foreground">Each paragraph is a mini essay: its topic sentence flows from the last paragraph, and its last sentence links to the next. The reader should always see how each part supports your argument.</p>
            <List ok items={["Start every paragraph with a topic sentence", "Put points in an order where each builds on the last", "Use transitions: “In contrast…”, “Furthermore…”, “This leads to…”", "Stay on topic: every paragraph supports your thesis", "Define key terms early and use them consistently", "Keep linking back to your thesis"]} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-1 font-semibold text-success">{science ? "Scientific style: do" : "Academic style: do"}</p>
              <List
                ok
                items={
                  science
                    ? ["Third person (they, it, Smith et al.)", "Past tense", "Correct grammar and spelling", "Define abbreviations once: Polymerase Chain Reaction (PCR), then PCR", "Italicise species names with a capital genus: Escherichia coli, then E. coli"]
                    : ["Formal, objective language", "Third person where you can", "Correct grammar and spelling", "Define abbreviations the first time you use them", "Support claims with evidence or sources"]
                }
              />
            </div>
            <div>
              <p className="mb-1 font-semibold text-destructive">Avoid</p>
              <List ok={false} items={["Clichés (“stand out like a sore thumb”)", "Contractions (don't, it's)", "Subjective descriptions (“a fascinating discovery”)", "Over-complicated language", "Mixing tenses", "First person (“I propose that”)", "“It is believed that…”"]} />
            </div>
          </div>
          {science && (
            <div>
              <p className="mb-1 font-semibold">Figures and tables</p>
              <List ok items={["Only include them if they add value", "Clear title and caption: below a figure, above a table", "Number them in order and refer to them in the text", "Make them self-explanatory", "Ideally make your own; if copied, cite the source at the end of the legend"]} />
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function PreviewDialog({ e, onClose }: { e: EssayDraft; onClose: () => void }) {
  const refs = e.references.map((r) => r.text.trim()).filter(Boolean);
  const paras = [introText(e), ...e.points.map((p) => pointText(e, p)), conclusionText(e)].filter(Boolean);
  const w = essayWords(e);
  return (
    <Dialog
      open
      onClose={onClose}
      title="Your essay"
      description={`${w.total} words`}
      size="xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button
            onClick={() => {
              navigator.clipboard?.writeText(essayPlainText(e)).then(
                () => toast("Copied"),
                () => toast.error("Couldn't copy. Select the text instead."),
              );
            }}
          >
            <Copy /> Copy text
          </Button>
        </>
      }
    >
      <article className="space-y-4 text-[15px] leading-[1.75]">
        {e.question.trim() && <h3 className="text-[16.5px] font-semibold leading-snug">{e.question.trim()}</h3>}
        {paras.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
        {!paras.length && <p className="text-muted-foreground">Nothing written yet.</p>}
        {refs.length > 0 && (
          <div>
            <p className="font-semibold">References</p>
            <ul className="mt-1 space-y-1 text-[13.5px]">
              {refs.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        )}
      </article>
    </Dialog>
  );
}

function SettingsDialog({ e, onClose }: { e: EssayDraft; onClose: () => void }) {
  const [level, setLevel] = useState<EssayLevel>(e.level ?? "uni");
  const [words, setWords] = useState(String(e.words ?? ""));
  const [rubric, setRubric] = useState(e.rubric ?? "");
  return (
    <Dialog
      open
      onClose={onClose}
      title="Essay settings"
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              const n = Math.round(Number(words));
              patchEssay(e.id, { level, words: n >= 100 && n <= 20000 ? n : undefined, rubric: rubric.trim() || undefined });
              onClose();
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label htmlFor="es-level" className="mb-1.5 block text-[13px] font-medium">
            Level
          </label>
          <Select id="es-level" value={level} onChange={(x) => setLevel(x.target.value as EssayLevel)}>
            {LEVELS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label htmlFor="es-words" className="mb-1.5 block text-[13px] font-medium">
            Word count
          </label>
          <Input id="es-words" inputMode="numeric" value={words} onChange={(x) => setWords(x.target.value.replace(/\D/g, ""))} placeholder={`${DEFAULT_WORDS[level]}`} />
        </div>
        <div>
          <label htmlFor="es-rubric" className="mb-1.5 block text-[13px] font-medium">
            Your marking criteria <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <textarea
            id="es-rubric"
            value={rubric}
            onChange={(x) => setRubric(x.target.value)}
            rows={5}
            placeholder="Paste your mark scheme or assessment criteria, and questions and feedback will be aimed at it."
            className="block w-full rounded-xl border bg-background px-3.5 py-2.5 text-[14px] leading-relaxed placeholder:text-muted-foreground/60 focus-ring"
          />
        </div>
      </div>
    </Dialog>
  );
}

/* ---------------------------------------------------------------- free users */

export function EssaysTeaser() {
  return (
    <section className="relative overflow-hidden rounded-2xl border bg-card" aria-label="Essays">
      <div className="pointer-events-none select-none space-y-3 p-5 opacity-70 blur-[3px]" aria-hidden>
        <p className="text-[16px] font-semibold">To what extent is overuse in farming the main cause of antibiotic resistance?</p>
        <div className="rounded-xl border p-3 text-[13.5px]">
          <p className="font-semibold">Thesis statement</p>
          <p className="mt-1 text-muted-foreground">Overuse in farming, more than in medicine, is the main driver of resistance.</p>
        </div>
        <div className="rounded-xl border p-3 text-[13.5px]">
          <p className="font-semibold">Point 1 · Evidence</p>
          <p className="mt-1 text-muted-foreground">Around 70% of medically important antibiotics are sold for use in animals…</p>
        </div>
        <div className="rounded-xl bg-warning-soft/70 p-3 text-[13px]">Explain what this figure shows for your argument, not just the number.</div>
      </div>
      <div className="absolute inset-0 grid place-items-center bg-gradient-to-b from-card/40 via-card/80 to-card p-6">
        <div className="max-w-sm text-center">
          <span className="mx-auto grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-sm">
            <PenLine className="size-5" />
          </span>
          <h2 className="mt-3 text-[17px] font-semibold">Essays are part of Pro</h2>
          <p className="mt-1.5 text-[13.5px] text-muted-foreground">Get essay questions on your lectures, plan and write them step by step, and get feedback on every part: your thesis, each point, your conclusion and your style.</p>
          <Button className="mt-4" onClick={() => navigate("/pro")}>
            <Crown /> See Pro
          </Button>
        </div>
      </div>
    </section>
  );
}

export { essayMaterials };
