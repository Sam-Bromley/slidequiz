import { AlertCircle, ArrowRight, BookOpenText, Check, ChevronDown, Clock, Timer, Layers, ListChecks, Play, Plus, Settings2, SquarePen, TriangleAlert, X, CirclePlay } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { GenerationProgress } from "@/components/generate/generation-progress";
import { PageHeader } from "@/components/layout/page-header";
import { DIFFICULTY_SETTINGS, KIND_META } from "@/components/questions/meta";
import { QuestionCard } from "@/components/questions/question-card";
import { startQuiz } from "@/components/quiz/start";
import { Button, buttonClass } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Menu } from "@/components/ui/menu";
import { Segmented } from "@/components/ui/segmented";
import { toast } from "@/components/ui/toast";
import { Link, navigate, useLocation } from "@/lib/router";
import { openQuizSetup } from "@/lib/ui";
import { cn, plural } from "@/lib/utils";
import { getAI, type GenerationStage } from "@/services/ai";
import { groundingFor } from "@/services/grounding";
import { actions } from "@/store/actions";
import { unitWord } from "@/store/selectors";
import { getState, useData } from "@/store/store";
import type { AcademicLevel, DifficultySetting, GenerationKind } from "@/types/models";

const KINDS: GenerationKind[] = ["mcq", "short", "long", "essay", "true_false", "fill_blank", "matching", "scenario", "compare", "flashcards", "summary"];
const QUICK_KINDS: GenerationKind[] = ["mcq", "true_false", "fill_blank", "short", "matching", "scenario"];

type Phase = { kind: "setup" } | { kind: "running"; stage: GenerationStage } | { kind: "done"; questionIds: string[]; flashcards: number; summaries: number; warnings: string[] } | { kind: "error"; message: string };

