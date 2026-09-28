/** Transient UI state shared across the app (dialogs opened from anywhere). Not persisted. */
import { useSyncExternalStore } from "react";
import type { ID } from "@/types/models";

export interface UIState {
  command: boolean;
  shortcuts: boolean;
  quiz: null | { materialIds?: ID[]; topicIds?: ID[]; questionIds?: ID[]; title?: string };
}

let ui: UIState = { command: false, shortcuts: false, quiz: null };
const subs = new Set<() => void>();

export function setUI(patch: Partial<UIState>) {
  ui = { ...ui, ...patch };
  subs.forEach((s) => s());
}

export function useUI() {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => ui,
  );
}

export const openQuizSetup = (opts: UIState["quiz"] = {}) => setUI({ quiz: opts ?? {} });
