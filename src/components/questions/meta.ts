import { AlignLeft, ArrowLeftRight, BookOpenText, CircleCheck, Layers, ListChecks, type LucideIcon, NotebookPen, PenLine, Puzzle, ScrollText, SquareDashedText, Lightbulb } from "lucide-react";
import type { Difficulty, DifficultySetting, GenerationKind, QuestionType } from "@/types/models";
import type { BadgeTone } from "@/components/ui/badge";

export const KIND_META: Record<GenerationKind, { label: string; short: string; icon: LucideIcon; hint: string }> = {
  mcq: { label: "Multiple choice", short: "MCQ", icon: ListChecks, hint: "Four options, one correct" },
  short: { label: "Short answer", short: "Short", icon: PenLine, hint: "A sentence or two" },
  long: { label: "Long answer", short: "Long", icon: AlignLeft, hint: "Extended explanation" },
  essay: { label: "Essay", short: "Essay", icon: ScrollText, hint: "With a mark scheme" },
  true_false: { label: "True / False", short: "T/F", icon: CircleCheck, hint: "Quick recall checks" },
  fill_blank: { label: "Fill in the blank", short: "Blank", icon: SquareDashedText, hint: "Key terms and figures" },
  matching: { label: "Matching", short: "Match", icon: Puzzle, hint: "Pair terms with meanings" },
  scenario: { label: "Scenario", short: "Scenario", icon: Lightbulb, hint: "Apply ideas to situations" },
  compare: { label: "Compare & contrast", short: "Compare", icon: ArrowLeftRight, hint: "Similarities and differences" },
  flashcards: { label: "Flashcards", short: "Cards", icon: Layers, hint: "Spaced repetition deck" },
  summary: { label: "Summary", short: "Summary", icon: BookOpenText, hint: "Notes, definitions, key facts" },
};

export const QUESTION_TYPES: QuestionType[] = ["mcq", "short", "long", "essay", "true_false", "fill_blank", "matching", "scenario", "compare"];
export const WRITTEN_TYPES: QuestionType[] = ["short", "long", "essay", "scenario", "compare"];
export const isWritten = (t: QuestionType) => WRITTEN_TYPES.includes(t);

export const DIFFICULTY_META: Record<Difficulty, { label: string; tone: BadgeTone }> = {
  easy: { label: "Easy", tone: "success" },
  medium: { label: "Medium", tone: "warning" },
  hard: { label: "Hard", tone: "danger" },
};

export const DIFFICULTY_SETTINGS: { value: DifficultySetting; label: string; hint: string }[] = [
  { value: "easy", label: "Easy", hint: "Recognition and recall" },
  { value: "medium", label: "Medium", hint: "Understanding" },
  { value: "hard", label: "Hard", hint: "Application and analysis" },
  { value: "mixed", label: "Mixed", hint: "A spread of all three" },
  { value: "exam", label: "Exam-level", hint: "Exam-style wording with marks" },
];

export const NotebookIcon = NotebookPen;
