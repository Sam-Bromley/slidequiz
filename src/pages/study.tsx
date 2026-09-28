import { BookOpenCheck, CalendarDays, CircleHelp, Clock, Flame, Layers, ListChecks, Play, Plus, Target, Trash2, TrendingDown, TrendingUp, CirclePlay } from "lucide-react";
import { useState } from "react";
import { PageHeader, SectionTitle } from "@/components/layout/page-header";
import { startQuickStudy, startQuiz, startWeakAreas } from "@/components/quiz/start";
import { ScoreTrend } from "@/components/study/score-trend";
import { STATUS_META, StatTile, TodaysReview, TopicRow } from "@/components/study/widgets";
import { Button, buttonClass } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, tabPanelProps } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { Link, navigate, useLocation } from "@/lib/router";
import { openQuizSetup } from "@/lib/ui";
import { addDays, cn, dayKey, daysBetween, formatDate, formatDuration, pct, plural } from "@/lib/utils";
import { overview, pickStudyQuestions, recommendedMinutes, reviewCounts, subjectProgress, topicStats, type TopicStatus } from "@/services/study/analytics";
import { generatePlan, PlanError, planProgress } from "@/services/study/planner";
import { isNew } from "@/services/study/srs";
import { actions } from "@/store/actions";
import { getState, useData } from "@/store/store";
import type { PlanTask, StudyPlan } from "@/types/models";

type Tab = "today" | "planner" | "progress";

export function StudyPage() {
  const { query } = useLocation();
  const [tab, setTab] = useState<Tab>((query.get("tab") as Tab) || "today");
  return (
    <div>
      <PageHeader title="Study" description="Based on how your quizzes and flashcards are going." className="mb-4 sm:mb-5" />
      <Tabs
        idPrefix="study"
        className="mb-6"
        value={tab}
        onChange={(t) => {
          setTab(t);
          history.replaceState(null, "", `#/study?tab=${t}`);
        }}
        items={[
          { value: "today", label: "Today" },
          { value: "planner", label: "Study planner" },
          { value: "progress", label: "Progress" },
        ]}
      />
      <div {...tabPanelProps("study", tab)}>
        {tab === "today" && <Today />}
        {tab === "planner" && <Planner />}
        {tab === "progress" && <ProgressTab />}
      </div>
    </div>
  );
}

