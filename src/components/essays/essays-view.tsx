import { ArrowDown, ArrowUp, Check, ClipboardList, Copy, Crown, Download, FileUp, Lightbulb, Loader2, PenLine, Pencil, Plus, RefreshCw, Scale, Star, Target, Trash2, X } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Shimmer } from "@/components/ui/shimmer";
import { toast } from "@/components/ui/toast";
import { navigate } from "@/lib/router";
import { cn } from "@/lib/utils";
import { AIError, cloudEssayPlan, cloudEssayQuestions, refreshAllowance } from "@/services/ai/cloud";
import { getSet, migrateMaterialEssays, patchQuestion, patchSet, setFor, setMaterials } from "@/services/essays";
import { exportDoc, type Block } from "@/services/export";
import { hasPlus, usePlanQuiet } from "@/services/plus";
import { useData } from "@/store/store";
import type { EssayLevel, EssayPlan, EssayQuestion, EssaySet, Material } from "@/types/models";
import { useEffect } from "react";

/* ---------------------------------------------------------------- state helpers */

const saveWork = (id: string, patch: Partial<EssaySet>) => patchSet(id, patch);
const patchQ = patchQuestion;
const work = (id: string) => getSet(id) ?? { questions: [] as EssayQuestion[] };

const LEVELS: { value: EssayLevel; label: string }[] = [
  { value: "gcse", label: "GCSE" },
  { value: "alevel", label: "A-level" },
  { value: "uni", label: "University" },
];

const DIFF: Record<string, string> = { easy: "bg-success-soft text-success", medium: "bg-warning-soft text-warning", hard: "bg-destructive-soft text-destructive" };

function aiMessage(e: unknown) {
  const err = e as AIError;
  if (err?.message === "busy") return "SlideQuiz is very busy right now. Try again in a little while.";
  return (err?.message ?? "Something went wrong.").replace(/\s*\(\d{3}\)$/, "");
}

/* ---------------------------------------------------------------- view */

/** The Essays tab on a lecture: its own essay set. */
export function EssaysView({ material }: { material: Material }) {
  usePlanQuiet();
  const plus = hasPlus();
  const data = useData();
  useEffect(() => {
    if (!plus) return;
    migrateMaterialEssays();
  }, [plus]);
  if (!plus) return <EssaysTeaser />;
  const set = (data.essays ?? []).find((x) => x.materialIds.length === 1 && x.materialIds[0] === material.id);
  if (!set) return <StartForMaterial material={material} />;
  return <EssaySetView set={set} />;
}

/** Makes the lecture's essay set the first time it's needed. */
function StartForMaterial({ material }: { material: Material }) {
  useEffect(() => {
    setFor([material.id], material.title);
  }, [material.id, material.title]);
  return null;
}

/** Questions and plans for an essay set. */
export function EssaySetView({ set }: { set: EssaySet }) {
  const w = set;
  const m = { id: set.id };
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState(!w.questions.length);
  const [filter, setFilter] = useState<"all" | "saved">("all");

  const generate = async () => {
    setBusy(true);
    try {
      const cur = getSet(set.id)!;
      const qs = await cloudEssayQuestions(setMaterials(cur), cur, cur.title, 6);
      if (!qs.length) throw new Error("No questions came back. Try again.");
      saveWork(m.id, { questions: [...qs, ...work(m.id).questions] });
      setSettings(false);
    } catch (e) {
      toast.error(aiMessage(e));
    } finally {
      setBusy(false);
      refreshAllowance();
    }
  };

  const list = w.questions.filter((q) => filter === "all" || q.saved);

  return (
    <div className="space-y-5">
      {settings ? (
        <EssaySetup set={set} busy={busy} onGenerate={generate} onClose={w.questions.length ? () => setSettings(false) : undefined} />
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setSettings(true)} className="inline-flex h-9 items-center gap-2 rounded-full border bg-card px-3.5 text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-ring">
            <ClipboardList className="size-4" />
            <span>
              {LEVELS.find((l) => l.value === (w.level ?? "uni"))?.label} · {w.marks ?? 25} marks{w.words ? ` · ${w.words} words` : ""} · {w.rubric ? (w.rubricName ?? "Your marking criteria") : "No marking criteria"}
            </span>
            <Pencil className="size-3.5" />
          </button>
          <div className="ml-auto flex items-center gap-2">
            {w.questions.some((q) => q.saved) && (
              <Segmented
                size="sm"
                label="Show"
                value={filter}
                onChange={setFilter}
                options={[
                  { value: "all", label: "All" },
                  { value: "saved", label: "Saved" },
                ]}
              />
            )}
            <Button variant="outline" size="sm" onClick={generate} loading={busy}>
              <Plus /> More questions
            </Button>
          </div>
        </div>
      )}

      {busy && !w.questions.length && <QuestionSkeletons />}
      {busy && w.questions.length > 0 && <QuestionSkeletons n={2} />}

      <ul className="space-y-3">
        {list.map((q) => (
          <EssayQuestionCard key={q.id} set={set} q={q} />
        ))}
      </ul>
      {filter === "saved" && !list.length && <p className="text-center text-[13.5px] text-muted-foreground">No saved questions yet. Tap the star on a question to keep it here.</p>}
    </div>
  );
}

