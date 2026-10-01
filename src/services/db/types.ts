import type {
  EssaySet,
  ChatMessage,
  Deck, Folder, Flashcard, GenerationRecord, ID, Material, Question, QuizAttempt, SavedQuestion, Settings, StudyPlan, StudySession, SummaryDoc, User,
} from "@/types/models";

/** Everything SlideQuiz persists. A real backend would store each collection as a table. */
export interface AppData {
  schemaVersion: number;
  user: User;
  settings: Settings;
  materials: Material[];
  questions: Question[];
  flashcards: Flashcard[];
  decks?: Deck[];
  /** Pro: essay questions and plans. */
  essays?: EssaySet[];
  attempts: QuizAttempt[];
  sessions: StudySession[];
  saved: SavedQuestion[];
  plans: StudyPlan[];
  summaries: Record<ID, SummaryDoc>;
  chats: Record<ID, ChatMessage[]>;
  drafts: Record<ID, { text: string; savedAt: string }>;
  generations: GenerationRecord[];
  folders: Folder[];
  onboarded: boolean;
  lastVisit?: { path: string; label: string; at: string };
}

/**
 * Persistence seam. `LocalDatabase` keeps data in the browser; replace with an API-backed
 * implementation (e.g. Supabase/Postgres) without touching the UI or the store.
 */
export interface Database {
  load(): AppData | null;
  save(data: AppData): { ok: true } | { ok: false; error: string };
  clear(): void;
}
