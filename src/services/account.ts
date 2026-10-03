/**
 * Accounts and syncing, using Supabase (supabase.com).
 * Logins go through Supabase Auth; each student's work is one row in the `user_data` table,
 * which only they can read or write (row-level security). Slide pictures stay on the device.
 *
 * Without an account nothing changes: work is saved in the browser as before.
 */
import { useSyncExternalStore } from "react";
import { authCallback } from "@/lib/auth-callback";
import type { AppData } from "@/services/db/types";
import { emptyData, SCHEMA_VERSION } from "@/store/defaults";
import { getState, replaceState, subscribeState } from "@/store/store";

export const SUPABASE_URL = "https://oksfbksrfrqsbtmjqtfz.supabase.co";
export const SUPABASE_KEY = "sb_publishable_yJFM6esr9Ojyo_U617W3Dw_S0Bwdx2P";

interface Session {
  access_token: string;
  refresh_token: string;
  /** Seconds since 1970. */
  expires_at: number;
  user: { id: string; email: string };
}

export type SyncStatus = "off" | "syncing" | "saved" | "offline" | "error";

export interface AccountState {
  user: { id: string; email: string } | null;
  status: SyncStatus;
  /** Set after a "reset password" link: the student should choose a new password. */
  recovering: boolean;
  /** A message from an email link (e.g. "Email confirmed" or an expired-link error). */
  notice: string | null;
}

const SESSION_KEY = "slidequiz:auth";
const META_KEY = "slidequiz:sync";

let state: AccountState = { user: null, status: "off", recovering: false, notice: null };
const listeners = new Set<() => void>();
const set = (p: Partial<AccountState>) => {
  state = { ...state, ...p };
  listeners.forEach((l) => l());
};

export function useAccount(): AccountState {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => state,
    () => state,
  );
}

/* ------------------------------------------------------------------ storage helpers */