function QuestionSkeletons({ n = 3 }: { n?: number }) {
  return (
    <div className="space-y-3" aria-label="Writing essay questions" aria-busy>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="rounded-2xl border bg-card p-4">
          <Shimmer className="h-4 w-24 rounded" />
          <Shimmer className="mt-3 h-4 w-11/12 rounded" />
          <Shimmer className="mt-2 h-4 w-2/3 rounded" />
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- setup */

function EssaySetup({ set, busy, onGenerate, onClose }: { set: EssaySet; busy: boolean; onGenerate: () => void; onClose?: () => void }) {
  const w = set;
  const m = { id: set.id };
  const [reading, setReading] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const readRubric = async (f: File) => {
    setReading(true);
    try {
      let text = "";
      if (/\.(txt|md)$/i.test(f.name) || f.type.startsWith("text/")) text = await f.text();
      else {
        const { parseFile } = await import("@/services/parsing");
        const doc = await parseFile(f);
        text = doc.pages.map((p) => [p.title, p.text].filter(Boolean).join("\n")).join("\n\n");
      }
      text = text.replace(/\n{3,}/g, "\n\n").trim();
      if (!text) throw new Error("empty");
      saveWork(m.id, { rubric: text.slice(0, 8000), rubricName: f.name });
      toast("Marking criteria added");
    } catch {
      toast.error("Couldn't read that file. Try a PDF, Word document or text file, or paste the criteria instead.");
    } finally {
      setReading(false);
    }
  };

  return (
    <section className="rounded-2xl border bg-card p-5 sm:p-6" aria-label="Essay settings">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
          <PenLine className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[16px] font-semibold">Essay practice</h2>
          <p className="mt-0.5 text-[13.5px] text-muted-foreground">Get essay questions on {set.materialIds.length > 1 ? `these ${set.materialIds.length} lectures` : "this lecture"}, then a plan for any of them, aimed at your marking criteria.</p>
        </div>
        {onClose && (
          <Button variant="ghost" size="icon" aria-label="Close settings" onClick={onClose}>
            <X />
          </Button>
        )}
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_auto_auto]">
        <Field label="Level">
          <Segmented label="Level" className="w-fit" value={w.level ?? "uni"} onChange={(v) => saveWork(m.id, { level: v })} options={LEVELS} />
        </Field>
        <Field label="Marks" htmlFor="essay-marks">
          <Input id="essay-marks" type="number" min={5} max={100} value={w.marks ?? 25} onChange={(e) => saveWork(m.id, { marks: Math.max(1, Math.min(100, Number(e.target.value) || 25)) })} className="w-24" />
        </Field>
        <Field label="Words (optional)" htmlFor="essay-words">
          <Input id="essay-words" type="number" min={100} max={10000} step={100} placeholder="e.g. 1500" value={w.words ?? ""} onChange={(e) => saveWork(m.id, { words: Number(e.target.value) || undefined })} className="w-32" />
        </Field>
      </div>

      <div className="mt-5">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <label htmlFor="essay-rubric" className="text-[13.5px] font-medium">
            Marking criteria <span className="font-normal text-muted-foreground">(optional, but makes it much better)</span>
          </label>
          <Button variant="ghost" size="sm" onClick={() => file.current?.click()} loading={reading}>
            <FileUp /> Upload
          </Button>
        </div>
        {w.rubric && w.rubricName ? (
          <div className="flex items-center gap-3 rounded-xl border bg-subtle px-3.5 py-2.5 text-[13.5px]">
            <Check className="size-4 text-success" />
            <span className="min-w-0 flex-1 truncate">{w.rubricName}</span>
            <button type="button" className="text-muted-foreground hover:text-foreground focus-ring rounded" aria-label="Remove marking criteria" onClick={() => saveWork(m.id, { rubric: undefined, rubricName: undefined })}>
              <X className="size-4" />
            </button>
          </div>
        ) : (
          <Textarea
            id="essay-rubric"
            value={w.rubric ?? ""}
            onChange={(e) => saveWork(m.id, { rubric: e.target.value.slice(0, 8000) || undefined, rubricName: undefined })}
            placeholder={"Paste your rubric, mark scheme or assessment objectives, e.g.\nAO1 Knowledge and understanding (8 marks)\nAO3 Analysis and evaluation (12 marks)…"}
            className="min-h-[104px] text-[13.5px]"
          />
        )}
        <input ref={file} type="file" accept=".pdf,.docx,.pptx,.txt,.md" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => (e.target.files?.[0] && readRubric(e.target.files[0]), (e.target.value = ""))} />
      </div>

      <div className="mt-5 flex justify-end">
        <Button onClick={onGenerate} loading={busy}>
          <PenLine /> {w.questions.length ? "Write more questions" : "Write essay questions"}
        </Button>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- question + plan */

function EssayQuestionCard({ set, q }: { set: EssaySet; q: EssayQuestion }) {
  const m = { id: set.id, title: set.title };
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const plan = async () => {
    setOpen(true);
    if (q.plan) return;
    await makePlan();
  };
  const makePlan = async () => {
    setBusy(true);
    try {
      const cur = getSet(set.id)!;
      const p = await cloudEssayPlan(setMaterials(cur), cur, cur.title, q);
      patchQ(m.id, q.id, { plan: p });
    } catch (e) {
      toast.error(aiMessage(e));
      if (!q.plan) setOpen(false);
    } finally {
      setBusy(false);
      refreshAllowance();
    }
  };

  return (
    <li className="overflow-hidden rounded-2xl border bg-card">
      <div className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-1.5 text-[11.5px] font-medium">
          {q.command && <span className="rounded-md bg-primary-soft px-2 py-0.5 text-primary">{q.command}</span>}
          {q.marks && <span className="rounded-md bg-secondary px-2 py-0.5 text-secondary-foreground">{q.marks} marks</span>}
          {q.difficulty && <span className={cn("rounded-md px-2 py-0.5 capitalize", DIFF[q.difficulty])}>{q.difficulty}</span>}
          {q.criteria.map((c) => (
            <span key={c} className="rounded-md border px-2 py-0.5 text-muted-foreground">
              {c}
            </span>
          ))}
          <span className="ml-auto flex items-center gap-0.5">
            <button
              type="button"
              aria-label={q.saved ? "Unsave question" : "Save question"}
              aria-pressed={!!q.saved}
              title={q.saved ? "Saved" : "Save"}
              onClick={() => patchQ(m.id, q.id, { saved: !q.saved })}
              className={cn("grid size-8 place-items-center rounded-lg hover:bg-accent focus-ring", q.saved ? "text-amber-500" : "text-muted-foreground")}
            >
              <Star className={cn("size-4", q.saved && "fill-current")} />
            </button>
            <button
              type="button"
              aria-label="Delete question"
              title="Delete"
              onClick={() => {
                const before = work(m.id).questions;
                saveWork(m.id, { questions: before.filter((x) => x.id !== q.id) });
                toast.undo("Question deleted", () => saveWork(m.id, { questions: before }));
              }}
              className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-destructive focus-ring"
            >
              <Trash2 className="size-4" />
            </button>
          </span>
        </div>
        <p className="mt-2.5 text-[16px] font-semibold leading-snug">{q.question}</p>
        {q.focus && <p className="mt-1 text-[13px] text-muted-foreground">{q.focus}</p>}
        <div className="mt-3.5">
          {open ? (
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Hide plan
            </Button>
          ) : (
            <Button variant={q.plan ? "outline" : "default"} size="sm" onClick={plan}>
              <ClipboardList /> {q.plan ? "View plan" : "Make a plan"}
            </Button>
          )}
        </div>
      </div>
      {open && (
        <div className="border-t bg-subtle/60 p-4 sm:p-5">
          {busy && !q.plan ? <PlanSkeleton /> : q.plan ? <PlanView set={set} q={q} plan={q.plan} busy={busy} onRedo={makePlan} /> : null}
        </div>
      )}
    </li>
  );
}

function PlanSkeleton() {
  return (
    <div className="space-y-3" aria-busy aria-label="Writing your plan">
      <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" /> Writing your plan…
      </p>
      <Shimmer className="h-14 w-full rounded-xl" />
      {[0, 1, 2].map((i) => (
        <Shimmer key={i} className="h-20 w-full rounded-xl" />
      ))}
    </div>
  );
}

/** A line of the plan that can be edited in place. */
function EditText({ value, onSave, editing, className, rows = 2 }: { value: string; onSave: (v: string) => void; editing: boolean; className?: string; rows?: number }) {
  if (!editing) return <p className={className}>{value}</p>;
  return <Textarea defaultValue={value} rows={rows} onBlur={(e) => e.target.value.trim() !== value && onSave(e.target.value.trim())} className={cn("min-h-0 text-[14px]", className)} />;
}

function PlanView({ set, q, plan, busy, onRedo }: { set: EssaySet; q: EssayQuestion; plan: EssayPlan; busy: boolean; onRedo: () => void }) {
  const m = { id: set.id, title: set.title };
  const [editing, setEditing] = useState(false);
  const upd = (patch: Partial<EssayPlan>) => patchQ(m.id, q.id, { plan: { ...plan, ...patch } });
  const setPara = (i: number, patch: Partial<EssayPlan["paragraphs"][number]>) => upd({ paragraphs: plan.paragraphs.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
  const move = (i: number, d: -1 | 1) => {
    const ps = [...plan.paragraphs];
    const j = i + d;
    if (j < 0 || j >= ps.length) return;
    [ps[i], ps[j]] = [ps[j], ps[i]];
    upd({ paragraphs: ps });
  };

  const doc = () => {
    const blocks: Block[] = [
      { kind: "p", text: `${q.marks ? q.marks + " marks · " : ""}${m.title}`, muted: true },
      { kind: "h2", text: "Argument" },
      { kind: "p", text: plan.thesis },
      { kind: "h2", text: "Introduction" },
      { kind: "p", text: plan.intro },
    ];
    plan.paragraphs.forEach((p, i) => {
      blocks.push({ kind: "h2", text: `Paragraph ${i + 1}${p.criteria.length ? ` (${p.criteria.join(", ")})` : ""}` });
      blocks.push({ kind: "p", text: p.point });
      blocks.push({ kind: "list", items: [...p.evidence.map((e) => `${e.text}${e.label ? ` (${e.label})` : ""}`), ...(p.analysis ? [`Why it matters: ${p.analysis}`] : [])] });
    });
    if (plan.counter) {
      blocks.push({ kind: "h2", text: "The other side" });
      blocks.push({ kind: "list", items: [`Counter-argument: ${plan.counter.point}`, `Response: ${plan.counter.response}`] });
    }
    blocks.push({ kind: "h2", text: "Conclusion" }, { kind: "p", text: plan.conclusion });
    if (plan.tips.length) blocks.push({ kind: "h2", text: "Tips for top marks" }, { kind: "list", items: plan.tips });
    return { title: q.question, subtitle: "Essay plan", blocks };
  };

  const copy = async () => {
    const { toPlainText } = await import("@/services/export");
    try {
      await navigator.clipboard.writeText(toPlainText(doc()));
      toast("Plan copied");
    } catch {
      toast.error("Couldn't copy");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <p className="mr-auto text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Essay plan</p>
        <Button variant={editing ? "default" : "ghost"} size="sm" onClick={() => setEditing((e) => !e)}>
          {editing ? <Check /> : <Pencil />} {editing ? "Done" : "Edit"}
        </Button>
        <Button variant="ghost" size="sm" onClick={copy}>
          <Copy /> Copy
        </Button>
        <Button variant="ghost" size="sm" onClick={() => exportDoc(doc(), "pdf").then(() => toast("PDF ready"))}>
          <Download /> PDF
        </Button>
        <Button variant="ghost" size="sm" onClick={onRedo} loading={busy}>
          <RefreshCw /> New plan
        </Button>
      </div>

      <div className="rounded-xl border-l-4 border-primary bg-card px-4 py-3">
        <p className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-primary">
          <Target className="size-3.5" /> Your argument
        </p>
        <EditText editing={editing} value={plan.thesis} onSave={(v) => upd({ thesis: v })} className="mt-1 text-[15px] font-medium leading-snug" />
      </div>

      <PlanBlock title="Introduction">
        <EditText editing={editing} value={plan.intro} onSave={(v) => upd({ intro: v })} className="text-[14px] text-foreground/90" />
      </PlanBlock>

      <ol className="space-y-3">
        {plan.paragraphs.map((p, i) => (
          <li key={p.id} className="rounded-xl border bg-card p-4">
            <div className="flex items-start gap-3">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-foreground text-[12.5px] font-semibold text-background">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <EditText editing={editing} value={p.point} onSave={(v) => setPara(i, { point: v })} className="text-[14.5px] font-semibold leading-snug" />
                {p.evidence.length > 0 && (
                  <ul className="mt-2 space-y-1.5">
                    {p.evidence.map((e, k) => (
                      <li key={k} className="flex gap-2 text-[13.5px] text-foreground/90">
                        <span className="mt-[0.55em] size-[5px] shrink-0 rounded-full bg-muted-foreground" aria-hidden />
                        <span>
                          {e.text}
                          {e.label && <span className="ml-1.5 rounded bg-secondary px-1.5 py-px text-[11px] text-muted-foreground">{e.label}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {(p.analysis || editing) && (
                  <div className="mt-2 text-[13.5px] text-muted-foreground">
                    <span className="font-medium text-foreground/80">Why it matters: </span>
                    {editing ? <EditText editing value={p.analysis} onSave={(v) => setPara(i, { analysis: v })} className="mt-1" /> : p.analysis}
                  </div>
                )}
                {p.criteria.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-1">
                    {p.criteria.map((c) => (
                      <span key={c} className="inline-flex items-center gap-1 rounded-md bg-success-soft px-2 py-0.5 text-[11.5px] font-medium text-success">
                        <Check className="size-3" /> {c}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-0.5">
                <button type="button" aria-label={`Move paragraph ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)} className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30 focus-ring">
                  <ArrowUp className="size-3.5" />
                </button>
                <button type="button" aria-label={`Move paragraph ${i + 1} down`} disabled={i === plan.paragraphs.length - 1} onClick={() => move(i, 1)} className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30 focus-ring">
                  <ArrowDown className="size-3.5" />
                </button>
              </div>
            </div>
          </li>
        ))}
      </ol>

      {plan.counter && (
        <PlanBlock title="The other side" icon={<Scale className="size-3.5" />}>
          <p className="text-[14px]">
            <span className="font-medium">Counter-argument: </span>
            {editing ? <EditText editing value={plan.counter.point} onSave={(v) => upd({ counter: { ...plan.counter!, point: v } })} className="mt-1" /> : plan.counter.point}
          </p>
          <p className="mt-1.5 text-[14px]">
            <span className="font-medium">Your response: </span>
            {editing ? <EditText editing value={plan.counter.response} onSave={(v) => upd({ counter: { ...plan.counter!, response: v } })} className="mt-1" /> : plan.counter.response}
          </p>
        </PlanBlock>
      )}

      <PlanBlock title="Conclusion">
        <EditText editing={editing} value={plan.conclusion} onSave={(v) => upd({ conclusion: v })} className="text-[14px] text-foreground/90" />
      </PlanBlock>

      {plan.tips.length > 0 && (
        <div className="rounded-xl bg-warning-soft/70 px-4 py-3">
          <p className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-warning">
            <Lightbulb className="size-3.5" /> Tips for top marks
          </p>
          <ul className="mt-1.5 space-y-1 text-[13.5px]">
            {plan.tips.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function PlanBlock({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <p className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
        {icon}
        {title}
      </p>
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------- free users */

export function EssaysTeaser() {
  return (
    <section className="relative overflow-hidden rounded-2xl border bg-card" aria-label="Essays">
      <div className="pointer-events-none select-none space-y-3 p-5 opacity-70 blur-[3px]" aria-hidden>
        <div className="flex gap-1.5">
          <span className="rounded-md bg-primary-soft px-2 py-0.5 text-[11.5px] text-primary">Evaluate</span>
          <span className="rounded-md bg-secondary px-2 py-0.5 text-[11.5px]">25 marks</span>
          <span className="rounded-md border px-2 py-0.5 text-[11.5px]">AO3</span>
        </div>
        <p className="text-[16px] font-semibold">Evaluate the extent to which light intensity is the main limiting factor of photosynthesis.</p>
        <div className="rounded-xl border-l-4 border-primary bg-subtle px-4 py-3 text-[14px]">Light intensity limits the rate at low levels, but carbon dioxide and temperature become limiting as it rises.</div>
        <div className="rounded-xl border p-3 text-[13.5px]">1. At low light, the light-dependent reactions slow…</div>
        <div className="rounded-xl border p-3 text-[13.5px]">2. Carbon dioxide concentration controls the Calvin cycle…</div>
      </div>
      <div className="absolute inset-0 grid place-items-center bg-gradient-to-b from-card/40 via-card/80 to-card p-6">
        <div className="max-w-sm text-center">
          <span className="mx-auto grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-sm">
            <PenLine className="size-5" />
          </span>
          <h2 className="mt-3 text-[17px] font-semibold">Essay practice is part of Pro</h2>
          <p className="mt-1.5 text-[13.5px] text-muted-foreground">Add your marking criteria, get exam-style essay questions on a lecture or a whole module, and a clear plan for any of them, with evidence from your slides.</p>
          <Button className="mt-4" onClick={() => navigate("/pro")}>
            <Crown /> See Pro
          </Button>
        </div>
      </div>
    </section>
  );
}
