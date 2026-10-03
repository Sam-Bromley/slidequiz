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
  /** Days (YYYY-MM-DD, local) on which the student practised or revised: for the streak. */
  studyDays?: string[];
  /** What was studied each day (YYYY-MM-DD, local), for the weekly recap. Kept for about 10 weeks. */
  studyLog?: Record<string, DayLog>;
}

export interface DayLog {
  /** Questions answered, and how many were right. */
  q: number;
  c: number;
  /** Flashcards reviewed. */
  cards: number;
  /** Per topic ("materialId|topicId"): [answered, right]. */
  t?: Record<string, [number, number]>;
}

/** "warmlight" is only ever automatic: night light on top of the Light theme. */
export type ThemeName = "dark" | "light" | "warm" | "warmlight";

export interface Settings {
  /** Night light switched on by hand: warms whichever theme is chosen (light stays light). */
  nightLight?: boolean;
  /** How My Materials is sorted. */
  materialsSort?: "custom" | "recent" | "name";
  theme: ThemeName | "system";
  /** Switch to the warm night light automatically between nightStart and nightEnd. */
  nightLightAuto?: boolean;
  /** "HH:MM", local time. Defaults 21:00 and 06:00. */
  nightStart?: string;
  nightEnd?: string;
  /** Decorative background preset. */
  scene?: BackgroundScene;
  /** Give each subject its own soft colour on material cards. */
  subjectColours?: boolean;
  /** Reading size for the main content. */
  textSize?: "small" | "default" | "large" | "xl";
  /** Reading font: the default, an easy-read font, or a dyslexia-friendly one. */
  font?: "default" | "readable" | "dyslexic";
  /** Sidebar width in pixels (drag its edge); hidden = tucked away. */
  sidebarWidth?: number;
  sidebarHidden?: boolean;
  /** Pro: accent colour for buttons and highlights. */
  accent?: "default" | "blue" | "green" | "purple" | "pink" | "orange";
  /** Pro: the student's own background photo (an id in the on-device image store). */
  bgPhoto?: string;
  /** Pro: show that photo instead of the chosen scene. */
  bgPhotoOn?: boolean;
  defaultDifficulty: DifficultySetting;
  defaultCount: number;
  showExplanations: boolean;
  defaultTimerMinutes: number | null;
  dailyGoalMinutes: number;
  /** Answer options shown per multiple-choice question (3 to 6). */
  mcqOptions?: number;
  /** Practice questions in a random order instead of slide order. */
  practiceShuffle?: boolean;
  /** Show slide images in the notes (off by default). */
  notesImages?: boolean;
  /** Show a quote above the box on Home (on by default). */
  showQuote?: boolean;
}

export type SourceFileType = "pptx" | "pdf" | "docx" | "txt" | "image" | "text" | "audio" | "video" | "youtube";

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

/** Pro: a highlight (and optional note) on a line of the notes. */
export interface NoteMark {
  id: ID;
  /** Which line: see lineKey() in services/notes. */
  key: string;
  start: number;
  end: number;
  text: string;
  color: "yellow" | "green" | "blue" | "pink";
  note?: string;
  at: ISODate;
}

export interface Material {
  id: ID;
  title: string;
  /** Pro: the student's highlights and notes on the AI notes. */
  marks?: NoteMark[];
  /** Written-answer questions (1 to 6 marks) with their mark schemes. */
  written?: WrittenQuestion[];
  /** Pro: essay questions and plans for this lecture. */
  essays?: EssayWork;
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
  /** Width in My Materials, in pixels (drag the right edge to change). */
  width?: number;
  /** Position in My Materials when sorted by "Your order" (drag to reorder). */
  order?: number;
  noteExtras?: NoteExtra[];
  /** Notes (and topics/questions) written by the AI for logged-in students. */
  ai?: MaterialAI;
}

export interface AINotePoint {
  term?: string;
  text: string;
  sub?: boolean;
}

export interface AINoteSection {
  title: string;
  parts: { heading?: string; pageIds: ID[]; points: AINotePoint[] }[];
}

export interface MaterialAI {
  /** Which slides (and their text) the AI worked from; if the slides change, it runs again. */
  key: string;
  /** "off": the AI helper isn't set up yet, so the built-in notes and questions are used. */
  status: "working" | "done" | "failed" | "limit" | "off";
  notes?: AINoteSection[];
  /** True once the questions are the AI's. */
  questions?: boolean;
  /** Why it last failed, shown small on the "Couldn't write" panel. */
  error?: string;
  at: string;
}

