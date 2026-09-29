import { MockAIProvider } from "./mock/provider";
import { RemoteAIProvider } from "./remote-provider";
import type { AIProvider, ChatReply, ChatRequest } from "./types";
import { cloudChat } from "./cloud";
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

/** The built-in helper, except "Ask about these notes" uses the real AI when the student is logged in. */
class HybridProvider extends MockAIProvider {
  override async chat(req: ChatRequest): Promise<ChatReply> {
    const materialId = req.pages[0]?.materialId;
    const m = materialId ? getState().materials.find((x) => x.id === materialId) : undefined;
    const ai = m ? await cloudChat(m, req.history.map((h) => ({ role: h.role, content: h.content })), req.message) : null;
    if (ai?.answer) {
      const labels = new Map(req.pages.map((p) => [p.id, p.label]));
      return { content: ai.answer, citations: (ai.pageIds ?? []).filter((id) => labels.has(id)).map((id) => ({ pageId: id, label: labels.get(id)! })) };
    }
    return super.chat(req);
  }
}

export function setAIProvider(p: AIProvider) {
  provider = p;
}
