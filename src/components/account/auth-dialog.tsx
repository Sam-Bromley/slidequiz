import { oneWay, trackConversion } from "@/services/ads";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { Link } from "@/lib/router";
import { cn } from "@/lib/utils";
import { isThrowawayEmail } from "@/lib/email";
import { GOOGLE_CLIENT_ID, googleSignIn, logInWithGoogleToken, providersAvailable, logIn, sendPasswordReset, setNewPassword, signUp, useAccount } from "@/services/account";

export type AuthMode = "login" | "signup" | "forgot";

const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

/** Log in, create an account, or get a password-reset email. */
export function AuthDialog({ initial = "login", onClose, reason }: { initial?: AuthMode; onClose: () => void; reason?: string }) {
  const [mode, setMode] = useState<AuthMode>(initial);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState<null | "confirm" | "reset">(null);
  const [google, setGoogle] = useState(false);
  const [apple, setApple] = useState(false);
  useEffect(() => {
    let live = true;
    // Apple sign-in is offered on phones and tablets (where it's built in); Google everywhere.
    const phone = window.matchMedia("(pointer: coarse)").matches || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    providersAvailable().then((on) => {
      if (!live) return;
      setGoogle(on.google);
      setApple(on.apple && phone);
    });
    return () => {
      live = false;
    };
  }, []);
  // Logged in some other way (Google, or another tab): nothing more to do here.
  const { user } = useAccount();
  const hadUser = useRef(!!user);
  useEffect(() => {
    if (user && !hadUser.current) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

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
        if (isThrowawayEmail(email)) throw new Error("Please use your normal email address. Temporary email services aren't supported.");
        const r = await signUp(email, password, name);
        // A one-way code (not the email itself), so the same sign-up isn't counted twice.
        trackConversion("signup", { value: 1, id: oneWay(email.trim().toLowerCase()) });
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
        {reason && mode !== "forgot" && <p className="text-[14px] leading-relaxed text-foreground/85">{reason}</p>}
        {(google || apple) && mode !== "forgot" && (
          <>
            <div className="space-y-2.5">
              {apple && (
                <button type="button" onClick={() => googleSignIn("apple")} className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-black text-[15px] font-medium text-white transition-opacity hover:opacity-90 focus-ring dark:bg-white dark:text-black">
                  <AppleMark /> Sign in with Apple
                </button>
              )}
              {google && <GoogleButton onError={setError} />}
            </div>
            <div className="flex items-center gap-3 text-[12px] text-muted-foreground" aria-hidden>
              <span className="h-px flex-1 bg-border" /> or with email <span className="h-px flex-1 bg-border" />
            </div>
          </>
        )}
        {mode === "signup" && (
          <Field label="First name" htmlFor="auth-name" hint="Optional.">
            <Input id="auth-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" maxLength={40} data-autofocus />
          </Field>
        )}
        <Field label="Email" htmlFor="auth-email">
          <Input id="auth-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" data-autofocus={mode !== "signup" || undefined} />
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

/* ---------------------------------------------------------------- Google's own button */

declare global {
  interface Window {
    google?: { accounts: { id: { initialize: (o: Record<string, unknown>) => void; renderButton: (el: HTMLElement, o: Record<string, unknown>) => void } } };
  }
}

let gsiLoad: Promise<boolean> | null = null;
/** Loads Google's sign-in script (only when the log-in box opens). False if it can't load. */
function loadGsi(): Promise<boolean> {
  gsiLoad ??= new Promise((resolve) => {
    if (window.google?.accounts?.id) return resolve(true);
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => resolve(!!window.google?.accounts?.id);
    s.onerror = () => {
      gsiLoad = null;
      resolve(false);
    };
    document.head.appendChild(s);
    setTimeout(() => resolve(!!window.google?.accounts?.id), 8000);
  });
  return gsiLoad;
}

const randomNonce = () => [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
async function sha256(text: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * "Sign in with Google" using Google's own button, so Google's window shows slidequiz.co.uk.
 * If Google's script is blocked (some school networks and ad blockers), falls back to our own
 * button, which signs in through Supabase instead.
 */
function GoogleButton({ onError }: { onError: (msg: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "fallback">("loading");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    (async () => {
      const ok = await loadGsi();
      if (!live) return;
      if (!ok || !box.current || !window.google) return setState("fallback");
      const raw = randomNonce();
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        nonce: await sha256(raw),
        ux_mode: "popup",
        auto_select: false,
        itp_support: true,
        callback: async (r: { credential?: string }) => {
          if (!r.credential) return;
          setBusy(true);
          try {
            await logInWithGoogleToken(r.credential, raw);
          } catch (e) {
            onError((e as Error).message || "Couldn't log in with Google. Try again.");
          } finally {
            setBusy(false);
          }
        },
      });
      const dark = document.documentElement.classList.contains("dark");
      window.google.accounts.id.renderButton(box.current, { type: "standard", theme: dark ? "filled_black" : "outline", size: "large", text: "signin_with", shape: "rectangular", logo_alignment: "center", width: Math.min(400, Math.round(box.current.clientWidth || 320)) });
      setState("ready");
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (state === "fallback")
    return (
      <button type="button" onClick={() => googleSignIn("google")} className="flex h-11 w-full items-center justify-center gap-2.5 rounded-md border border-[#747775] bg-white text-[14.5px] font-medium text-[#1f1f1f] transition-colors hover:bg-[#f2f2f2] focus-ring dark:border-[#8e918f] dark:bg-[#131314] dark:text-[#e3e3e3] dark:hover:bg-[#1f1f20]">
        <GoogleMark /> Sign in with Google
      </button>
    );
  return (
    <div className="relative flex min-h-[44px] w-full justify-center" aria-busy={busy || state === "loading"}>
      <div ref={box} className={cn("flex w-full justify-center", busy && "pointer-events-none opacity-50")} />
      {state === "loading" && <div className="shimmer absolute inset-0 rounded-md" aria-hidden />}
    </div>
  );
}

/** Google's "G", as its sign-in button guidelines ask for. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-[18px]" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

/** Apple's logo, as its sign-in button guidelines ask for. */
function AppleMark() {
  return (
    <svg viewBox="0 0 814 1000" className="mb-0.5 size-[17px]" fill="currentColor" aria-hidden>
      <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105.6-57-155.5-127C46.7 790.7 0 663 0 541.8c0-194.4 126.4-297.5 250.8-297.5 66.1 0 121.2 43.4 162.7 43.4 39.5 0 101.1-46 176.3-46 28.5 0 130.9 2.6 198.3 99.2zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z" />
    </svg>
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
