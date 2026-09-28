/**
 * Core domain models for SlideQuiz.
 * These are storage-agnostic: the local database, a future REST/Postgres backend,
 * and the AI layer all speak these types.
 */

export type ID = string;
export type ISODate = string;

export type AcademicLevel = "GCSE" | "A-Level" | "University" | "Custom";
export type Difficulty = "easy" | "medium" | "hard";
export type DifficultySetting = Difficulty | "mixed" | "exam";

export type QuestionType =
  | "mcq"
  | "short"
  | "long"
  | "essay"
  | "true_false"
  | "fill_blank"
  | "matching"
  | "scenario"
  | "compare";

/** Things a student can ask the generator for (questions + other study resources). */
export type GenerationKind = QuestionType | "flashcards" | "summary";

export interface User {
  id: ID;
  name: string;
  email: string;
  level: AcademicLevel;
  createdAt: ISODate;
  xp: number;
}

export type ThemeName = "dark" | "light" | "warm";

export interface Settings {
  theme: ThemeName | "system";
  /** Switch to the warm night light automatically between nightStart and nightEnd. */
  nightLightAuto?: boolean;
  /** "HH:MM", local time. Defaults 21:00 and 06:00. */
  nightStart?: string;
  nightEnd?: string;
  /** Decorative background preset. */
  scene?: BackgroundScene;
  defaultDifficulty: DifficultySetting;
  defaultCount: number;
  showExplanations: boolean;
  defaultTimerMinutes: number | null;
  dailyGoalMinutes: number;
  /** Answer options shown per multiple-choice question (3 to 6). */
  mcqOptions?: number;
}

export type SourceFileType = "pptx" | "pdf" | "docx" | "txt" | "image" | "text";

/** A single uploaded file. Binary content lives in FileStorage; only metadata is kept here. */
export interface SourceFile {
  id: ID;
  name: string;
  type: SourceFileType;
  size: number;
  uploadedAt: ISODate;
  pageCount: number;
  storageKey?: string;
}

/** A slide, page or document section — the unit students include/exclude. */
export interface Page {
  id: ID;
  fileId: ID;
  index: number; // 1-based, within the material
  label: string; // "Slide 4", "Page 12", "Section 3"
  title: string;
  text: string;
  topicId: ID | null;
  included: boolean;
  imageDataUrl?: string;
  needsText?: boolean; // image pages waiting on OCR / manual text
  /** Pictures found on this slide/page. The files themselves live in the image store. */
  images?: PageImage[];
}

export interface PageImage {
  id: ID;
  width: number;
  height: number;
  included: boolean;
  /** Same picture on most slides (a logo or template decoration). */
  repeated?: boolean;
}

/** Extra detail a student asked for in their notes. */
export interface NoteExtra {
  id: ID;
  request: string;
  /** The slide/page the detail is attached under. */
  pageId: ID | null;
  blocks: { text: string; label: string; pageId: ID; kind: "fact" | "definition" | "note" }[];
  createdAt: ISODate;
}

export interface Topic {
  id: ID;
  name: string;
  pageIds: ID[];
}

export interface Material {
  id: ID;
  title: string;
  subject: string;
  course?: string;
  unit: "slides" | "pages" | "sections";
  files: SourceFile[];
  pages: Page[];
  topics: Topic[];
  createdAt: ISODate;
  updatedAt: ISODate;
  lastOpenedAt?: ISODate;
  lastStudiedAt?: ISODate;
  examDate?: ISODate;
  level?: AcademicLevel;
  isDemo?: boolean;
  /** Folder in My Materials (null/undefined = top level). */
  folderId?: ID | null;
  noteExtras?: NoteExtra[];
}

export interface Folder {
  id: ID;
  name: string;
  parentId: ID | null;
  createdAt: ISODate;
}

export type BackgroundScene = "none" | "sunset" | "forest" | "ocean" | "aurora" | "dunes" | "peaks" | "snow" | "hills" | "lake" | "canyon";

export interface SourceRef {
  pageId: ID;
  label: string;
}

export interface RubricBand {
  band: string; // "Level 4 (13–16)"
  descriptor: string;
}

export interface QuestionStats {
  attempts: number;
  correct: number;
  lastResult?: "correct" | "incorrect" | "partial";
  lastAnsweredAt?: ISODate;
  lastScore?: number; // 0..1 for written answers
}

