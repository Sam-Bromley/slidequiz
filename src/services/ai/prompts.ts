/**
 * Prompt templates for a real LLM provider (used server-side by RemoteAIProvider's backend).
 * The mock provider follows the same contract so the UI never changes when you switch.
 */
import type { GenerationRequest } from "./types";

export const GENERATION_SYSTEM_PROMPT = `You are SlideQuiz, an expert examiner who writes revision resources for students.
Rules:
- Use ONLY the provided source pages. Never add facts that are not in them. If the material is too thin for the requested number of questions, return fewer and add a warning.
- Every question must cite the page(s) it came from using the given page ids and labels.
- Write clear, unambiguous questions with exactly one defensible answer.
- MCQs: exactly 4 options, one correct, three plausible distractors drawn from related ideas in the material (similar length and style; no "all of the above").
- Spread questions across the provided topics and avoid testing the same fact twice.
- Match the requested difficulty and academic level. "exam" difficulty means exam-board style wording with mark allocations.
- Provide a concise explanation and a model answer for every question. Written questions need key points; essays need a 4-level mark scheme.
- Respond with JSON only, matching the schema exactly.`;

export const GENERATION_JSON_SCHEMA = {
  type: "object",
  required: ["questions", "flashcards", "summaries", "warnings"],
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        required: ["type", "difficulty", "prompt", "answer", "keyPoints", "explanation", "sources", "topicId", "materialId"],
        properties: {
          type: { enum: ["mcq", "short", "long", "essay", "true_false", "fill_blank", "matching", "scenario", "compare"] },
          difficulty: { enum: ["easy", "medium", "hard"] },
          prompt: { type: "string" },
          options: { type: "array", items: { type: "string" } },
          correctIndex: { type: "integer" },
          acceptedAnswers: { type: "array", items: { type: "string" } },
          pairs: { type: "array", items: { type: "object", properties: { left: { type: "string" }, right: { type: "string" } } } },
          answer: { type: "string" },
          keyPoints: { type: "array", items: { type: "string" } },
          explanation: { type: "string" },
          rubric: { type: "array", items: { type: "object", properties: { band: { type: "string" }, descriptor: { type: "string" } } } },
          marks: { type: "integer" },
          suggestedWords: { type: "array", items: { type: "integer" }, minItems: 2, maxItems: 2 },
          sources: { type: "array", items: { type: "object", properties: { pageId: { type: "string" }, label: { type: "string" } } } },
          topicId: { type: ["string", "null"] },
          materialId: { type: "string" },
        },
      },
    },
    flashcards: { type: "array", items: { type: "object", properties: { front: { type: "string" }, back: { type: "string" }, topicId: { type: ["string", "null"] }, materialId: { type: "string" }, source: { type: "object" } } } },
    summaries: { type: "array" },
    warnings: { type: "array", items: { type: "string" } },
  },
} as const;

export function buildGenerationUserPrompt(req: GenerationRequest): string {
  const pages = req.pages.map((p) => `<page id="${p.id}" label="${p.label}" material="${p.materialId}" topic="${p.topicId ?? ""}">\n# ${p.title}\n${p.text}\n</page>`).join("\n");
  return `Subject: ${req.subject}
Level: ${req.level ?? "unspecified"}${req.course ? `\nCourse: ${req.course}` : ""}${req.examDate ? `\nExam date: ${req.examDate}` : ""}
Create: ${req.kinds.join(", ")}
Number of questions: ${req.count}
Difficulty: ${req.difficulty}
Topics (id: name): ${req.topics.map((t) => `${t.id}: ${t.name}`).join("; ")}
Student instructions: ${req.instructions || "none"}
Avoid duplicating: ${(req.avoidPrompts ?? []).slice(0, 40).join(" | ") || "n/a"}

<source>
${pages}
</source>`;
}

export const TUTOR_SYSTEM_PROMPT = `You are a patient tutor. Answer ONLY from the student's notes provided in <source>, citing page labels like (Slide 14).
If the notes don't cover the question, say so plainly. Do not guess.
In tutor mode, don't give the answer straight away: ask one guiding question at a time, give a hint after a wrong attempt, and reveal the answer after two attempts.`;
