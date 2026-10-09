/**
 * SlideQuiz Plus: a monthly subscription (through Stripe) that gives a much bigger daily AI allowance.
 * Whether someone has Plus lives in the `plans` table, which only Stripe's webhook writes to
 * (see supabase/functions/plus). The allowances themselves are enforced in supabase/ai-setup.sql.
 */
import { useEffect, useSyncExternalStore } from "react";
import { authToken, SUPABASE_KEY, SUPABASE_URL, useAccount } from "@/services/account";

/** Shown on the Plus page. Keep in step with the Stripe price and the limits in ai-setup.sql. */
/**
 * Set PLUS_LIVE to true once payments are set up (Stripe + the "plus" helper in Supabase).
 * While false, Plus shows as "Coming soon" and nothing offers it, except on a browser that has
 * opened slidequiz.co.uk/#/pro?test=1 (private testing; ?test=0 turns it off again).
 */
const PLUS_LIVE = true;
const TEST_KEY = "slidequiz:plus-test";
const testing = (() => {
  try {
    return localStorage.getItem(TEST_KEY) === "1";
  } catch {
    return false;
  }
})();
export const PLUS_ON = PLUS_LIVE || testing;

/** Handles ?test=1 / ?test=0 on the Plus page. Returns true if the page is reloading. */
export function setPlusTesting(on: boolean): boolean {
  if (on === testing) return false;
  try {
    if (on) localStorage.setItem(TEST_KEY, "1");
    else localStorage.removeItem(TEST_KEY);
  } catch {
    return false;
  }
  location.replace(location.pathname + "#/pro");
  location.reload();
  return true;
}

export const PLUS = {
  price: "£3.99",
  period: "month",
  /** Shown only once a yearly price is set up in Stripe (STRIPE_PRICE_YEAR_ID). */
  yearPrice: "£24.99",
  yearSaving: "48%",
  guestLectures: "2",
  freeLectures: "10",
  plusLectures: "100",
};

export interface PlanState {
  loaded: boolean;
  plus: boolean;
  /** When Plus runs out (or renews). */
  until: string | null;
  /** They've cancelled: Plus stays until `until`, then stops. */
  cancelling: boolean;
  /** Has paid before, so there's a Stripe page to manage it. */
  customer: boolean;
}

const EMPTY: PlanState = { loaded: false, plus: false, until: null, cancelling: false, customer: false };
let state: PlanState = EMPTY;
let forUser: string | null = null;
const listeners = new Set<() => void>();
const set = (s: PlanState) => {
  state = s;
  listeners.forEach((l) => l());
};

/** Is the current student on Plus? (false until checked) */
export const hasPlus = () => state.plus;

export async function refreshPlan(userId: string | null): Promise<PlanState> {
  forUser = userId;
  if (!userId) {
    set({ ...EMPTY, loaded: true });
    return state;
  }
  try {
    const token = await authToken();
    const r = await fetch(`${SUPABASE_URL}/rest/v1/plans?select=plus_until,cancel_at_period_end,stripe_customer&user_id=eq.${userId}`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` },
    });
    if (!r.ok) throw new Error();
    const row = ((await r.json()) as { plus_until: string | null; cancel_at_period_end: boolean; stripe_customer: string | null }[])[0];
    if (forUser !== userId) return state;
    const plus = !!row?.plus_until && new Date(row.plus_until) > new Date();
    set({ loaded: true, plus, until: row?.plus_until ?? null, cancelling: plus && !!row?.cancel_at_period_end, customer: !!row?.stripe_customer });
  } catch {
    // Not set up yet, or offline: treat as free.
    if (forUser === userId) set({ ...EMPTY, loaded: true });
  }
  return state;
}

/** The plan as last fetched, without fetching again (for small things like badges and colours). */
export function usePlanQuiet(): PlanState {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => state,
    () => state,
  );
}

/** The student's plan, kept up to date as they log in and out. */
export function usePlan(): PlanState {
  const account = useAccount();
  const uid = account.user?.id ?? null;
  useEffect(() => {
    // Check each time a page that shows it opens (it may have changed on Stripe's page).
    refreshPlan(uid);
    // Coming back from Stripe's page in another tab.
    const onVisible = () => document.visibilityState === "visible" && uid && refreshPlan(uid);
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [uid]);
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => state,
    () => state,
  );
}

async function plusCall(action: "checkout" | "portal", extra: Record<string, string> = {}): Promise<string> {
  const token = await authToken();
  if (!token) throw new Error("Log in first.");
  let r: Response;
  try {
    r = await fetch(`${SUPABASE_URL}/functions/v1/plus`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
  } catch {
    throw new Error("Couldn't reach the server. Check your internet connection.");
  }
  const data = await r.json().catch(() => null);
  if (!r.ok || !data?.url) throw new Error(data?.error ?? "Payments aren't set up yet. Try again later.");
  return data.url as string;
}

/** Sends the student to Stripe's secure payment page. */
export async function startCheckout(plan: "month" | "year" = "month") {
  try {
    sessionStorage.setItem("slidequiz:plan", plan);
  } catch {
    /* storage blocked */
  }
  window.location.href = await plusCall("checkout", { plan });
}

/** Whether a yearly plan can be bought (set up in Stripe). */
export async function plusOptions(): Promise<{ yearly: boolean }> {
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/plus`, { method: "POST", headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ action: "options" }) });
    const d = await r.json();
    return { yearly: !!d?.yearly };
  } catch {
    return { yearly: false };
  }
}

/** Sends the student to Stripe's page to cancel, or change their card. */
export async function openBilling() {
  window.location.href = await plusCall("portal");
}
