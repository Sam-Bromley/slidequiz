import { MockAIProvider } from "./mock/provider";
import { RemoteAIProvider } from "./remote-provider";
import type { AIProvider, ChatReply, ChatRequest } from "./types";
import { AIError, cloudChat } from "./cloud";
import { getState } from "@/store/store";

export * from "./types";

let provider: AIProvider | null = null;

/** Returns the configured AI provider. The UI only ever calls this. */
export function getAI(): AIProvider {
  if (provider) return provider;
  let endpoint: string | null = null;
  try {
    endpoint = localStorage.getItem("slidequiz:ai-endpoint");
  } catch {
    /* storage unavailable */
  }
  provider = endpoint ? new RemoteAIProvider(endpoint) : new HybridProvider();
  return provider;
}

/** "Ask about these notes" is answered by the AI. The built-in helper only answers if the AI isn't set up at all. */
class HybridProvider extends MockAIProvider {
  override async chat(req: ChatRequest): Promise<ChatReply> {
    const materialId = req.pages[0]?.materialId;
    const m = materialId ? getState().materials.find((x) => x.id === materialId) : undefined;
    if (!m) return super.chat(req);
    try {
      const ai = await cloudChat(m, req.history.map((h) => ({ role: h.role, content: h.content })), req.message);
      const labels = new Map(req.pages.map((p) => [p.id, p.label]));
      if (ai?.answer) return { content: ai.answer, citations: (ai.pageIds ?? []).filter((id) => labels.has(id)).map((id) => ({ pageId: id, label: labels.get(id)! })) };
      return { content: "Sorry, I couldn't answer that just now. Try asking again.", citations: [] };
    } catch (e) {
      const err = e instanceof AIError ? e : null;
      if (err?.off) return super.chat(req);
      return { content: err?.limit ? "You've used today's AI allowance, so I can't answer right now. It resets tomorrow, or get Plus for more." : "Sorry, I couldn't answer that just now. Check your internet connection and try again.", citations: [] };
    }
  }
}

export function setAIProvider(p: AIProvider) {
  provider = p;
}
