import { Download, RotateCcw, Trash2, UserRound } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { DIFFICULTY_SETTINGS } from "@/components/questions/meta";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Field, Input, Select } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { download, plural } from "@/lib/utils";
import { actions } from "@/store/actions";
import { getState, useData } from "@/store/store";
import type { AcademicLevel, BackgroundScene, DifficultySetting, Settings, ThemeName } from "@/types/models";
import { DEFAULT_NIGHT, THEMES } from "@/lib/theme";
import { MinutesInput } from "@/components/ui/minutes-input";
import { SCENE_ORDER } from "@/components/layout/app-background";
import { sceneLabel } from "@/components/layout/personalise";

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 border-b py-8 first:pt-0 last:border-0 md:grid-cols-[240px_1fr] md:gap-10">
      <div>
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {description && <p className="mt-1 text-[13px] text-muted-foreground">{description}</p>}
      </div>
      <div className="space-y-5">{children}</div>
    </section>
  );
}

function Row({ label, hint, htmlFor, children }: { label: string; hint?: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <label htmlFor={htmlFor} className="text-[14px]">
        <span className="block font-medium">{label}</span>
        {hint && <span className="block text-[12.5px] text-muted-foreground">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

export function SettingsPage() {
  const data = useData();
  const s = data.settings;
  const [name, setName] = useState(data.user.name);
  const [email, setEmail] = useState(data.user.email);
  const [confirm, setConfirm] = useState<null | "materials" | "history" | "all">(null);
  const set = (p: Partial<Settings>) => {
    actions.updateSettings(p);
    toast("Settings saved");
  };
  const emailOk = !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  return (
    <div className="max-w-4xl">
      <PageHeader title="Settings" description="Changes save automatically." />

      <Section title="Appearance" description="Also available from the palette button in the top right.">
        <Row label="Theme" htmlFor="set-theme">
          <Select id="set-theme" value={THEMES.some((t) => t.value === s.theme) ? s.theme : "light"} onChange={(e) => actions.updateSettings({ theme: e.target.value as ThemeName })} className="sm:w-48">
            {THEMES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </Select>
        </Row>
        <Row label="Background" htmlFor="set-scene">
          <Select id="set-scene" value={SCENE_ORDER.includes(s.scene ?? "none") ? s.scene ?? "none" : "none"} onChange={(e) => actions.updateSettings({ scene: e.target.value as BackgroundScene })} className="sm:w-48">
            {SCENE_ORDER.map((sc) => <option key={sc} value={sc}>{sceneLabel(sc)}</option>)}
          </Select>
        </Row>
        <Row label="Automatic night light" hint="Switch to warm, low-blue colours at set times" htmlFor="set-night">
          <Switch id="set-night" checked={!!s.nightLightAuto} onChange={(v) => set({ nightLightAuto: v })} label="Automatic night light" />
        </Row>
        {s.nightLightAuto && (
          <Row label="Night light hours" hint="Can run past midnight">
            <div className="flex items-center gap-2 text-[14px]">
              <Input type="time" aria-label="Night light starts" value={s.nightStart ?? DEFAULT_NIGHT.start} onChange={(e) => e.target.value && set({ nightStart: e.target.value })} className="w-[120px]" />
              <span className="text-muted-foreground">to</span>
              <Input type="time" aria-label="Night light ends" value={s.nightEnd ?? DEFAULT_NIGHT.end} onChange={(e) => e.target.value && set({ nightEnd: e.target.value })} className="w-[120px]" />
            </div>
          </Row>
        )}
        <p className="text-[12.5px] text-muted-foreground">Night light uses warm amber tones with very little blue light, which is easier on your eyes late at night. For the full effect, also turn on your device's night mode.</p>
      </Section>

      <Section title="Study" description="Defaults for new questions and quizzes.">
        <Row label="Default difficulty" htmlFor="set-diff">
          <Select id="set-diff" value={s.defaultDifficulty} onChange={(e) => set({ defaultDifficulty: e.target.value as DifficultySetting })} className="sm:w-48">
            {DIFFICULTY_SETTINGS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </Select>
        </Row>
        <Row label="Default question count" htmlFor="set-count">
          <Select id="set-count" value={s.defaultCount} onChange={(e) => set({ defaultCount: Number(e.target.value) })} className="sm:w-48">
            {[5, 10, 15, 20].map((n) => <option key={n} value={n}>{n} questions</option>)}
          </Select>
        </Row>
        <Row label="Show explanations" hint="After each answer in practice mode" htmlFor="set-expl">
          <Switch id="set-expl" checked={s.showExplanations} onChange={(v) => set({ showExplanations: v })} label="Show explanations" />
        </Row>
        <Row label="Quiz timer" hint="Default for new quizzes" htmlFor="set-timer">
          <div className="flex items-center gap-3">
            {s.defaultTimerMinutes != null && <MinutesInput id="set-timer-min" value={s.defaultTimerMinutes} onChange={(m) => set({ defaultTimerMinutes: m })} />}
            <Switch id="set-timer" checked={s.defaultTimerMinutes != null} onChange={(v) => set({ defaultTimerMinutes: v ? 20 : null })} label="Use a timer by default" />
          </div>
        </Row>
        <Row label="Academic level" htmlFor="set-level">
          <Select id="set-level" value={data.user.level} onChange={(e) => { actions.updateUser({ level: e.target.value as AcademicLevel }); toast("Settings saved"); }} className="sm:w-48">
            {(["GCSE", "A-Level", "University", "Custom"] as const).map((l) => <option key={l}>{l}</option>)}
          </Select>
        </Row>
      </Section>

      <Section title="Account" description="Stored on this device until sign-in is connected.">
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!emailOk) return;
            actions.updateUser({ name: name.trim(), email: email.trim() });
            toast("Account updated");
          }}
        >
          <Field label="Name" htmlFor="acc-name">
            <Input id="acc-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </Field>
          <Field label="Email" htmlFor="acc-email">
            <Input id="acc-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" aria-invalid={!emailOk} aria-describedby={!emailOk ? "email-err" : undefined} />
            {!emailOk && <p id="email-err" className="text-xs text-destructive">Enter a valid email address.</p>}
          </Field>
          <div className="sm:col-span-2">
            <Button type="submit" variant="outline" disabled={name === data.user.name && email === data.user.email}>
              <UserRound /> Save account
            </Button>
          </div>
        </form>
      </Section>

      <Section title="Data" description="Deleting shows an Undo option for a few seconds.">
        <Row label="Export my data" hint="Everything as a JSON file">
          <Button variant="outline" onClick={() => download("slidequiz-data.json", JSON.stringify(getState(), null, 2), "application/json")}>
            <Download /> Export
          </Button>
        </Row>
        <Row label="Delete materials" hint={`${plural(data.materials.length, "material")} with their questions and flashcards`}>
          <Button variant="outline" onClick={() => setConfirm("materials")} disabled={!data.materials.length}>
            <Trash2 /> Delete materials
          </Button>
        </Row>
        <Row label="Delete history" hint="Quiz results, study sessions and flashcard progress">
          <Button variant="outline" onClick={() => setConfirm("history")} disabled={!data.attempts.length && !data.sessions.length}>
            <RotateCcw /> Delete history
          </Button>
        </Row>
        <Row label="Delete account & all data" hint="Removes everything stored by SlideQuiz on this device">
          <Button variant="destructive" onClick={() => setConfirm("all")}>
            <Trash2 /> Delete everything
          </Button>
        </Row>
      </Section>

      <ConfirmDialog open={confirm === "materials"} onClose={() => setConfirm(null)} title="Delete all materials?" description="All materials, questions, flashcards, summaries and plans will be removed." onConfirm={() => toast.undo("All materials deleted", actions.deleteAllMaterials())} />
      <ConfirmDialog open={confirm === "history"} onClose={() => setConfirm(null)} title="Delete your study history?" description="Quiz results, streaks and flashcard scheduling will be reset. Your materials and questions stay." onConfirm={() => toast.undo("History deleted", actions.deleteHistory())} />
      <ConfirmDialog open={confirm === "all"} onClose={() => setConfirm(null)} title="Delete your account and all data?" description="This can't be undone." requireText="delete" confirmLabel="Delete everything" onConfirm={() => { actions.deleteEverything(); setName(""); setEmail(""); toast("All data deleted"); }} />
    </div>
  );
}
