import { nowISO } from "@/lib/utils";
import type { AppData } from "@/services/db/types";

export const SCHEMA_VERSION = 7;

export const DEFAULT_SETTINGS: AppData["settings"] = {
  theme: "light",
  defaultDifficulty: "mixed",
  defaultCount: 10,
  showExplanations: true,
  defaultTimerMinutes: null,
  dailyGoalMinutes: 30,
  scene: "none",
  nightStart: "21:00",
  nightEnd: "06:00",
};

/** A brand-new, empty account. */
export function emptyData(theme: AppData["settings"]["theme"] = "light"): AppData {
  return {
    schemaVersion: SCHEMA_VERSION,
    user: { id: "local-user", name: "", email: "", level: "A-Level", createdAt: nowISO(), xp: 0 },
    settings: { ...DEFAULT_SETTINGS, theme },
    materials: [],
    questions: [],
    flashcards: [],
    attempts: [],
    sessions: [],
    saved: [],
    plans: [],
    summaries: {},
    chats: {},
    drafts: {},
    generations: [],
    folders: [],
    onboarded: false,
  };
}
