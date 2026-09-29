/**
 * "Install as an app": offline support (service worker) and the browser's install prompt.
 * Only on the real website, not inside previews.
 */
import { useSyncExternalStore } from "react";

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

let deferred: InstallPrompt | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

const realSite = () => location.protocol === "https:" || location.hostname === "localhost";
const embedded = () => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
};

export function startInstallSupport() {
  if (!realSite() || embedded()) return;
  if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallPrompt;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    notify();
  });
}

export type InstallState = "installed" | "prompt" | "ios" | "manual" | "unavailable";

function state(): InstallState {
  if (embedded()) return "unavailable";
  if (window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone) return "installed";
  if (deferred) return "prompt";
  if (/iPhone|iPad|iPod/.test(navigator.userAgent)) return "ios";
  return "manual";
}

export function useInstallState(): InstallState {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    state,
    state,
  );
}

export async function promptInstall() {
  if (!deferred) return;
  await deferred.prompt();
  await deferred.userChoice.catch(() => {});
  deferred = null;
  notify();
}
