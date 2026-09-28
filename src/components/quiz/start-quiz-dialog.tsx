import { Clock, GraduationCap, Timer } from "lucide-react";
import { MinutesInput } from "@/components/ui/minutes-input";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import { setUI, useUI } from "@/lib/ui";
import { cn, plural } from "@/lib/utils";
import { pickStudyQuestions } from "@/services/study/analytics";
import { useData } from "@/store/store";
import type { QuizMode } from "@/types/models";
import { startQuiz } from "./start";

/** "Take a quiz" — choose materials, length, practice vs exam mode, optional timer. */
export function StartQuizDialog() {
  const ui = useUI();
  const data = useData();
  const open = !!ui.quiz;
  const [mids, setMids] = useState<string[]>([]);
  const [count, setCount] = useState("10");
  const [mode, setMode] = useState<QuizMode>("practice");
  const [timed, setTimed] = useState(false);
  const [minutes, setMinutes] = useState(15);

  useEffect(() => {
    if (!open) return;
    setMids(ui.quiz?.materialIds?.length ? ui.quiz.materialIds : data.materials.filter((m) => data.questions.some((q) => q.materialId === m.id)).map((m) => m.id));
    setCount(String(data.settings.defaultCount >= 20 ? 20 : data.settings.defaultCount >= 15 ? 15 : data.settings.defaultCount <= 5 ? 5 : 10));
    setTimed(data.settings.defaultTimerMinutes != null);
    setMinutes(data.settings.defaultTimerMinutes ?? 15);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const available = useMemo(() => data.questions.filter((q) => mids.includes(q.materialId) && (!ui.quiz?.topicIds || (q.topicId && ui.quiz.topicIds.includes(q.topicId)))).length, [data.questions, mids, ui.quiz]);
  const n = Math.min(Number(count), available);
  const close = () => setUI({ quiz: null });

  const start = () => {
    const ids = ui.quiz?.questionIds?.length ? ui.quiz.questionIds : pickStudyQuestions(data, { count: n, materialIds: mids, topicIds: ui.quiz?.topicIds, focus: "mixed" });
    const title = ui.quiz?.title ?? (mids.length === 1 ? `${data.materials.find((m) => m.id === mids[0])?.title} ${mode === "exam" ? "exam" : "practice"}` : `Mixed ${mode === "exam" ? "exam" : "practice"} quiz`);
    close();
    startQuiz({ title, questionIds: ids, mode, timeLimitSec: timed ? minutes * 60 : null, origin: "practice" });
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Take a quiz"
      description="Pick your material and how you'd like to be tested."
      footer={
        <>
          <span className="mr-auto text-[13px] text-muted-foreground">{plural(ui.quiz?.questionIds?.length ?? n, "question")}{timed ? ` · ${minutes} min` : ""}</span>
          <Button variant="ghost" onClick={close}>Cancel</Button>
          <Button onClick={start} disabled={!ui.quiz?.questionIds?.length && n === 0}>Start quiz</Button>
        </>
      }
    >
      <div className="space-y-5">
        {!ui.quiz?.questionIds?.length && (
          <fieldset>
            <legend className="mb-2 text-[13px] font-medium">Material</legend>
            <div className="space-y-1.5">
              {data.materials.map((m) => {
                const qn = data.questions.filter((q) => q.materialId === m.id).length;
                return (
                  <label key={m.id} className={cn("flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors hover:bg-accent", mids.includes(m.id) && "border-primary/40 bg-primary-soft/50")}>
                    <Checkbox checked={mids.includes(m.id)} disabled={!qn} onChange={(e) => setMids((s) => (e.target.checked ? [...s, m.id] : s.filter((x) => x !== m.id)))} />
                    <span className="flex-1 text-sm">
                      <span className="font-medium">{m.subject} · {m.title}</span>
                    </span>
                    <span className="text-xs tabular-nums text-muted-foreground">{qn ? plural(qn, "question") : "No questions yet"}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}
        {!ui.quiz?.questionIds?.length && (
          <Field label="Number of questions" hint={available < Number(count) ? `Only ${available} available in this selection.` : undefined}>
            <Segmented label="Number of questions" value={count} onChange={setCount} options={["5", "10", "15", "20"].map((v) => ({ value: v, label: v }))} />
          </Field>
        )}
        <Field label="Mode">
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Quiz mode">
            {([
              ["practice", "Practice", "See feedback after each answer", GraduationCap],
              ["exam", "Exam mode", "Answers hidden until the end", Clock],
            ] as const).map(([v, l, h, Icon]) => (
              <button key={v} role="radio" aria-checked={mode === v} onClick={() => setMode(v)} className={cn("flex items-start gap-3 rounded-lg border p-3 text-left transition-colors focus-ring", mode === v ? "border-primary bg-primary-soft/60" : "hover:bg-accent")}>
                <Icon className={cn("mt-0.5 size-4", mode === v ? "text-primary" : "text-muted-foreground")} />
                <span>
                  <span className="block text-sm font-medium">{l}</span>
                  <span className="block text-xs text-muted-foreground">{h}</span>
                </span>
              </button>
            ))}
          </div>
        </Field>
        <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
          <label htmlFor="quiz-timer" className="flex items-center gap-2.5 text-sm font-medium">
            <Timer className="size-4 text-muted-foreground" /> Timer
          </label>
          <div className="flex items-center gap-3">
            {timed && <MinutesInput id="quiz-minutes" value={minutes} onChange={setMinutes} />}
            <Switch id="quiz-timer" checked={timed} onChange={setTimed} label="Use a timer" />
          </div>
        </div>
      </div>
    </Dialog>
  );
}