export function GeneratePage() {
  const data = useData();
  const { query } = useLocation();
  const initial = (query.get("m") ?? "").split(",").filter((id) => data.materials.some((m) => m.id === id));
  const [mids, setMids] = useState<string[]>(initial);
  const [custom, setCustom] = useState(false);
  const [kinds, setKinds] = useState<GenerationKind[]>(["mcq", "short", "true_false", "fill_blank", "flashcards"]);
  const [countSel, setCountSel] = useState<string>(String([5, 10, 15, 20].includes(data.settings.defaultCount) ? data.settings.defaultCount : "custom"));
  const [customCount, setCustomCount] = useState(data.settings.defaultCount);
  const [difficulty, setDifficulty] = useState<DifficultySetting>(data.settings.defaultDifficulty);
  const [topicIds, setTopicIds] = useState<string[] | null>(null);
  const [instructions, setInstructions] = useState("");
  const [examDate, setExamDate] = useState("");
  const [course, setCourse] = useState("");
  const [level, setLevel] = useState<AcademicLevel>(data.user.level);
  const [phase, setPhase] = useState<Phase>({ kind: "setup" });
  const abort = useRef<AbortController | null>(null);

  const materials = data.materials.filter((m) => mids.includes(m.id));
  const allTopics = materials.flatMap((m) => m.topics.filter((t) => m.pages.some((p) => p.included && p.topicId === t.id)).map((t) => ({ ...t, materialId: m.id, materialTitle: m.title })));
  const selectedTopics = topicIds ?? allTopics.map((t) => t.id);
  useEffect(() => setTopicIds(null), [mids.join()]);

  const count = countSel === "custom" ? Math.max(1, Math.min(50, customCount || 1)) : Number(countSel);
  const includedPages = materials.reduce((s, m) => s + m.pages.filter((p) => p.included && (!p.topicId || selectedTopics.includes(p.topicId))).length, 0);
  const unit = materials.length === 1 ? unitWord(materials[0], includedPages) : includedPages === 1 ? "page" : "pages";
  const questionKinds = kinds.filter((k) => k !== "flashcards" && k !== "summary");
  const diffLabel = DIFFICULTY_SETTINGS.find((d) => d.value === difficulty)!.label;
  const summaryLine = [`${includedPages} ${unit}`, questionKinds.length ? plural(count, "question") : null, kinds.includes("flashcards") ? "flashcards" : null, kinds.includes("summary") ? "summary" : null, questionKinds.length ? `${diffLabel} difficulty` : null, plural(selectedTopics.length, "topic")].filter(Boolean).join(" · ");

  const run = async (quick: boolean) => {
    const req = {
      subject: [...new Set(materials.map((m) => m.subject))].join(" & "),
      ...groundingFor(materials, { topicIds: quick ? undefined : selectedTopics }),
      kinds: quick ? QUICK_KINDS : kinds,
      count: quick ? 10 : count,
      difficulty: quick ? ("mixed" as const) : difficulty,
      instructions: quick ? "" : instructions,
      level,
      course: course || materials[0]?.course,
      examDate: examDate || undefined,
      avoidPrompts: getState().questions.filter((q) => mids.includes(q.materialId)).map((q) => q.prompt),
    };
    if (!req.pages.length) {
      toast.error("No pages selected", { description: "Include at least one slide or page with text." });
      return;
    }
    if (!quick && !kinds.length) {
      toast.error("Choose at least one thing to create");
      return;
    }
    abort.current = new AbortController();
    setPhase({ kind: "running", stage: "reading" });
    window.scrollTo({ top: 0 });
    try {
      const res = await getAI().generate(req, (stage) => setPhase({ kind: "running", stage }), abort.current.signal);
      const rec = actions.recordGeneration({ materialIds: mids, kinds: req.kinds, count: req.count, difficulty: req.difficulty }, res.questions, res.flashcards, res.summaries);
      if (req.examDate || req.course) materials.forEach((m) => actions.updateMaterial(m.id, { examDate: req.examDate ?? m.examDate, course: req.course ?? m.course, level }));
      setPhase({ kind: "done", questionIds: rec.questionIds, flashcards: rec.flashcardIds.length, summaries: res.summaries.length, warnings: res.warnings });
    } catch (e) {
      console.error("Generation failed", e);
      if ((e as Error).name === "AbortError") {
        setPhase({ kind: "setup" });
        toast.info("Generation cancelled");
      } else setPhase({ kind: "error", message: (e as Error).message === "NO_TEXT" ? "The selected pages don't contain enough text to work with. Include more pages, or add text to image pages." : "Something went wrong. Try again." });
    }
  };

  if (phase.kind === "running") return <GenerationProgress stage={phase.stage} summary={summaryLine} onCancel={() => abort.current?.abort()} />;

  if (phase.kind === "error")
    return (
      <div className="mx-auto max-w-md py-16 text-center" role="alert">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-destructive-soft text-destructive">
          <AlertCircle className="size-6" />
        </span>
        <h1 className="mt-5 text-[22px] font-bold">Something went wrong. Try again.</h1>
        <p className="mt-2 text-[14px] text-muted-foreground">{phase.message}</p>
        <div className="mt-6 flex justify-center gap-2">
          <Button variant="outline" onClick={() => setPhase({ kind: "setup" })}>Back to setup</Button>
          <Button onClick={() => run(false)}>Try again</Button>
        </div>
      </div>
    );

  if (phase.kind === "done") return <Done phase={phase} mids={mids} onMore={() => setPhase({ kind: "setup" })} />;

  if (!data.materials.length)
    return (
      <div>
        <PageHeader title="Generate" />
        <EmptyState icon={SquarePen} title="Upload your first study material to get started." description="Questions and flashcards are created from your own slides and notes." action={<Link to="/upload" className={buttonClass()}>Upload material</Link>} />
      </div>
    );

  const toggleKind = (k: GenerationKind) => setKinds((ks) => (ks.includes(k) ? ks.filter((x) => x !== k) : [...ks, k]));

  return (
    <div className="pb-28">
      <PageHeader back={{ to: materials.length === 1 ? `/materials/${materials[0].id}` : "/materials", label: materials.length === 1 ? materials[0].title : "My Materials" }} title="Make questions" description="Questions, flashcards and summaries come only from the pages you've kept." />

      {/* Source material */}
      <section className="mb-6" aria-labelledby="src-h">
        <h2 id="src-h" className="mb-2.5 text-[13px] font-medium text-muted-foreground">Generate from</h2>
        <div className="flex flex-wrap items-center gap-2">
          {materials.map((m) => {
            const inc = m.pages.filter((p) => p.included).length;
            return (
              <div key={m.id} className="flex items-center gap-2 rounded-xl border bg-card py-1.5 pl-3 pr-1.5">
                <div>
                  <p className="text-[13.5px] font-semibold leading-tight">{m.subject} · {m.title}</p>
                  <Link to={`/materials/${m.id}?tab=content`} className="text-[12px] text-muted-foreground hover:text-primary hover:underline">
                    Using {inc} of {m.pages.length} {unitWord(m)} · Edit selection
                  </Link>
                </div>
                <Button variant="ghost" size="icon-sm" aria-label={`Remove ${m.title}`} onClick={() => setMids((s) => s.filter((x) => x !== m.id))}>
                  <X />
                </Button>
              </div>
            );
          })}
          <Menu
            label="Add material"
            align="start"
            items={data.materials.filter((m) => !mids.includes(m.id)).map((m) => ({ label: `${m.subject} · ${m.title}`, onSelect: () => setMids((s) => [...s, m.id]) }))}
            trigger={(p) => (
              <Button variant="outline" size="sm" {...p} disabled={mids.length === data.materials.length}>
                <Plus /> Add material
              </Button>
            )}
          />
        </div>
        {!materials.length && <p className="mt-3 text-[13.5px] text-muted-foreground">Choose at least one material to generate from.</p>}
      </section>

      {/* Quick generate */}
      <section className="flex flex-col gap-4 rounded-2xl border bg-card p-5 sm:flex-row sm:items-center">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
          <CirclePlay className="size-5" />
        </span>
        <div className="flex-1">
          <h2 className="text-[16px] font-semibold">10 quick questions</h2>
          <p className="text-[13.5px] text-muted-foreground">A mix of question types from everything selected.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setCustom((c) => !c)} aria-expanded={custom} aria-controls="customize">
            <Settings2 /> Customize <ChevronDown className={cn("transition-transform", custom && "rotate-180")} />
          </Button>
          <Button onClick={() => run(true)} disabled={!materials.length}>
            Make questions
          </Button>
        </div>
      </section>

      {custom && (
        <div id="customize" className="mt-6 animate-fade-up space-y-8">
          <section aria-labelledby="create-h">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 id="create-h" className="text-[16px] font-semibold">What do you want to create?</h2>
              <span className="text-[12.5px] text-muted-foreground">{kinds.length} selected</span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {KINDS.map((k) => {
                const M = KIND_META[k];
                const on = kinds.includes(k);
                return (
                  <button key={k} type="button" role="checkbox" aria-checked={on} onClick={() => toggleKind(k)} className={cn("relative flex items-start gap-3 rounded-xl border p-3 text-left transition-all focus-ring", on ? "border-primary bg-primary-soft/70 ring-1 ring-primary" : "bg-card hover:bg-accent")}>
                    <M.icon className={cn("mt-0.5 size-[18px] shrink-0", on ? "text-primary" : "text-muted-foreground")} />
                    <span className="min-w-0">
                      <span className="block text-[13.5px] font-semibold leading-tight">{M.label}</span>
                      <span className="mt-0.5 block text-[12px] leading-snug text-muted-foreground">{M.hint}</span>
                    </span>
                    {on && <Check className="absolute right-2.5 top-2.5 size-3.5 text-primary" />}
                  </button>
                );
              })}
            </div>
          </section>

          <div className="grid gap-8 lg:grid-cols-2">
            <Field label="Number of questions">
              <div className="flex flex-wrap items-center gap-2">
                <Segmented label="Number of questions" value={countSel} onChange={setCountSel} options={[...["5", "10", "15", "20"].map((v) => ({ value: v, label: v })), { value: "custom", label: "Custom" }]} />
                {countSel === "custom" && <Input type="number" min={1} max={50} value={customCount} onChange={(e) => setCustomCount(Number(e.target.value))} className="w-20" aria-label="Custom number of questions" />}
              </div>
            </Field>
            <Field label="Difficulty" hint={DIFFICULTY_SETTINGS.find((d) => d.value === difficulty)?.hint}>
              <Segmented label="Difficulty" value={difficulty} onChange={setDifficulty} options={DIFFICULTY_SETTINGS.map((d) => ({ value: d.value, label: d.label }))} />
            </Field>
          </div>

          <section aria-labelledby="topics-h">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 id="topics-h" className="text-[16px] font-semibold">Topics</h2>
              <div className="flex gap-3 text-[13px] font-medium">
                <button className="text-primary hover:underline" onClick={() => setTopicIds(null)}>Select all</button>
                <button className="text-muted-foreground hover:text-foreground hover:underline" onClick={() => setTopicIds([])}>Clear all</button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {allTopics.map((t) => {
                const on = selectedTopics.includes(t.id);
                return (
                  <label key={t.id} className={cn("flex cursor-pointer items-center gap-2 rounded-lg border py-1.5 pl-2.5 pr-3 text-[13.5px] transition-colors hover:bg-accent", on ? "border-primary/40 bg-primary-soft/60" : "text-muted-foreground")}>
                    <Checkbox checked={on} onChange={() => setTopicIds(on ? selectedTopics.filter((x) => x !== t.id) : [...selectedTopics, t.id])} />
                    {t.name}
                    {materials.length > 1 && <span className="text-[11.5px] text-muted-foreground">· {t.materialTitle}</span>}
                  </label>
                );
              })}
            </div>
          </section>

          <Field label="Custom instructions" htmlFor="instr" hint="Optional. For example: focus on a topic, a question style, or dates and figures.">
            <Textarea id="instr" value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Focus on definitions and application questions." className="min-h-[76px]" />
          </Field>

          <details className="group rounded-xl border bg-card">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-[14px] font-semibold">
              <span className="inline-flex items-center gap-2"><Clock className="size-4 text-muted-foreground" /> Exam information <span className="font-normal text-muted-foreground">(optional)</span></span>
              <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <div className="grid gap-4 border-t p-4 sm:grid-cols-3">
              <Field label="Exam date" htmlFor="exam-date">
                <Input id="exam-date" type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
              </Field>
              <Field label="Course / subject" htmlFor="course">
                <Input id="course" value={course} onChange={(e) => setCourse(e.target.value)} placeholder={materials[0]?.course ?? "e.g. AQA Biology"} />
              </Field>
              <Field label="Level">
                <Segmented size="sm" label="Level" value={level} onChange={setLevel} options={(["GCSE", "A-Level", "University", "Custom"] as const).map((l) => ({ value: l, label: l }))} />
              </Field>
            </div>
          </details>
        </div>
      )}

      {/* Summary bar */}
      <div className="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom,0px))] z-30 border-t bg-background/92 backdrop-blur-md lg:bottom-0 lg:left-[var(--sb,248px)]">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <p className="min-w-0 flex-1 truncate text-[13.5px] font-medium tabular-nums" aria-live="polite">
            {custom ? summaryLine : `${includedPages} ${unit} · 10 questions · Mixed difficulty · ${plural(allTopics.length, "topic")}`}
          </p>
          <Button size="lg" onClick={() => run(!custom)} disabled={!materials.length || (custom && (!kinds.length || !selectedTopics.length))}>
            Make questions
          </Button>
        </div>
      </div>
    </div>
  );
}

