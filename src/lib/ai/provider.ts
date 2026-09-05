// Abstract AI provider interface — the contract every provider (Nemotron, DeepSeek, Kimi, OpenAI,
// Gemini, local) must implement. The orchestrator depends on this interface, never on a concrete
// provider. This is what made swapping Kimi for DeepSeek, then DeepSeek for Nemotron, a one-file
// change each time, not a rewrite.

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

/** The default provider for F1 Hub — Meta Muse Glimmer 30B via NVIDIA NIM, chosen via a real,
 * controlled 15-run bake-off replication against real production context/prompt/schema (see
 * museGlimmer.ts's own header comment and docs/AGENTIC_AI.md). Lazily initialized so the module
 * can be imported without side effects (the MuseGlimmerProvider import triggers registration).
 * NemotronProvider is still registered (see nemotron.ts) but no longer the default - kept, not
 * deleted, since this remains a "current best candidate" pending GLM-5.3-Flash's own replication
 * once Hugging Face's inference credits are restored. */
export function getDefaultProvider(): AIProvider {
  if (!providers.has("muse-glimmer")) {
    // Dynamic import to avoid circular deps and ensure registration
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("./museGlimmer");
  }
  return getProvider("muse-glimmer");
}