export interface Question {
  id: ID;
  materialId: ID;
  topicId: ID | null;
  type: QuestionType;
  difficulty: Difficulty;
  prompt: string;
  /** MCQ / true-false options. */
  options?: string[];
  correctIndex?: number;
  /** Fill-in-the-blank: accepted answers (case-insensitive). */
  acceptedAnswers?: string[];
  /** Matching: left → right pairs (displayed shuffled). */
  pairs?: { left: string; right: string }[];
  /** Model answer (all types). */
  answer: string;
  keyPoints: string[];
  explanation: string;
  rubric?: RubricBand[];
  suggestedWords?: [number, number];
  marks?: number;
  sources: SourceRef[];
  createdAt: ISODate;
  stats: QuestionStats;
  generationId?: ID;
  /**
   * Coverage MCQs keep the right answer at options[0] followed by a pool of wrong answers.
   * The practice screen picks how many to show and shuffles them every time.
   */
  pool?: boolean;
}

export interface SrsState {
  ease: number; // 1.3 .. 3.0
  interval: number; // days (0 = learning)
  due: ISODate;
  reps: number;
  lapses: number;
  lastRating?: FlashcardRating;
  lastReviewedAt?: ISODate;
}

export type FlashcardRating = "hard" | "good" | "easy";

export interface Flashcard {
  id: ID;
  materialId: ID;
  topicId: ID | null;
  front: string;
  back: string;
  source?: SourceRef;
  bookmarked: boolean;
  srs: SrsState;
  createdAt: ISODate;
}

export type AnswerResponse =
  | { kind: "choice"; index: number }
  | { kind: "text"; text: string }
  | { kind: "matching"; map: Record<number, number> };

export interface WrittenFeedback {
  score: number; // 0..1
  estimatedMark?: string;
  keyPointsHit: string[];
  missingConcepts: string[];
  feedback: string;
  improvements: string[];
}

export interface Answer {
  questionId: ID;
  response: AnswerResponse | null;
  correct: boolean | null; // null = not auto-marked (pending / skipped)
  score: number; // 0..1
  skipped?: boolean;
  feedback?: WrittenFeedback;
  selfMarked?: boolean;
  answeredAt: ISODate;
  timeMs?: number;
}

export type QuizMode = "practice" | "exam";

export interface QuizAttempt {
  id: ID;
  title: string;
  materialIds: ID[];
  questionIds: ID[];
  mode: QuizMode;
  timeLimitSec: number | null;
  startedAt: ISODate;
  finishedAt?: ISODate;
  elapsedMs: number;
  currentIndex: number;
  answers: Record<ID, Answer>;
  flagged: ID[];
  status: "in-progress" | "completed";
  origin?: "quick" | "weak" | "practice" | "retry" | "generated" | "demo" | "plan";
}

export interface StudySession {
  id: ID;
  kind: "quiz" | "flashcards" | "reading" | "tutor" | "written";
  materialIds: ID[];
  startedAt: ISODate;
  durationMs: number;
  items: number;
}

export interface SavedQuestion {
  questionId: ID;
  savedAt: ISODate;
  note?: string;
}

export type PlanTaskKind = "learn" | "mcq" | "flashcards" | "written" | "review" | "mock";

export interface PlanTask {
  id: ID;
  kind: PlanTaskKind;
  label: string;
  topicId?: ID;
  materialId?: ID;
  minutes: number;
  done: boolean;
}

export interface PlanDay {
  date: ISODate;
  tasks: PlanTask[];
}

export interface StudyPlan {
  id: ID;
  subject: string;
  examDate: ISODate;
  minutesPerDay: number;
  materialIds: ID[];
  createdAt: ISODate;
  days: PlanDay[];
}

export interface SummaryDoc {
  materialId: ID;
  detail: "brief" | "standard" | "detailed";
  tldr: string;
  revisionNotes: { heading: string; points: string[]; sources: SourceRef[] }[];
  detailed: { heading: string; body: string; sources: SourceRef[] }[];
  keyConcepts: { term: string; note: string }[];
  definitions: { term: string; definition: string; source?: SourceRef }[];
  facts: { text: string; source?: SourceRef }[];
  remember: string[];
  generatedAt: ISODate;
}

export interface ChatMessage {
  id: ID;
  role: "user" | "assistant";
  content: string;
  citations?: SourceRef[];
  mode?: ChatMode;
  /** When the assistant asked the student something (Test me / Tutor mode). */
  expectedAnswer?: string;
  tutorStep?: number;
  createdAt: ISODate;
}

export type ChatMode = "answer" | "simple" | "depth" | "analogy" | "example" | "test" | "tutor";

export interface GenerationRecord {
  id: ID;
  materialIds: ID[];
  kinds: GenerationKind[];
  count: number;
  difficulty: DifficultySetting;
  createdAt: ISODate;
  questionIds: ID[];
  flashcardIds: ID[];
}