function load<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function save(key: string, v: unknown) {
  try {
    if (v == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* storage full or blocked */
  }
}

let session: Session | null = load<Session>(SESSION_KEY);
/** Which account this device last synced with, and the server's timestamp at that point. */
let meta: { userId: string; syncedAt: string } | null = load(META_KEY);
/** True when there are local changes the server hasn't got yet. */
let dirty = false;

function setSession(s: Session | null) {
  session = s;
  save(SESSION_KEY, s);
  set({ user: s ? s.user : null, status: s ? state.status : "off" });
}

/* ------------------------------------------------------------------ Supabase requests */

export class AccountError extends Error {}

const FRIENDLY: [RegExp, string][] = [
  [/invalid login credentials/i, "That email and password don't match."],
  [/email not confirmed/i, "Confirm your email first. Check your inbox for the link."],
  [/user already registered|already been registered/i, "There's already an account with that email. Log in instead."],
  [/password should be at least/i, "Use a password with at least 6 characters."],
  [/rate limit|too many/i, "Too many tries. Wait a few minutes and try again."],
  [/unable to validate email|invalid format|email address .* is invalid/i, "That email address doesn't look right."],
  [/same.*password|different from the old/i, "Choose a different password from your old one."],
  [/expired|invalid.*(token|link)|otp/i, "That link has expired. Ask for a new one."],
];
const friendly = (msg: string) => FRIENDLY.find(([re]) => re.test(msg))?.[1] ?? msg;

async function call<T>(path: string, init: RequestInit & { auth?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = { apikey: SUPABASE_KEY, "Content-Type": "application/json", ...(init.headers as Record<string, string>) };
  if (init.auth) {
    const token = await accessToken();
    if (!token) throw new AccountError("You've been logged out. Log in again.");
    headers.Authorization = `Bearer ${token}`;
  }
  let res: Response;
  try {
    res = await fetch(SUPABASE_URL + path, { ...init, headers });
  } catch {
    throw new AccountError("Couldn't reach the server. Check your internet connection.");
  }
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) throw new AccountError(friendly(body?.msg ?? body?.error_description ?? body?.message ?? body?.error ?? `Something went wrong (${res.status}).`));
  return body as T;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at?: number;
  user: { id: string; email: string };
}
const toSession = (t: TokenResponse): Session => ({
  access_token: t.access_token,
  refresh_token: t.refresh_token,
  expires_at: t.expires_at ?? Math.floor(Date.now() / 1000) + t.expires_in,
  user: { id: t.user.id, email: t.user.email },
});

let refreshing: Promise<string | null> | null = null;
async function accessToken(): Promise<string | null> {
  if (!session) return null;
  if (session.expires_at - 60 > Date.now() / 1000) return session.access_token;
  refreshing ??= (async () => {
    try {
      const t = await call<TokenResponse>("/auth/v1/token?grant_type=refresh_token", { method: "POST", body: JSON.stringify({ refresh_token: session!.refresh_token }) });
      setSession(toSession(t));
      return session!.access_token;
    } catch (e) {
      // A rejected refresh token means the login has ended; a network error doesn't.
      if (e instanceof AccountError && !/reach the server/.test(e.message)) setSession(null);
      return null;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

/** For other parts of the site that call Supabase as the logged-in student (e.g. the AI helper). */
export const isLoggedIn = () => !!session;
export const authToken = () => accessToken();

/** Where email links send people back to (this page, whichever address it's on). */
const redirectTo = () => encodeURIComponent(window.location.origin + window.location.pathname);

/* ------------------------------------------------------------------ public actions */

export async function logIn(email: string, password: string) {
  const t = await call<TokenResponse>("/auth/v1/token?grant_type=password", { method: "POST", body: JSON.stringify({ email: email.trim(), password }) });
  setSession(toSession(t));
  await syncNow(true);
}

/** Returns "confirm" when Supabase wants the email confirmed before the first login. */
export async function signUp(email: string, password: string, name = ""): Promise<"done" | "confirm"> {
  // The first name (optional) is only used to greet them, e.g. "Hey Alex," in the welcome email.
  const first = name.trim().replace(/\s+/g, " ").slice(0, 40);
  const r = await call<TokenResponse | { id: string; identities?: unknown[] }>(`/auth/v1/signup?redirect_to=${redirectTo()}`, { method: "POST", body: JSON.stringify({ email: email.trim(), password, ...(first ? { data: { name: first } } : {}) }) });
  if ("access_token" in r && r.access_token) {
    setSession(toSession(r));
    await syncNow(true);
    return "done";
  }
  // An existing, confirmed email comes back with no identities (Supabase hides that it exists).
  if ("identities" in r && Array.isArray(r.identities) && r.identities.length === 0) throw new AccountError("There's already an account with that email. Log in instead.");
  return "confirm";
}

export async function sendPasswordReset(email: string) {
  await call(`/auth/v1/recover?redirect_to=${redirectTo()}`, { method: "POST", body: JSON.stringify({ email: email.trim() }) });
}

export async function setNewPassword(password: string) {
  await call("/auth/v1/user", { method: "PUT", auth: true, body: JSON.stringify({ password }) });
  set({ recovering: false, notice: null });
}

export async function logOut() {
  if (session && dirty) await push().catch(() => {});
  const token = session?.access_token;
  setSession(null);
  meta = null;
  save(META_KEY, null);
  dirty = false;
  if (token) fetch(SUPABASE_URL + "/auth/v1/logout", { method: "POST", headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` } }).catch(() => {});
  // Leave this device clean (it may be shared); the work is safe in the account.
  const s = getState();
  applying = true;
  replaceState({ ...emptyData(s.settings.theme), settings: s.settings, onboarded: true });
  applying = false;
}

export function clearNotice() {
  set({ notice: null });
}

/** Deletes the login and everything saved to it (a database function; see the setup SQL). */
export async function deleteAccount() {
  if (!session) return;
  try {
    await call("/rest/v1/rpc/delete_account", { method: "POST", auth: true, body: "{}" });
  } catch (e) {
    const msg = (e as Error).message;
    if (/reach the server/.test(msg)) throw e;
    throw new AccountError("Couldn't delete your account here. Email slidequiz.help@outlook.com and we'll do it for you.");
  }
  dirty = false;
  const s = getState();
  setSession(null);
  meta = null;
  save(META_KEY, null);
  applying = true;
  replaceState({ ...emptyData(s.settings.theme), settings: s.settings, onboarded: true });
  applying = false;
}

/** Deletes the account's saved copy (used by "Delete all data"). */
export async function deleteCloudData() {
  if (!session) return;
  await call(`/rest/v1/user_data?user_id=eq.${session.user.id}`, { method: "DELETE", auth: true });
}

/* ------------------------------------------------------------------ syncing */

interface Row {
  data: AppData;
  updated_at: string;
}

async function pull(): Promise<Row | null> {
  const rows = await call<Row[]>(`/rest/v1/user_data?select=data,updated_at&user_id=eq.${session!.user.id}`, { auth: true });
  return rows[0] ?? null;
}

async function push() {
  if (!session) return;
  const updated_at = new Date().toISOString();
  const data = getState();
  await call("/rest/v1/user_data", {
    method: "POST",
    auth: true,
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ user_id: session.user.id, data, updated_at }),
  });
  meta = { userId: session.user.id, syncedAt: updated_at };
  save(META_KEY, meta);
  dirty = false;
}

/** Combine two copies: everything from both, the account's version winning where both have it. */
function merge(local: AppData, remote: AppData): AppData {
  const byId = <T extends { id: string }>(a: T[] = [], b: T[] = []) => [...b, ...a.filter((x) => !b.some((y) => y.id === x.id))];
  return {
    ...local,
    ...remote,
    schemaVersion: SCHEMA_VERSION,
    materials: byId(local.materials, remote.materials),
    questions: byId(local.questions, remote.questions),
    flashcards: byId(local.flashcards, remote.flashcards),
    decks: byId(local.decks, remote.decks),
    essays: byId(local.essays, remote.essays),
    essayDrafts: byId(local.essayDrafts, remote.essayDrafts),
    folders: byId(local.folders, remote.folders),
    attempts: byId(local.attempts, remote.attempts),
    sessions: byId(local.sessions, remote.sessions),
    plans: byId(local.plans, remote.plans),
    generations: byId(local.generations, remote.generations),
    saved: [...(remote.saved ?? []), ...(local.saved ?? []).filter((x) => !(remote.saved ?? []).some((y) => y.questionId === x.questionId))],
    summaries: { ...local.summaries, ...remote.summaries },
    chats: { ...local.chats, ...remote.chats },
    drafts: { ...local.drafts, ...remote.drafts },
  };
}

/** Apply the server's copy without it counting as a new local change. */
let applying = false;
function apply(d: AppData) {
  applying = true;
  replaceState({ ...emptyData(), ...d, schemaVersion: SCHEMA_VERSION });
  applying = false;
}

let syncing: Promise<void> | null = null;
/** Bring this device and the account into line. `fresh` = just logged in on this device. */
export function syncNow(fresh = false): Promise<void> {
  if (!session) return Promise.resolve();
  syncing ??= (async () => {
    set({ status: "syncing" });
    try {
      const remote = await pull();
      const uid = session!.user.id;
      if (!remote) {
        await push();
      } else if (fresh || meta?.userId !== uid) {
        // First time on this device: keep what's here and add what's in the account.
        const hasLocal = getState().materials.length || getState().flashcards.length;
        apply(hasLocal ? merge(getState(), remote.data) : remote.data);
        await push();
      } else if (remote.updated_at > meta.syncedAt) {
        // Changed on another device since this one last synced.
        apply(dirty ? merge(getState(), remote.data) : remote.data);
        if (dirty) await push();
        else {
          meta = { userId: uid, syncedAt: remote.updated_at };
          save(META_KEY, meta);
        }
      } else if (dirty) {
        await push();
      }
      set({ status: session ? "saved" : "off" });
    } catch (e) {
      set({ status: /reach the server/.test((e as Error).message) ? "offline" : "error" });
    } finally {
      syncing = null;
    }
  })();
  return syncing;
}

let timer: ReturnType<typeof setTimeout> | null = null;
function schedulePush() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    if (syncing) return schedulePush();
    // Upload in a quiet moment so it never makes the page stutter.
    const idle = (fn: () => void) => ("requestIdleCallback" in window ? window.requestIdleCallback(fn, { timeout: 3000 }) : setTimeout(fn, 0));
    idle(() => {
    set({ status: "syncing" });
    push()
      .then(() => set({ status: "saved" }))
      .catch((e) => set({ status: /reach the server/.test((e as Error).message) ? "offline" : "error" }));
    });
  }, 2000);
}

/** Start up: handle email links, restore the login and keep the account up to date. */
export function startAccount() {
  if (authCallback) {
    const err = authCallback.get("error_description") ?? authCallback.get("error");
    const token = authCallback.get("access_token");
    const type = authCallback.get("type");
    if (err) set({ notice: friendly(err.replace(/\+/g, " ")) });
    else if (token) {
      const expiresIn = Number(authCallback.get("expires_in") ?? 3600);
      const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      setSession({ access_token: token, refresh_token: authCallback.get("refresh_token") ?? "", expires_at: Math.floor(Date.now() / 1000) + expiresIn, user: { id: payload.sub, email: payload.email } });
      if (type === "recovery") set({ recovering: true, notice: "Choose a new password." });
      else set({ notice: "Your email is confirmed and you're logged in." });
    }
  }
  if (session) set({ user: session.user });
  subscribeState(() => {
    if (!session || applying) return;
    dirty = true;
    schedulePush();
  });
  if (session) syncNow(!!authCallback && !meta);
  // Pick up changes from other devices when coming back to the tab.
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && session && syncNow());
  window.addEventListener("online", () => session && syncNow());
  // Logged in from another tab (e.g. the email-confirmation link): pick it up here too.
  window.addEventListener("storage", (e) => {
    if (e.key !== SESSION_KEY || session) return;
    const s = load<Session>(SESSION_KEY);
    if (!s) return;
    session = s;
    set({ user: s.user });
    syncNow();
  });
}
