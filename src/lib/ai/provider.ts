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

/** Thrown by a provider on a non-2xx HTTP response, carrying the real status code - the
 * Groq -> OpenRouter fallback chain (providerFallback.ts) needs to tell "429, don't bother
 * retrying this provider, move to the next one" apart from "5xx/network error, worth one retry
 * against the same provider first." A plain Error's message string doesn't give that a reliable,
 * structured way to check. */
export class ProviderHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ProviderHttpError";
  }
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

/** The default provider for F1 Hub — Groq (openai/gpt-oss-120b), chosen via a real, live
 * benchmark against this app's exact race-intelligence-shaped structured-JSON workload: 5/5 runs
 * at 1.65-1.87s (median ~1.70s), vs. Muse Glimmer 30B's own bake-off median of 14.0s and a real,
 * confirmed-live 90s production timeout. See src/lib/ai/groq.ts's own header comment and the
 * conversation history around 2026-09-10 for the full multi-provider comparison (Cerebras,
 * OpenRouter's free tiers, and OpenRouter's own paid gpt-oss-120b/20b were all tested live too -
 * none beat Groq). Lazily initialized so the module can be imported without side effects.
 * MuseGlimmerProvider/NemotronProvider are still registered (see museGlimmer.ts/nemotron.ts) but
 * no longer the default - kept, not deleted, as "previously current" candidates. */
export function getDefaultProvider(): AIProvider {
  if (!providers.has("groq")) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("./groq");
  }
  return getProvider("groq");
}

/** The fallback provider for the Groq -> OpenRouter chain (see providerFallback.ts) - used only
 * when Groq is rate-limited or a retry against it also fails. openai/gpt-oss-20b via OpenRouter:
 * real, live-verified 3/3 success, ~4.3s median (1.9-7.7s range) - slower and less consistent than
 * Groq, but a genuine working second provider, not a guess. */
export function getFallbackProvider(): AIProvider {
  if (!providers.has("openrouter")) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("./openrouter");
  }
  return getProvider("openrouter");
}
