/**
 * Inviting friends: each student has a link (slidequiz.co.uk/?ref=CODE). A friend who signs up
 * through it, confirms their email and makes their first lecture gets 3 bonus credits, and so does
 * the student who invited them (up to 10 friends a month). The database does the rewarding (see
 * reward_invite in supabase/ai-setup.sql); this file keeps the code from the link until sign-up.
 */
import { useSyncExternalStore } from "react";
import { SUPABASE_KEY, SUPABASE_URL, authToken } from "@/services/account";

const REF_KEY = "slidequiz:ref";

// Arrived through someone's invite link: remember the code for when they sign up.
try {
  const url = new URL(window.location.href);
  const ref = url.searchParams.get("ref");
  if (ref) {
    if (/^[A-Za-z0-9]{4,12}$/.test(ref)) {
      localStorage.setItem(REF_KEY, ref.toUpperCase());
      sessionStorage.setItem("slidequiz:source", "Invite link");
    }
    url.searchParams.delete("ref");
    history.replaceState(null, "", url.pathname + url.search + url.hash);
  }
} catch {
  /* storage blocked */
}

/** The invite code they arrived with, if any (sent with their sign-up). */
export function storedRef(): string {
  try {
    return localStorage.getItem(REF_KEY) ?? "";
  } catch {
    return "";
  }
}

export interface InviteInfo {
  code: string;
  /** Friends rewarded this month, and in total. */
  month: number;
  total: number;
  max: number;
  reward: number;
}

/** The student's own invite code (made the first time) and how many friends have joined. */
export async function myInvite(): Promise<InviteInfo | null> {
  const token = await authToken();
  if (!token) return null;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/my_invite`, { method: "POST", headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: "{}" });
  if (!r.ok) throw new Error("Couldn't load your invite link. Try again.");
  return (await r.json()) as InviteInfo | null;
}

export const inviteLink = (code: string) => `https://slidequiz.co.uk/?ref=${code}`;

/* ---------------------------------------------------------------- the credits / invite dialog */

export type CreditsDialog = null | "invite" | "out";
let dialog: CreditsDialog = null;
const listeners = new Set<() => void>();
const setDialog = (d: CreditsDialog) => {
  dialog = d;
  listeners.forEach((l) => l());
};
/** "Invite friends" (from the sidebar, Settings, ...). */
export const openInvite = () => setDialog("invite");
/** Ran out of credits: invite a friend or get Pro. */
export const openOutOfCredits = () => setDialog("out");
export const closeCreditsDialog = () => setDialog(null);
export const useCreditsDialog = () =>
  useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => dialog,
    () => dialog,
  );