function Today() {
  const data = useData();
  const stats = topicStats(data).filter((t) => t.questionCount || t.cardCount);
  const minutes = recommendedMinutes(data);
  const rc = reviewCounts(data.flashcards);
  const wrong = data.questions.filter((q) => q.stats.lastResult && q.stats.lastResult !== "correct").length;
  const forgotten = data.flashcards.filter((c) => c.srs.lapses > 0).length;
  const fresh = stats.filter((s) => s.status === "new").length;
  const order: TopicStatus[] = ["weak", "review", "new", "strong"];
  const plan = data.plans[0];
  const todayTasks = plan?.days.find((d) => dayKey(d.date) === dayKey(new Date()))?.tasks ?? [];

  // Next 7 days of flashcard reviews.
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(new Date(), i);
    const n = data.flashcards.filter((c) => !isNew(c) && (i === 0 ? new Date(c.srs.due) <= new Date(d.setHours(23, 59)) : dayKey(c.srs.due) === dayKey(d))).length;
    return { d: addDays(new Date(), i), n };
  });
  const maxN = Math.max(1, ...week.map((w) => w.n));

  if (!data.questions.length && !data.flashcards.length)
    return <EmptyState icon={Target} title="Generate your first questions from your study material." description="Once you've answered a few, SlideQuiz shows what to study each day." action={<Link to="/materials" className={buttonClass()}>Choose material</Link>} />;

  return (
    <div className="space-y-8">
      <section className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="rounded-2xl border bg-card p-5 sm:p-6">
          <h2 className="text-[18px] font-bold">What should I study today?</h2>
          <p className="mt-1 text-[14px] text-muted-foreground">
            Recommended session: <span className="font-semibold text-foreground">{minutes} minutes</span>
            {todayTasks.length > 0 && <> · Plan: {todayTasks.map((t) => t.label).join(", ")}</>}
          </p>
          <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button size="lg" onClick={() => startQuickStudy()}>
              <CirclePlay /> Start a session
            </Button>
            <Button size="lg" variant="outline" onClick={() => startWeakAreas()}>
              <Target /> Review Weak Areas
            </Button>
            <Button size="lg" variant="outline" onClick={() => navigate("/flashcards/review")}>
              <Layers /> Study Flashcards
            </Button>
            <Button size="lg" variant="outline" onClick={() => openQuizSetup({})}>
              <ListChecks /> Take Practice Quiz
            </Button>
          </div>
          <ul className="mt-5 grid grid-cols-2 gap-2 text-[13px] sm:grid-cols-4">
            {[
              ["New material", fresh, "topics not started"],
              ["Due reviews", rc.due, "flashcards due"],
              ["Difficult questions", wrong, "to revisit"],
              ["Forgotten cards", forgotten, "lapsed before"],
            ].map(([l, n, s]) => (
              <li key={l as string} className="rounded-lg bg-subtle px-3 py-2.5">
                <span className="block font-display text-[20px] font-bold tabular-nums leading-none">{n as number}</span>
                <span className="mt-1 block font-medium">{l as string}</span>
                <span className="block text-[11.5px] text-muted-foreground">{s as string}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="space-y-4">
          <TodaysReview compact />
          <div className="rounded-xl border bg-card p-5">
            <h3 className="text-[14px] font-semibold">Review schedule</h3>
            <p className="text-[12px] text-muted-foreground">Flashcards due over the next 7 days</p>
            <ol className="mt-4 flex h-24 items-end gap-2" aria-label="Flashcards due per day">
              {week.map((w, i) => (
                <li key={i} className="flex flex-1 flex-col items-center gap-1.5">
                  <span className="text-[10.5px] tabular-nums text-muted-foreground">{w.n}</span>
                  <span className={cn("w-full rounded-md", i === 0 ? "bg-primary" : "bg-primary/25")} style={{ height: `${Math.max(4, (w.n / maxN) * 56)}px` }} aria-label={`${formatDate(w.d.toISOString(), { weekday: "long" })}: ${w.n} cards`} />
                  <span className="text-[10.5px] text-muted-foreground">{i === 0 ? "Today" : formatDate(w.d.toISOString(), { weekday: "narrow" })}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section aria-labelledby="topics-h">
        <SectionTitle id="topics-h">Topics by priority</SectionTitle>
        <div className="grid gap-4 md:grid-cols-2">
          {order.map((st) => {
            const ts = stats.filter((s) => s.status === st);
            if (!ts.length) return null;
            return (
              <div key={st} className="rounded-xl border bg-card px-4 pb-2 pt-3.5">
                <h3 className={cn("flex items-center gap-2 text-[13px] font-semibold", STATUS_META[st].text)}>
                  <span className={cn("size-2 rounded-full", STATUS_META[st].dot)} /> {STATUS_META[st].label} · {ts.length}
                </h3>
                <ul className="divide-y">{ts.map((t) => <TopicRow key={t.topicId} t={t} />)}</ul>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ Planner */

function taskStart(t: PlanTask) {
  const d = getState();
  if (t.kind === "flashcards") return navigate(`/flashcards/review${t.materialId ? `?m=${t.materialId}` : ""}`);
  if (t.kind === "mock") return openQuizSetup({ materialIds: t.materialId ? [t.materialId] : undefined });
  if (t.kind === "review") return startWeakAreas(t.materialId ? [t.materialId] : undefined, t.topicId ? [t.topicId] : undefined);
  if (t.kind === "written") {
    const ids = d.questions.filter((q) => q.topicId === t.topicId && (q.type === "essay" || q.type === "long" || q.type === "compare")).map((q) => q.id).slice(0, 2);
    if (!ids.length) return navigate(`/generate?m=${t.materialId}`);
    return startQuiz({ title: t.label, questionIds: ids, origin: "plan" });
  }
  const n = Number(t.label.match(/(\d+) MCQs/)?.[1] ?? 10);
  const ids = pickStudyQuestions(d, { count: n, materialIds: t.materialId ? [t.materialId] : undefined, topicIds: t.topicId ? [t.topicId] : undefined });
  if (!ids.length) return navigate(`/generate?m=${t.materialId}`);
  startQuiz({ title: t.label, questionIds: ids, origin: "plan" });
}

const TASK_ICON = { learn: BookOpenCheck, mcq: ListChecks, flashcards: Layers, written: BookOpenCheck, review: Target, mock: Clock };

function PlanView({ plan }: { plan: StudyPlan }) {
  const prog = planProgress(plan);
  const today = dayKey(new Date());
  const daysLeft = daysBetween(new Date(), new Date(plan.examDate));
  const [del, setDel] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const pastDays = plan.days.filter((d) => dayKey(d.date) < today);
  const visible = showPast ? plan.days : plan.days.filter((d) => dayKey(d.date) >= today);
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 rounded-2xl border bg-card p-5 sm:flex-row sm:items-center">
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
          <CalendarDays className="size-5" />
        </span>
        <div className="flex-1">
          <p className="text-[12.5px] font-medium text-muted-foreground">{plan.subject} exam · {formatDate(plan.examDate, { weekday: "long", day: "numeric", month: "long" })}</p>
          <p className="text-[18px] font-bold">{daysLeft > 0 ? `${plural(daysLeft, "day")} to go` : daysLeft === 0 ? "Exam day, good luck" : "Exam finished"}</p>
          <div className="mt-2 flex items-center gap-3">
            <Progress value={prog.fraction} className="max-w-xs" label="Plan progress" />
            <span className="text-[12.5px] tabular-nums text-muted-foreground">{prog.done}/{prog.total} tasks</span>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setDel(true)}>
          <Trash2 /> Delete plan
        </Button>
      </div>
      {pastDays.length > 0 && (
        <button className="text-[13px] font-medium text-primary hover:underline" onClick={() => setShowPast((s) => !s)}>
          {showPast ? "Hide past days" : `Show ${plural(pastDays.length, "past day")}`}
        </button>
      )}
      <ol className="space-y-2.5">
        {visible.map((d, i) => {
          const isToday = dayKey(d.date) === today;
          const past = dayKey(d.date) < today;
          const dayNum = plan.days.indexOf(d) + 1;
          return (
            <li key={d.date} className={cn("rounded-xl border bg-card", isToday && "border-primary/50 ring-1 ring-primary/40", past && "opacity-75")}>
              <div className="flex items-center justify-between border-b px-4 py-2.5">
                <p className="text-[13px] font-semibold">
                  Day {dayNum} <span className="font-normal text-muted-foreground">· {formatDate(d.date)}</span>
                </p>
                {isToday && <span className="rounded-md bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">Today</span>}
              </div>
              <ul className="divide-y">
                {d.tasks.map((t) => {
                  const Icon = TASK_ICON[t.kind];
                  return (
                    <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                      <Checkbox checked={t.done} onChange={() => { actions.toggleTask(plan.id, t.id); if (!t.done) toast("Task complete"); }} aria-label={`Mark “${t.label}” as done`} />
                      <Icon className="size-4 shrink-0 text-muted-foreground" />
                      <span className={cn("flex-1 text-[14px]", t.done && "text-muted-foreground line-through")}>{t.label}</span>
                      <span className="hidden text-[12px] tabular-nums text-muted-foreground sm:inline">{t.minutes} min</span>
                      {!t.done && (isToday || !past) && i < 3 && (
                        <Button variant={isToday ? "subtle" : "ghost"} size="xs" onClick={() => taskStart(t)}>
                          <Play /> Start
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ol>
      <ConfirmDialog open={del} onClose={() => setDel(false)} title="Delete this study plan?" description="Your quiz results and flashcards are not affected." onConfirm={() => toast.undo("Plan deleted", actions.deletePlan(plan.id))} />
    </div>
  );
}

function NewPlanDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const data = useData();
  const subjects = [...new Set(data.materials.map((m) => m.subject))];
  const [subject, setSubject] = useState(subjects[0] ?? "");
  const inTwoWeeks = addDays(new Date(), 14);
  const [date, setDate] = useState(dayKey(inTwoWeeks));
  const [minutes, setMinutes] = useState(45);
  const [mids, setMids] = useState<string[]>(data.materials.filter((m) => m.subject === subjects[0]).map((m) => m.id));
  const [error, setError] = useState("");
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Create a study plan"
      description="We'll spread your topics across the days before your exam, weakest first, and finish with a timed practice exam."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="plan-form">Generate plan</Button>
        </>
      }
    >
      <form
        id="plan-form"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          try {
            const p = generatePlan({ subject: subject || "Revision", examDate: date, minutesPerDay: minutes, materialIds: mids }, getState());
            actions.addPlan(p);
            toast("Study plan created", { description: `${plural(p.days.length, "day")} until your exam.` });
            onClose();
          } catch (err) {
            setError(err instanceof PlanError ? err.message : "Couldn't create a plan. Try again.");
          }
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Subject" htmlFor="plan-subject">
            <Select
              id="plan-subject"
              value={subject}
              onChange={(e) => {
                setSubject(e.target.value);
                setMids(data.materials.filter((m) => m.subject === e.target.value).map((m) => m.id));
              }}
            >
              {subjects.map((s) => <option key={s}>{s}</option>)}
            </Select>
          </Field>
          <Field label="Exam date" htmlFor="plan-date">
            <Input id="plan-date" type="date" value={date} min={dayKey(addDays(new Date(), 1))} onChange={(e) => setDate(e.target.value)} required />
          </Field>
        </div>
        <Field label="Available study time per day" htmlFor="plan-min">
          <Select id="plan-min" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
            {[20, 30, 45, 60, 90, 120].map((m) => <option key={m} value={m}>{m < 60 ? `${m} minutes` : `${m / 60} hour${m > 60 ? "s" : ""}`}</option>)}
          </Select>
        </Field>
        <fieldset>
          <legend className="mb-2 text-[13px] font-medium">Materials</legend>
          <div className="space-y-1.5">
            {data.materials.map((m) => (
              <label key={m.id} className="flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm hover:bg-accent">
                <Checkbox checked={mids.includes(m.id)} onChange={(e) => setMids((s) => (e.target.checked ? [...s, m.id] : s.filter((x) => x !== m.id)))} />
                {m.subject} · {m.title}
              </label>
            ))}
          </div>
        </fieldset>
        {error && <p className="text-[13px] font-medium text-destructive" role="alert">{error}</p>}
      </form>
    </Dialog>
  );
}

function Planner() {
  const data = useData();
  const [creating, setCreating] = useState(false);
  const [sel, setSel] = useState(0);
  const plan = data.plans[sel] ?? data.plans[0];
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {data.plans.map((p, i) => (
          <Button key={p.id} variant={p === plan ? "secondary" : "ghost"} size="sm" onClick={() => setSel(i)}>
            {p.subject}
          </Button>
        ))}
        <Button variant="outline" size="sm" className="ml-auto" onClick={() => setCreating(true)} disabled={!data.materials.length}>
          <Plus /> New plan
        </Button>
      </div>
      {plan ? (
        <PlanView plan={plan} />
      ) : (
        <EmptyState icon={CalendarDays} title="Plan your revision" description="Enter your exam date and how much time you have. SlideQuiz builds a day-by-day plan from your materials." action={<Button onClick={() => setCreating(true)} disabled={!data.materials.length}><Plus /> Create a study plan</Button>} />
      )}
      {creating && <NewPlanDialog open onClose={() => setCreating(false)} />}
    </div>
  );
}

/* ------------------------------------------------------------------ Progress */

function Metric({ label, value, tip }: { label: string; value: number | null; tip: string }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-[13px]">
        <Tooltip content={tip}>
          <span className="inline-flex items-center gap-1 font-medium" tabIndex={0}>
            {label} <CircleHelp className="size-3 text-muted-foreground" />
          </span>
        </Tooltip>
        <span className="font-semibold tabular-nums">{value == null ? "-" : pct(value)}</span>
      </div>
      <Progress value={value ?? 0} tone={value == null ? "muted" : value >= 0.75 ? "success" : value >= 0.55 ? "warning" : "danger"} size="sm" label={label} />
    </div>
  );
}

function ProgressTab() {
  const data = useData();
  const o = overview(data);
  const subjects = subjectProgress(data);
  const weak = topicStats(data).filter((t) => t.status === "weak" || t.status === "review").sort((a, b) => (a.mastery ?? 0) - (b.mastery ?? 0)).slice(0, 5);

  return (
    <div className="space-y-8">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5" aria-label="Summary">
        <StatTile label="Questions completed" value={o.questionsCompleted} icon={<ListChecks className="size-4" />} />
        <StatTile label="Average quiz score" value={o.averageScore == null ? "-" : pct(o.averageScore)} sub={`${plural(o.quizzesCompleted, "quiz", "quizzes")}`} icon={<Target className="size-4" />} />
        <StatTile label="Study time" value={formatDuration(o.studyMs)} sub={`${formatDuration(o.weekMs)} this week`} icon={<Clock className="size-4" />} />
        <StatTile label="Flashcards mastered" value={o.mastered} sub={`of ${data.flashcards.length}`} icon={<Layers className="size-4" />} />
        <StatTile label="Current streak" value={`${o.streak} ${o.streak === 1 ? "day" : "days"}`} sub={o.streak ? "Study today to keep it" : "Start one today"} icon={<Flame className="size-4" />} />
      </section>

      <section aria-labelledby="subj-h">
        <SectionTitle id="subj-h">Progress by subject</SectionTitle>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {subjects.map((s) => (
            <div key={s.subject} className="rounded-xl border bg-card p-5">
              <div className="mb-4 flex items-baseline justify-between">
                <h3 className="text-[16px] font-bold">{s.subject}</h3>
                <span className="text-[13px] text-muted-foreground">{s.overall == null ? "Not started" : `${pct(s.overall)} overall`}</span>
              </div>
              <div className="space-y-3.5">
                <Metric label="Understanding" value={s.understanding} tip="Multiple choice, true/false, matching, scenario and compare questions" />
                <Metric label="Recall" value={s.recall} tip="Fill-in-the-blank, short answers and flashcards" />
                <Metric label="Essay" value={s.essay} tip="Long answers and essays, marked against key points" />
              </div>
              <ul className="mt-4 space-y-1.5 border-t pt-3">
                {s.topics.map((t) => (
                  <li key={t.topicId} className="flex items-center justify-between gap-2 text-[12.5px]">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className={cn("size-1.5 shrink-0 rounded-full", STATUS_META[t.status].dot)} />
                      <span className="truncate">{t.name}</span>
                    </span>
                    <span className="tabular-nums text-muted-foreground">{t.mastery == null ? "-" : pct(t.mastery)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-xl border bg-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold">Improvement over time</h2>
            {o.improvement != null && (
              <span className={cn("inline-flex items-center gap-1 text-[13px] font-semibold", o.improvement >= 0 ? "text-success" : "text-destructive")}>
                {o.improvement >= 0 ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
                {o.improvement >= 0 ? "+" : ""}
                {Math.round(o.improvement * 100)} pts
              </span>
            )}
          </div>
          <ScoreTrend scores={o.scores} />
          <p className="mt-2 text-[12px] text-muted-foreground">Last 5 quizzes compared with the 5 before.</p>
        </div>
        <div className="rounded-xl border bg-card p-5">
          <h2 className="text-[15px] font-semibold">Weak topics</h2>
          {weak.length ? <ul className="mt-1 divide-y">{weak.map((t) => <TopicRow key={t.topicId} t={t} />)}</ul> : <p className="mt-3 text-[13.5px] text-muted-foreground">No weak topics right now.</p>}
        </div>
      </section>

    </div>
  );
}
