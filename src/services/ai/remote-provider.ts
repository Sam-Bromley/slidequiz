/**
 * Connects SlideQuiz to a real model through your own backend (keeps API keys server-side).
 * Implement POST {endpoint}/{task} on the server using the prompts in ./prompts.ts, and return
 * the same JSON shapes the mock returns. Enable with:
 *   localStorage.setItem("slidequiz:ai-endpoint", "https://your-api.example.com/ai")
 */
import type { Question } from "@/types/models";
import type { AIProvider, ChatRequest, GenerationRequest, GenerationStage, GroundingPage, GroundingTopic, QuestionChange } from "./types";

export class RemoteAIProvider implements AIProvider {
  readonly name = "Remote AI";
  constructor(private endpoint: string, private getToken: () => string | null = () => null) {}

  private async call<T>(task: string, body: unknown, signal?: AbortSignal): Promise<T> {
    const token = this.getToken();
    const res = await fetch(`${this.endpoint.replace(/\/$/, "")}/${task}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) throw new Error(`AI request failed (${res.status})`);
    return (await res.json()) as T;
  }

  async generate(req: GenerationRequest, onStage?: (s: GenerationStage) => void, signal?: AbortSignal) {
    onStage?.("reading");
    const timer = setTimeout(() => onStage?.("questions"), 1500);
    try {
      const out = await this.call<Awaited<ReturnType<AIProvider["generate"]>>>("generate", req, signal);
      onStage?.("explanations");
      return out;
    } finally {
      clearTimeout(timer);
    }
  }
  reviseQuestion(q: Question, change: QuestionChange, pages: GroundingPage[], topics: GroundingTopic[]) {
    return this.call<Awaited<ReturnType<AIProvider["reviseQuestion"]>>>("revise-question", { question: q, change, pages, topics });
  }
  explainQuestion(q: Question, pages: GroundingPage[]) {
    return this.call<Awaited<ReturnType<AIProvider["explainQuestion"]>>>("explain", { question: q, pages });
  }
  gradeWritten(q: Question, response: string, pages: GroundingPage[]) {
    return this.call<Awaited<ReturnType<AIProvider["gradeWritten"]>>>("grade", { question: q, response, pages });
  }
  summarize(materialId: string, pages: GroundingPage[], topics: GroundingTopic[], detail: "brief" | "standard" | "detailed") {
    return this.call<Awaited<ReturnType<AIProvider["summarize"]>>>("summarize", { materialId, pages, topics, detail });
  }
  chat(req: ChatRequest) {
    return this.call<Awaited<ReturnType<AIProvider["chat"]>>>("chat", req);
  }
}
