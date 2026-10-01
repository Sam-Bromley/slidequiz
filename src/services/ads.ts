/**
 * Google Ads measurement: tells Google when someone who clicked an ad signs up or buys Pro,
 * so the ads can learn what works. Only runs after the visitor accepts ad cookies (UK law).
 * No ads are ever shown on SlideQuiz itself.
 */
import { useSyncExternalStore } from "react";

export const ADS_ID = "AW-18485189868";
/** Conversion labels from Google Ads (Goals → Conversions → the action → Tag setup). Empty = not set up yet. */
const LABELS: Record<"purchase" | "signup", string> = {
  purchase: "bf-wCOKe2YwdEOy5tu5E",
  signup: "",
};

/** Measurement is only switched on once at least one conversion label is filled in. */
export const ADS_READY = Object.values(LABELS).some(Boolean);

type Consent = "yes" | "no" | null;
const KEY = "slidequiz:cookies";
const listeners = new Set<() => void>();
let consent: Consent = (() => {
  try {
    const v = localStorage.getItem(KEY);
    return v === "yes" || v === "no" ? v : null;
  } catch {
    return null;
  }
})();

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/** The ad's click id from the landing page, kept for this visit until the visitor accepts cookies. */
const CLICK_KEYS = ["gclid", "gbraid", "wbraid"];
try {
  const q = new URLSearchParams(location.search);
  for (const k of CLICK_KEYS) if (q.get(k)) sessionStorage.setItem(`slidequiz:${k}`, q.get(k)!);
} catch {
  /* storage blocked */
}
/** Puts the click id back in the address before Google's tag reads it (it may have been lost moving around the site). */
function restoreClickId() {
  try {
    const q = new URLSearchParams(location.search);
    let changed = false;
    for (const k of CLICK_KEYS) {
      const v = sessionStorage.getItem(`slidequiz:${k}`);
      if (v && !q.get(k)) (q.set(k, v), (changed = true));
    }
    if (changed) history.replaceState(history.state, "", `${location.pathname}?${q.toString()}${location.hash}`);
  } catch {
    /* ignore */
  }
}

let loaded = false;
function load() {
  if (loaded || typeof document === "undefined") return;
  loaded = true;
  restoreClickId();
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };
  window.gtag("js", new Date());
  window.gtag("config", ADS_ID);
  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${ADS_ID}`;
  document.head.appendChild(s);
}

export function setAdConsent(v: "yes" | "no") {
  consent = v;
  try {
    localStorage.setItem(KEY, v);
  } catch {
    /* storage blocked */
  }
  if (v === "yes" && ADS_READY) load();
  else if (loaded) {
    // Stop using cookies for the rest of this visit; the tag isn't loaded again next time.
    window.gtag?.("consent", "update", { ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
  }
  listeners.forEach((l) => l());
}

export const useAdConsent = () =>
  useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => consent,
    () => consent,
  );

/** Called once when the app starts. */
export function initAds() {
  if (ADS_READY && consent === "yes") load();
}

/** A short one-way code, so nothing identifying is sent to Google. */
export const oneWay = (text: string) => [...text].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261).toString(36);

/** Tells Google Ads about a sign-up or a Pro purchase (only with consent, and once per id). */
export function trackConversion(kind: "purchase" | "signup", opts: { value?: number; id?: string } = {}) {
  const label = LABELS[kind];
  if (consent !== "yes" || !label) return;
  load();
  const onceKey = opts.id ? `slidequiz:conv:${kind}:${opts.id}` : "";
  try {
    if (onceKey && localStorage.getItem(onceKey)) return;
    if (onceKey) localStorage.setItem(onceKey, "1");
  } catch {
    /* storage blocked */
  }
  window.gtag?.("event", "conversion", {
    send_to: `${ADS_ID}/${label}`,
    ...(opts.value != null ? { value: opts.value, currency: "GBP" } : {}),
    ...(opts.id ? { transaction_id: opts.id } : {}),
    // A purchase here is always someone starting Pro, so a new customer.
    ...(kind === "purchase" ? { new_customer: true } : {}),
  });
}
