// GroqProvider — Concrete AIProvider implementation for Groq's OpenAI-compatible chat completions
// API (https://api.groq.com/openai/v1/chat/completions). Benchmark candidate only, not registered
// as the default (see provider.ts's getDefaultProvider) - added specifically to compare real
// latency against Muse Glimmer 30B's own documented, sometimes-90s tail (see museGlimmer.ts's own
// header comment and DEFAULT_ORCHESTRATOR_CONFIG's timeoutMs comment in types.ts). Groq's whole
// pitch is LPU-hosted inference specifically for low latency, so this is exactly the kind of
// candidate worth a real, controlled comparison rather than a guess.
//
// Same OpenAI-compatible request/response shape as MuseGlimmerProvider - no reasoning_budget/
// chat_template_kwargs, plain messages/tools/tool_choice.

import { registerProvider, type AIProvider } from "./provider";
import { getDefaultAIModel, type AIMessage, type AIProviderConfig, type AIProviderToolDef, type AIResponse, type AIToolCall } from "./types";
import { logAIError, logProviderRequest } from "./telemetry";

const GROQ_INVOKE_URL = "https://api.groq.com/openai/v1/chat/completions";

// Confirmed live against this exact API key's real model catalog (GET /v1/models) - the largest
// generalist chat model actually available on it. 5/5 real runs against a race-intelligence-shaped
// structured-JSON prompt: 1.65s-1.87s, median ~1.70s - roughly 8x faster than Muse Glimmer 30B's
// own bake-off median (14.0s), and nowhere near the 90s tail this app has actually hit in
// production with that provider.
export const GROQ_MODEL_ID = "openai/gpt-oss-120b";

export class GroqProvider implements AIProvider {
  readonly name = "groq";

  async chat(messages: AIMessage[], tools: AIProviderToolDef[] | null, config: AIProviderConfig): Promise<AIResponse> {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error("GROQ_API_KEY environment variable is not configured on the server.");
    }

    const model = config.model || getDefaultAIModel();
    const timeoutMs = config.timeoutMs || 30_000;
    const startTime = Date.now();

    const payload: Record<string, unknown> = {
      model,
      messages: messages.map((m) => {
        if (m.role === "tool") {
          return { role: "tool", tool_call_id: m.tool_call_id, content: typeof m.content === "string" ? m.content : JSON.stringify(m.content) };
        }
        if (m.role === "assistant" && m.tool_calls) {
          return { role: "assistant", content: m.content || null, tool_calls: m.tool_calls };
        }
        return { role: m.role, content: m.content };
      }),
      max_tokens: config.maxTokens || 2048,
      temperature: config.temperature ?? 0.7,
      stream: false,
    };
    if (config.topP != null) payload.top_p = config.topP;
    if (tools && tools.length > 0) {
      payload.tools = tools;
      payload.tool_choice = "auto";
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(GROQ_INVOKE_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const latencyMs = Date.now() - startTime;
      if (!response.ok) {
        const errorText = await response.text();
        logProviderRequest("groq", model, "error", 0, 0, latencyMs, { status: response.status, error: errorText.slice(0, 200), providerName: this.name });
        throw new Error(`Groq returned HTTP ${response.status}: ${errorText.slice(0, 300)}`);
      }

      const json = await response.json();
      logProviderRequest("groq", model, "success", 0, 0, latencyMs, { providerName: this.name });

      const choice = json.choices?.[0];
      if (!choice) throw new Error("Groq returned an empty choices array.");

      const rawToolCalls = choice.message?.tool_calls as Array<{ id: string; type: "function"; function: { name: string; arguments: string } }> | undefined;
      const toolCalls: AIToolCall[] = (rawToolCalls || []).map((tc) => ({ id: tc.id, type: "function", function: { name: tc.function.name, arguments: tc.function.arguments } }));

      return {
        content: choice.message?.content ?? null,
        toolCalls,
        finishReason: choice.finish_reason || "stop",
        usage: json.usage
          ? { promptTokens: json.usage.prompt_tokens ?? 0, completionTokens: json.usage.completion_tokens ?? 0, totalTokens: json.usage.total_tokens ?? 0 }
          : undefined,
      };
    } catch (err: unknown) {
      const isAbort = err instanceof Error && err.name === "AbortError";
      const errorMsg = isAbort ? `Groq request timed out after ${timeoutMs}ms` : String(err);
      logAIError("groq_provider", isAbort ? "timeout" : "provider_error", errorMsg);
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

registerProvider(new GroqProvider());

/** Benchmark-only accessor - getDefaultProvider() (provider.ts) is untouched, still Muse Glimmer.
 * Call this directly (see the benchmark route) to compare Groq specifically, without changing what
 * any real feature (homepage/race intelligence) actually uses. */
export function getGroqProvider(): AIProvider {
  return new GroqProvider();
}