export interface Folder {
  id: ID;
  name: string;
  parentId: ID | null;
  createdAt: ISODate;
  /** Colour key from FOLDER_COLOURS (none = plain). */
  color?: string;
  /** Width in My Materials, in pixels (drag the right edge to change). */
  width?: number;
  /** Position among its sibling folders (drag to reorder). */
  order?: number;
  /** Exam date for everything in this folder, "YYYY-MM-DD" (shows a countdown). */
  examDate?: string;
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

/** A saved set of flashcards (made from materials, or written by the student). */
export interface Deck {
  id: ID;
  name: string;
  materialIds: ID[];
  createdAt: ISODate;
  /** Width in the Flashcards list, in pixels (drag the right edge to change). */
  width?: number;
}

export interface Flashcard {
  id: ID;
  /** The deck it belongs to (older cards may have none). */
  deckId?: ID;
  /** Marked "Got it" while studying. */
  known?: boolean;
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

/* ---------------------------------------------------------------- essays (Pro) */

export type EssayLevel = "gcse" | "alevel" | "uni";

export interface EssayPlan {
  thesis: string;
  intro: string;
  paragraphs: { id: ID; point: string; evidence: { text: string; pageId?: ID; label?: string }[]; analysis: string; criteria: string[] }[];
  counter?: { point: string; response: string };
  conclusion: string;
  tips: string[];
  at: ISODate;
}

export interface EssayQuestion {
  id: ID;
  question: string;
  command?: string;
  marks?: number;
  difficulty?: "easy" | "medium" | "hard";
  criteria: string[];
  focus?: string;
  saved?: boolean;
  plan?: EssayPlan;
  at: ISODate;
}

export interface EssayWork {
  /** The student's marking criteria / mark scheme, as text. */
  rubric?: string;
  rubricName?: string;
  level?: EssayLevel;
  marks?: number;
  words?: number;
  questions: EssayQuestion[];
}

/** Essay practice on one lecture or several (e.g. a whole module folder). */
export interface EssaySet extends EssayWork {
  id: ID;
  title: string;
  materialIds: ID[];
  createdAt: ISODate;
  /** The folder it was made from, if any. */
  folderId?: ID;
}

export type RefStyle = "harvard" | "apa" | "mla" | "chicago" | "ieee" | "vancouver";
export type RefType = "article" | "book" | "chapter" | "website" | "report" | "video";

export interface RefFields {
  /** One per entry: "Surname, First name" for a person, or an organisation's full name. */
  authors: string[];
  editors?: string[];
  year?: string;
  /** Full date for websites and videos (YYYY-MM-DD, or YYYY-MM). */
  date?: string;
  title: string;
  /** Journal, website name, book title (for a chapter) or platform (for a video). */
  container?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  publisher?: string;
  place?: string;
  edition?: string;
  /** Report number. */
  number?: string;
  url?: string;
  doi?: string;
  /** When the student looked at it online (YYYY-MM-DD). */
  accessed?: string;
}

/** A source in an essay's reference list. */
export interface EssayReference {
  id: string;
  /** A reference typed out by hand (also how references from before this feature are kept). */
  text: string;
  type?: RefType;
  fields?: RefFields;
}

/** One essay the student is planning and writing. Writing is in small boxes, or one box per section. */
export interface EssayIntro { context: string; terms: string; problem: string; scope: string; thesis: string; text: string }
export interface EssayPoint { id: ID; topic: string; evidence: string; explain: string; link: string; text: string }
export interface EssayConclusion { restate: string; findings: string; implications: string; final: string; future: string; text: string }
export interface EssayFeedback {
  overall: string;
  strengths: string[];
  /** `box` is where the note belongs, e.g. "intro.thesis", "point2.evidence", "conclusion", "style". */
  notes: { box: string; text: string }[];
  at: ISODate;
}
export interface EssayDraft {
  id: ID;
  question: string;
  materialIds: ID[];
  level?: EssayLevel;
  /** Target length, for the word-count guide. */
  words?: number;
  /** The student's own marking criteria, if they add them. */
  rubric?: string;
  mode: "guided" | "simple";
  intro: EssayIntro;
  points: EssayPoint[];
  conclusion: EssayConclusion;
  references: EssayReference[];
  /** Referencing style; Harvard if not set. */
  refStyle?: RefStyle;
  /** Other generated questions to pick from, and every question generated so far (so new ones differ). */
  ideas?: string[];
  asked?: string[];
  completed?: boolean;
  feedback?: EssayFeedback;
  createdAt: ISODate;
  updatedAt: ISODate;
}

/* ---------------------------------------------------------------- written answers */

export interface WrittenMark {
  answer: string;
  awarded: number;
  hit: number[];
  feedback: string;
  improve?: string;
  at: ISODate;
}

export interface WrittenQuestion {
  id: ID;
  question: string;
  marks: number;
  points: { text: string; pageId?: ID; label?: string }[];
  model: string;
  /** Latest attempt (and the best mark so far). */
  last?: WrittenMark;
  best?: number;
  at: ISODate;
}
