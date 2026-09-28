import type {
  AcademicLevel,
  ChatMessage,
  ChatMode,
  DifficultySetting,
  Flashcard,
  GenerationKind,
  ID,
  Question,
  SourceRef,
  SummaryDoc,
  WrittenFeedback,
} from "@/types/models";

/** A page of source material handed to the AI. Only included pages are ever sent. */
export interface GroundingPage {
  id: ID;
  materialId: ID;
  materialTitle: string;
  label: string;
  title: string;
  text: string;
  topicId: ID | null;
}

export interface GroundingTopic {
  id: ID;
  name: string;
  materialId: ID;
}

export interface GenerationRequest {
  subject: string;
  pages: GroundingPage[];
  topics: GroundingTopic[];
  kinds: GenerationKind[];
  count: number;
  difficulty: DifficultySetting;
  instructions?: string;
  level?: AcademicLevel;
  course?: string;
  examDate?: string;
  /** Prompts that already exist for this material — the model should avoid duplicating them. */
  avoidPrompts?: string[];
}

export type QuestionDraft = Omit<Question, "id" | "createdAt" | "stats">;
export type FlashcardDraft = Pick<Flashcard, "materialId" | "topicId" | "front" | "back" | "source">;

export interface GenerationResult {
  questions: QuestionDraft[];
  flashcards: FlashcardDraft[];
  summaries: Omit<SummaryDoc, "generatedAt">[];
  warnings: string[];
}

export type GenerationStage = "reading" | "topics" | "concepts" | "questions" | "explanations";

export type QuestionChange = "regenerate" | "easier" | "harder";

export interface ChatRequest {
  materialTitle: string;
  pages: GroundingPage[];
  history: ChatMessage[];
  message: string;
  mode: ChatMode;
  tutor: boolean;
}

export interface ChatReply {
  content: string;
  citations: SourceRef[];
  expectedAnswer?: string;
  tutorStep?: number;
}

/**
 * The single seam between SlideQuiz and any language model.
 * The UI never talks to a model directly — swap MockAIProvider for RemoteAIProvider
 * (or an Anthropic/OpenAI implementation) in `services/ai/index.ts`.
 */
export interface AIProvider {
  readonly name: string;
  generate(req: GenerationRequest, onStage?: (s: GenerationStage) => void, signal?: AbortSignal): Promise<GenerationResult>;
  reviseQuestion(q: Question, change: QuestionChange, pages: GroundingPage[], topics: GroundingTopic[]): Promise<QuestionDraft>;
  explainQuestion(q: Question, pages: GroundingPage[]): Promise<ChatReply>;
  gradeWritten(q: Question, response: string, pages: GroundingPage[]): Promise<WrittenFeedback>;
  summarize(materialId: ID, pages: GroundingPage[], topics: GroundingTopic[], detail: SummaryDoc["detail"]): Promise<Omit<SummaryDoc, "generatedAt">>;
  chat(req: ChatRequest): Promise<ChatReply>;
}
