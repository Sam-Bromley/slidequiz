import { Check, Copy, Crown, Download, Gift, LogIn, LogOut, RotateCcw, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AuthDialog, NewPasswordDialog, type AuthMode } from "@/components/account/auth-dialog";
import { clearNotice, deleteAccount, deleteCloudData, logOut, useAccount, type SyncStatus } from "@/services/account";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { CONTACT_EMAIL } from "@/pages/privacy";
import { openBilling, PLUS, PLUS_ON, usePlan } from "@/services/plus";
import { lecturesLeft, useAllowance } from "@/services/ai/cloud";
import { openInvite } from "@/services/invites";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Input, Select } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Shimmer } from "@/components/ui/shimmer";
import { toast } from "@/components/ui/toast";
import { cn, download } from "@/lib/utils";
import { actions } from "@/store/actions";
import { useData } from "@/store/store";
import { Link } from "@/lib/router";
import { backupName, makeBackup, restoreBackup } from "@/services/backup";
import type { BackgroundScene, Settings, ThemeName } from "@/types/models";
import { baseTheme, DEFAULT_NIGHT } from "@/lib/theme";
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

function AllowanceRow() {
  const a = useAllowance();
  const total = a ? Math.round(a.allowance / a.lecture) : 0;
  const left = a ? lecturesLeft(a) : 0;
  const pct = a ? Math.max(0, Math.min(100, Math.round(((a.allowance - a.used) / a.allowance) * 100))) : 0;
  return (
    <div className="flex items-center gap-3">
      <div className={cn("h-2 flex-1 overflow-hidden rounded-full", a ? "bg-muted" : "shimmer")} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Credits left">
        <div className="h-full rounded-full bg-brand transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
      {a ? <span className="shrink-0 text-[13.5px] font-medium tabular-nums">{`${left}/${total} left`}</span> : <Shimmer className="h-4 w-16" />}
      {a && (a.bonus ?? 0) >= a.lecture / 2 && <span className="shrink-0 rounded-md bg-primary-soft px-1.5 py-0.5 text-[11.5px] font-semibold text-primary">{`incl. ${Math.round(a.bonus! / a.lecture)} bonus`}</span>}
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
  const plan = usePlan();
  const [auth, setAuth] = useState<AuthMode | null>(null);
  const [newPw, setNewPw] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [copied, setCopied] = useState(false);
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
        {(PLUS_ON || plan.plus) && (
        <Row
            label={plan.plus ? "SlideQuiz Pro" : "Get more with Pro"}
            hint={plan.plus ? (plan.cancelling ? `Ends on ${new Date(plan.until!).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}` : "Thank you for supporting SlideQuiz") : `${PLUS.plusLectures} credits a month, ${PLUS.price} a ${PLUS.period}`}
          >
            {plan.plus && !plan.customer ? (
              <span />
            ) : plan.plus ? (
              <Button variant="outline" onClick={() => openBilling().catch((e) => toast((e as Error).message))}>
                Manage or cancel
              </Button>
            ) : (
              <Link to="/pro" className="inline-flex h-9 items-center gap-2 rounded-lg border bg-card px-4 text-sm font-medium hover:bg-accent focus-ring">
                <Crown className="size-4" /> See Pro
              </Link>
            )}
          </Row>
        )}
      </Section>

      <Section title="Credits">
        <AllowanceRow />
        <p className="text-[12.5px] text-muted-foreground">Credits are used to make notes and questions from a new lecture, flashcards, written answer questions and essay feedback.</p>
        {account.user && (
          <Row label="Invite friends" hint="Earn 3 free credits for every friend who signs up with your link and makes their first lecture. They get 3 too.">
            <Button variant="outline" onClick={openInvite}>
              <Gift /> Invite friends
            </Button>
          </Row>
        )}
      </Section>

      <Section title="Appearance">
        <Row label="Theme" htmlFor="set-theme">
          <Select id="set-theme" value={baseTheme(s)} onChange={(e) => actions.updateSettings({ theme: e.target.value as ThemeName, ...(s.theme === "warm" ? { nightLight: true } : {}) })} className="sm:w-48">
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </Select>
        </Row>
        <Row label="Background" htmlFor="set-scene">
          <Select
            id="set-scene"
            value={plan.plus && s.bgPhotoOn && s.bgPhoto ? "photo" : SCENE_ORDER.includes(s.scene ?? "none") ? s.scene ?? "none" : "none"}
            onChange={(e) => (e.target.value === "photo" ? actions.updateSettings({ bgPhotoOn: true }) : actions.updateSettings({ scene: e.target.value as BackgroundScene, bgPhotoOn: false }))}
            className="sm:w-48"
          >
            {SCENE_ORDER.map((sc) => <option key={sc} value={sc}>{sceneLabel(sc)}</option>)}
            {plan.plus && s.bgPhoto && <option value="photo">Your photo</option>}
          </Select>
        </Row>
        <Row label="Text size" htmlFor="set-size">
          <Select id="set-size" value={s.textSize ?? "default"} onChange={(e) => actions.updateSettings({ textSize: e.target.value as Settings["textSize"] })} className="sm:w-48">
            <option value="small">Small</option>
            <option value="default">Normal</option>
            <option value="large">Large</option>
            <option value="xl">Extra large</option>
          </Select>
        </Row>
        <Row label="Font" hint="Easy-read and dyslexia-friendly fonts for notes and questions" htmlFor="set-font">
          <Select id="set-font" value={s.font ?? "default"} onChange={(e) => actions.updateSettings({ font: e.target.value as Settings["font"] })} className="sm:w-48">
            <option value="default">Standard</option>
            <option value="readable">Easy-read (Atkinson)</option>
            <option value="dyslexic">Dyslexia-friendly</option>
          </Select>
        </Row>
        <Row label="Colour subjects" hint="Each subject gets its own soft colour on your materials" htmlFor="set-subjects" inline>
          <Switch id="set-subjects" checked={!!s.subjectColours} onChange={(v) => set({ subjectColours: v })} label="Colour subjects" />
        </Row>
        <Row label="Quote of the day" htmlFor="set-quote" inline>
          <Switch id="set-quote" checked={s.showQuote !== false} onChange={(v) => set({ showQuote: v })} label="Quote of the day" />
        </Row>
        <Row label="Night light at night" hint="Warms the colours automatically between the times you choose" htmlFor="set-night" inline>
          <Switch id="set-night" checked={!!s.nightLightAuto} onChange={(v) => set({ nightLightAuto: v })} label="Night light at night" />
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


      <Section title="Feedback">
        <Row label="Found a problem or have an idea?" hint="Email me and I'll reply to each and every message.">
          <div className="flex items-center gap-2">
            <span className="select-all rounded-lg border bg-card px-3 py-1.5 text-[14px]">{CONTACT_EMAIL}</span>
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(CONTACT_EMAIL);
                } catch {
                  // Older browsers: copy from a hidden text box.
                  const t = document.createElement("textarea");
                  t.value = CONTACT_EMAIL;
                  document.body.appendChild(t);
                  t.select();
                  document.execCommand("copy");
                  t.remove();
                }
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}
            </Button>
          </div>
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
        {account.user && (
          <Row label="Delete account">
            <Button variant="outline" onClick={() => setDeletingAccount(true)}>
              <Trash2 /> Delete account
            </Button>
          </Row>
        )}
        <Row label="Delete all data">
          <Button variant="destructive" onClick={() => setConfirm("all")}>
            <Trash2 /> Delete everything
          </Button>
        </Row>
      </Section>

      <ConfirmDialog open={confirm === "materials"} onClose={() => setConfirm(null)} title="Delete all materials?" description="All materials, questions, flashcards, summaries and plans will be removed." onConfirm={() => toast.undo("All materials deleted", actions.deleteAllMaterials())} />
      <ConfirmDialog open={confirm === "history"} onClose={() => setConfirm(null)} title="Delete your study history?" description="Quiz results, streaks and flashcard scheduling will be reset. Your materials and questions stay." onConfirm={() => toast.undo("History deleted", actions.deleteHistory())} />
      <ConfirmDialog open={confirm === "all"} onClose={() => setConfirm(null)} title="Delete all your data?" description="This can't be undone." requireText="delete" confirmLabel="Delete everything" onConfirm={async () => { if (account.user) await deleteCloudData().catch(() => {}); actions.deleteEverything(); toast("All data deleted"); }} />
      <ConfirmDialog
        open={deletingAccount}
        onClose={() => setDeletingAccount(false)}
        title="Delete your account?"
        description={plan.plus && plan.customer && !plan.cancelling ? "You still have Pro. Cancel it first with Settings → Manage or cancel, or you'll keep being charged. Then delete your account." : "Your login, email address and everything saved to your account are deleted. This can't be undone."}
        requireText="delete"
        confirmLabel="Delete account"
        onConfirm={async () => {
          if (plan.plus && plan.customer && !plan.cancelling) {
            toast("Cancel Pro first, then delete your account.");
            return;
          }
          try {
            await deleteAccount();
            toast("Account deleted");
          } catch (err) {
            toast((err as Error).message);
          }
        }}
      />
      <p className="mt-2 text-[13px] text-muted-foreground">
        <Link to="/privacy" className="underline-offset-2 hover:text-foreground hover:underline">
          Privacy policy
        </Link>
        <span aria-hidden> · </span>
        <a href="about/" className="underline-offset-2 hover:text-foreground hover:underline">
          About
        </a>
      </p>
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
