/**
 * App state container. A single immutable AppData object, persisted through the Database seam.
 * Components read with `useData()`; all writes go through `actions` (see ./actions.ts).
 */
import { useSyncExternalStore } from "react";
import { emptyData, SCHEMA_VERSION } from "./defaults";
import { db } from "@/services/db/local";
import { nameTopics } from "@/services/parsing/sections";
import type { AppData } from "@/services/db/types";

function initial(): AppData {
  const loaded = db.load();
  if (loaded && loaded.schemaVersion === SCHEMA_VERSION) return loaded;
  if (loaded && loaded.schemaVersion >= 4 && loaded.schemaVersion < SCHEMA_VERSION) {
    // v6: folders + background presets. v7: light is the default again; extra colour themes removed.
    // v8: every slide and picture is included (earlier versions left some out automatically).
    const migrated = {
      ...loaded,
      schemaVersion: SCHEMA_VERSION,
      folders: loaded.folders ?? [],
      materials: loaded.materials.map((m) => {
        // v8: every slide and picture included. v9: better topic names (same topics, so progress is kept).
        const pages = loaded.schemaVersion < 8 ? m.pages.map((p) => ({ ...p, included: true, images: p.images?.map((i) => ({ ...i, included: true })) })) : m.pages;
        const names = nameTopics(m.topics.map((t) => ({ pages: t.pageIds.map((id) => pages.find((p) => p.id === id)).filter((p) => !!p) })), pages.find((p) => p.index === 1));
        return { ...m, pages, topics: m.topics.map((t, i) => ({ ...t, name: names[i] })) };
      }),
      settings: { ...loaded.settings, theme: loaded.settings.theme === "warm" ? "warm" : "light", scene: loaded.settings.scene ?? "none" },
    } as AppData;
    db.save(migrated);
    // Questions are remade so the slides that were left out get some too.
    // (v10: no reference-list entries in questions; v12: no course-admin lines. Questions are remade for both.)
    if (loaded.schemaVersion < 14 && migrated.materials.length)
      setTimeout(() => import("@/services/practice").then((p) => migrated.materials.forEach((m) => p.buildPracticeQuestions(m.id))), 0);
    return migrated;
  }
  const fresh = emptyData();
  db.save(fresh);
  return fresh;
}

let state: AppData = initial();
const listeners = new Set<() => void>();
const errorListeners = new Set<(msg: string) => void>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let lastError = "";

/** Run when the browser has a spare moment, so saving never interrupts a click or an animation. */
const whenIdle = (fn: () => void) =>
  typeof window !== "undefined" && "requestIdleCallback" in window ? window.requestIdleCallback(fn, { timeout: 2000 }) : setTimeout(fn, 0);

function persist() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    whenIdle(() => {
      const res = db.save(state);
      if (!res.ok && res.error !== lastError) {
        lastError = res.error;
        errorListeners.forEach((l) => l(res.error));
      } else if (res.ok) lastError = "";
    });
  }, 400);
}

export function getState() {
  return state;
}

export function setState(update: (s: AppData) => AppData) {
  const next = update(state);
  if (next === state) return;
  state = next;
  listeners.forEach((l) => l());
  persist();
}

export function replaceState(next: AppData) {
  state = next;
  listeners.forEach((l) => l());
  persist();
}

/** Run `l` after every change (used by account syncing). */
export function subscribeState(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useData(): AppData {
  return useSyncExternalStore(subscribe, getState, getState);
}

export function onPersistError(cb: (msg: string) => void) {
  errorListeners.add(cb);
  return () => errorListeners.delete(cb);
}

// Flush pending writes when the tab is hidden or closed.
if (typeof window !== "undefined") {
  const flush = () => {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
      db.save(state);
    }
  };
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && flush());
}
