import { MockAIProvider } from "./mock/provider";
import { RemoteAIProvider } from "./remote-provider";
import type { AIProvider } from "./types";

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
  provider = endpoint ? new RemoteAIProvider(endpoint) : new MockAIProvider();
  return provider;
}

export function setAIProvider(p: AIProvider) {
  provider = p;
}
