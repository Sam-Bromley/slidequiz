import { Download, LogIn, LogOut, RotateCcw, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AuthDialog, NewPasswordDialog, type AuthMode } from "@/components/account/auth-dialog";
import { clearNotice, deleteCloudData, logOut, useAccount, type SyncStatus } from "@/services/account";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Input, Select } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { download } from "@/lib/utils";
import { actions } from "@/store/actions";
import { useData } from "@/store/store";
import { backupName, makeBackup, restoreBackup } from "@/services/backup";
import type { BackgroundScene, Settings, ThemeName } from "@/types/models";
import { DEFAULT_NIGHT, THEMES } from "@/lib/theme";
import { SCENE_ORDER } from "@/components/layout/app-background";
import { sceneLabel } from "@/components/layout/personalise";

const STATUS: Record<SyncStatus, string | undefined> = {
  off: undefined,
  syncing: "Saving…",
  saved: "Your work is saved to your account",
  offline: "Offline. Your work will save when you're back online",
  error: "Couldn't save to your account. It will try again",
};

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

function Row({ label, hint, htmlFor, children, inline }: { label: string; hint?: string; htmlFor?: string; children: React.ReactNode; inline?: boolean }) {
  return (
    <div className={inline ? "flex items-center justify-between gap-4" : "flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"}>
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
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const account = useAccount();
  const [auth, setAuth] = useState<AuthMode | null>(null);
  const [newPw, setNewPw] = useState(false);
  // Messages from email links (confirmed, expired link, choose a new password).
  useEffect(() => {
    if (account.recovering) setNewPw(true);
    else if (account.notice) {
      toast(account.notice);
      clearNotice();
    }
  }, [account.recovering, account.notice]);
  const [confirm, setConfirm] = useState<null | "materials" | "history" | "all">(null);
  const set = (p: Partial<Settings>) => {
    actions.updateSettings(p);
    toast("Settings saved");
  };

  return (
    <div className="max-w-4xl">
      <PageHeader title="Settings" description="Changes save automatically." />

      <Section title="Account">
        {account.user ? (
          <Row label={account.user.email} hint={STATUS[account.status]}>
            <Button
              variant="outline"
              onClick={async () => {
                await logOut();
                toast("Logged out");
              }}
            >
              <LogOut /> Log out
            </Button>
          </Row>
        ) : (
          <Row label="Not logged in">
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setAuth("signup")}>
                Create account
              </Button>
              <Button onClick={() => setAuth("login")}>
                <LogIn /> Log in
              </Button>
            </div>
          </Row>
        )}
      </Section>

      <Section title="Appearance">
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
        <Row label="Quote of the day" htmlFor="set-quote" inline>
          <Switch id="set-quote" checked={s.showQuote !== false} onChange={(v) => set({ showQuote: v })} label="Quote of the day" />
        </Row>
        <Row label="Night light" htmlFor="set-night" inline>
          <Switch id="set-night" checked={!!s.nightLightAuto} onChange={(v) => set({ nightLightAuto: v })} label="Night light" />
        </Row>
        {s.nightLightAuto && (
          <Row label="Night light times">
            <div className="flex items-center gap-2 text-[14px]">
              <Input type="time" onClick={(e) => (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.()} aria-label="Night light starts" value={s.nightStart ?? DEFAULT_NIGHT.start} onChange={(e) => e.target.value && set({ nightStart: e.target.value })} className="w-[120px] cursor-pointer" />
              <span className="text-muted-foreground">to</span>
              <Input type="time" onClick={(e) => (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.()} aria-label="Night light ends" value={s.nightEnd ?? DEFAULT_NIGHT.end} onChange={(e) => e.target.value && set({ nightEnd: e.target.value })} className="w-[120px] cursor-pointer" />
            </div>
          </Row>
        )}
      </Section>

      <Section title="Practice">
        <Row label="Answer options" htmlFor="set-opts">
          <Select id="set-opts" value={s.mcqOptions ?? 5} onChange={(e) => set({ mcqOptions: Number(e.target.value) })} className="sm:w-48">
            {[3, 4, 5, 6].map((n) => <option key={n} value={n}>{n} options (A to {"ABCDEF"[n - 1]})</option>)}
          </Select>
        </Row>
      </Section>

      <Section title="Data">
        <Row label="Back up">
          <Button
            variant="outline"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await download(backupName(), await makeBackup(), "application/json");
              } finally {
                setBusy(false);
              }
            }}
          >
            <Download /> Download backup
          </Button>
        </Row>
        <Row label="Restore from backup">
          <Button variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}>
            <Upload /> Restore
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) setRestoring(f);
            }}
          />
        </Row>
        <Row label="Delete materials">
          <Button variant="outline" onClick={() => setConfirm("materials")} disabled={!data.materials.length}>
            <Trash2 /> Delete materials
          </Button>
        </Row>
        <Row label="Delete history">
          <Button variant="outline" onClick={() => setConfirm("history")} disabled={!data.attempts.length && !data.sessions.length}>
            <RotateCcw /> Delete history
          </Button>
        </Row>
        <Row label="Delete all data">
          <Button variant="destructive" onClick={() => setConfirm("all")}>
            <Trash2 /> Delete everything
          </Button>
        </Row>
      </Section>

      <ConfirmDialog open={confirm === "materials"} onClose={() => setConfirm(null)} title="Delete all materials?" description="All materials, questions, flashcards, summaries and plans will be removed." onConfirm={() => toast.undo("All materials deleted", actions.deleteAllMaterials())} />
      <ConfirmDialog open={confirm === "history"} onClose={() => setConfirm(null)} title="Delete your study history?" description="Quiz results, streaks and flashcard scheduling will be reset. Your materials and questions stay." onConfirm={() => toast.undo("History deleted", actions.deleteHistory())} />
      <ConfirmDialog open={confirm === "all"} onClose={() => setConfirm(null)} title="Delete all your data?" description="This can't be undone." requireText="delete" confirmLabel="Delete everything" onConfirm={async () => { if (account.user) await deleteCloudData().catch(() => {}); actions.deleteEverything(); toast("All data deleted"); }} />
      {auth && <AuthDialog initial={auth} onClose={() => setAuth(null)} />}
      {newPw && <NewPasswordDialog onClose={() => { setNewPw(false); clearNotice(); }} />}
      <ConfirmDialog
        open={!!restoring}
        onClose={() => setRestoring(null)}
        title="Restore this backup?"
        description="Everything currently in SlideQuiz on this device will be replaced by the backup."
        confirmLabel="Restore"
        onConfirm={async () => {
          const f = restoring;
          setRestoring(null);
          if (!f) return;
          setBusy(true);
          try {
            const r = await restoreBackup(f);
            toast(`Backup restored (${r.materials} material${r.materials === 1 ? "" : "s"})`);
          } catch (err) {
            toast((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}
