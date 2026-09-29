import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { Link } from "@/lib/router";
import { logIn, sendPasswordReset, setNewPassword, signUp } from "@/services/account";

export type AuthMode = "login" | "signup" | "forgot";

const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

/** Log in, create an account, or get a password-reset email. */
export function AuthDialog({ initial = "login", onClose }: { initial?: AuthMode; onClose: () => void }) {
  const [mode, setMode] = useState<AuthMode>(initial);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState<null | "confirm" | "reset">(null);

  const valid = emailOk(email) && (mode === "forgot" || password.length >= (mode === "signup" ? 6 : 1));
  const title = sent ? "Check your email" : mode === "login" ? "Log in" : mode === "signup" ? "Create account" : "Reset password";
  const switchTo = (m: AuthMode) => {
    setMode(m);
    setError("");
  };

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError("");
    try {
      if (mode === "login") {
        await logIn(email, password);
        toast("Logged in");
        onClose();
      } else if (mode === "signup") {
        const r = await signUp(email, password);
        if (r === "done") {
          toast("Account created");
          onClose();
        } else setSent("confirm");
      } else {
        await sendPasswordReset(email);
        setSent("reset");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (sent)
    return (
      <Dialog open onClose={onClose} title={title} size="sm" footer={<Button onClick={onClose}>OK</Button>}>
        <p className="text-[14px] leading-relaxed">
          {sent === "confirm" ? (
            <>We've sent a link to <b>{email.trim()}</b>. Open it to confirm your email, then you're logged in.</>
          ) : (
            <>If there's an account for <b>{email.trim()}</b>, we've sent it a link to choose a new password.</>
          )}
        </p>
        <p className="mt-2 text-[13px] text-muted-foreground">It can take a minute. Check your junk folder too.</p>
      </Dialog>
    );

  return (
    <Dialog
      open
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="auth-form" disabled={!valid} loading={busy}>
            {mode === "login" ? "Log in" : mode === "signup" ? "Create account" : "Send link"}
          </Button>
        </>
      }
    >
      <form
        id="auth-form"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field label="Email" htmlFor="auth-email">
          <Input id="auth-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" data-autofocus />
        </Field>
        {mode !== "forgot" && (
          <Field label="Password" htmlFor="auth-password" hint={mode === "signup" ? "At least 6 characters." : undefined}>
            <Input id="auth-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "signup" ? "new-password" : "current-password"} />
          </Field>
        )}
        {mode === "signup" && (
          <p className="text-[12.5px] text-muted-foreground">
            Your email and study work are saved to your account.{" "}
            <Link to="/privacy" onClick={onClose} className="underline underline-offset-2 hover:text-foreground">
              Privacy policy
            </Link>
          </p>
        )}
        {error && (
          <p role="alert" className="text-[13.5px] font-medium text-destructive">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-between gap-2 text-[13px] text-muted-foreground">
          {mode === "login" ? (
            <>
              <button type="button" className="rounded hover:text-foreground focus-ring" onClick={() => switchTo("forgot")}>
                Forgot password?
              </button>
              <button type="button" className="rounded hover:text-foreground focus-ring" onClick={() => switchTo("signup")}>
                Create an account
              </button>
            </>
          ) : (
            <button type="button" className="rounded hover:text-foreground focus-ring" onClick={() => switchTo("login")}>
              {mode === "signup" ? "Already have an account? Log in" : "Back to log in"}
            </button>
          )}
        </div>
      </form>
    </Dialog>
  );
}

/** After a reset-password link: choose the new password. */
export function NewPasswordDialog({ onClose }: { onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Dialog
      open
      onClose={onClose}
      title="Choose a new password"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="newpw-form" disabled={password.length < 6} loading={busy}>
            Save password
          </Button>
        </>
      }
    >
      <form
        id="newpw-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (password.length < 6) return;
          setBusy(true);
          setError("");
          try {
            await setNewPassword(password);
            toast("Password changed");
            onClose();
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="New password" htmlFor="newpw" hint="At least 6 characters.">
          <Input id="newpw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" data-autofocus />
        </Field>
        {error && (
          <p role="alert" className="mt-3 text-[13.5px] font-medium text-destructive">
            {error}
          </p>
        )}
      </form>
    </Dialog>
  );
}
