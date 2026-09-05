// Abstract AI provider interface — the contract every provider (DeepSeek, Kimi, OpenAI, Gemini,
// local) must implement. The orchestrator depends on this interface, never on a concrete
// provider. This is what made swapping Kimi for DeepSeek a one-file change, not a rewrite.

import type { AIMessage, AIProviderConfig, AIProviderToolDef, AIResponse } from "./types";

export interface AIProvider {
  readonly name: string;

  /** Send a chat completion request. Tools are optional — when present, the model may respond
   * with tool_calls instead of content. The provider handles its own timeout and error wrapping. */
  chat(
    messages: AIMessage[],
    tools: AIProviderToolDef[] | null,
    config: AIProviderConfig,
  ): Promise<AIResponse>;
}

// ─── Provider registry ─────────────────────────────────────────────────────────

const providers = new Map<string, AIProvider>();

export function registerProvider(provider: AIProvider): void {
  providers.set(provider.name, provider);
}

export function getProvider(name: string): AIProvider {
  const provider = providers.get(name);
  if (!provider) {
    throw new Error(`AI provider "${name}" is not registered. Available: ${[...providers.keys()].join(", ")}`);
  }
  return provider;
}

/** The default provider for F1 Hub — DeepSeek V4 (Flash) via NVIDIA NIM. Lazily initialized so the
 * module can be imported without side effects (the DeepSeekProvider import triggers registration). */
export function getDefaultProvider(): AIProvider {
  if (!providers.has("deepseek")) {
    // Dynamic import to avoid circular deps and ensure registration
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("./deepseek");
  }
  return getProvider("deepseek");
}