function Done({ phase, mids, onMore }: { phase: Extract<Phase, { kind: "done" }>; mids: string[]; onMore: () => void }) {
  const data = useData();
  const qs = phase.questionIds.map((id) => data.questions.find((q) => q.id === id)).filter((q): q is NonNullable<typeof q> => !!q);
  const title = mids.length === 1 ? data.materials.find((m) => m.id === mids[0])?.title ?? "New questions" : "Combined materials";
  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-5 rounded-2xl border bg-card p-6 sm:flex-row sm:items-center">
        <span className="grid size-12 shrink-0 animate-pop place-items-center rounded-2xl bg-success-soft text-success">
          <Check className="size-6" strokeWidth={2.5} />
        </span>
        <div className="flex-1">
          <h1 className="text-[22px] font-bold">Done</h1>
          <p className="mt-1 text-[14px] text-muted-foreground">
            {[qs.length ? plural(qs.length, "question") : null, phase.flashcards ? plural(phase.flashcards, "flashcard") : null, phase.summaries ? "a summary" : null].filter(Boolean).join(", ")} from {title}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {qs.length > 0 && (
            <>
              <Button variant="outline" onClick={() => openQuizSetup({ title, questionIds: qs.map((q) => q.id) })}>
                <Timer /> Timed quiz
              </Button>
              <Button variant="outline" onClick={() => startQuiz({ title: `${title} exam`, questionIds: qs.map((q) => q.id), mode: "exam", origin: "generated" })}>
                <Clock /> Exam mode
              </Button>
              <Button onClick={() => startQuiz({ title: `${title} practice`, questionIds: qs.map((q) => q.id), origin: "generated" })}>
                <Play /> Start practice
              </Button>
            </>
          )}
        </div>
      </div>

      {phase.warnings.map((w) => (
        <p key={w} className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-soft px-3.5 py-2.5 text-[13.5px]">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" /> {w}
        </p>
      ))}

      <div className="flex flex-wrap gap-2">
        {phase.flashcards > 0 && (
          <Link to="/flashcards/review" className={buttonClass("subtle")}>
            <Layers /> Study {phase.flashcards} new flashcards
          </Link>
        )}
        {phase.summaries > 0 && mids.length && (
          <Link to={`/materials/${mids[0]}?tab=summary`} className={buttonClass("subtle")}>
            <BookOpenText /> Read the summary
          </Link>
        )}
        <Link to={`/questions?m=${mids.join(",")}`} className={buttonClass("ghost")}>
          <ListChecks /> Open in Question Bank
        </Link>
        <Button variant="ghost" onClick={onMore}>
          <SquarePen /> Make more
        </Button>
      </div>

      {qs.length > 0 && (
        <section aria-labelledby="new-q-h">
          <h2 id="new-q-h" className="mb-3 text-[15px] font-semibold">New questions</h2>
          <div className="space-y-3">
            {qs.slice(0, 6).map((q, i) => (
              <QuestionCard key={q.id} q={q} number={i + 1} />
            ))}
          </div>
          {qs.length > 6 && (
            <Button variant="link" className="mt-3" onClick={() => navigate(`/questions?m=${mids.join(",")}`)}>
              See all {qs.length} questions <ArrowRight />
            </Button>
          )}
        </section>
      )}
    </div>
  );
}
