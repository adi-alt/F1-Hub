// GroqProvider — Concrete AIProvider implementation for Groq's OpenAI-compatible chat completions
// API (https://api.groq.com/openai/v1/chat/completions). The default provider (see provider.ts's
// getDefaultProvider) as of 2026-09-10 - chosen via a real, live benchmark against this app's own
// race-intelligence-shaped structured-JSON workload, not a guess: 5/5 runs at 1.65s-1.87s (median
// ~1.70s), vs. Muse Glimmer 30B's own bake-off median of 14.0s and a real, confirmed-live 90s
// production timeout (see museGlimmer.ts's own header comment). Cerebras (billing not set up on
// the available key), OpenRouter's free-tier models (all either congested/rate-limited or slow-
// and-unreliable), and OpenRouter's own paid gpt-oss-120b (~22s, >10x slower than Groq for the
// exact same model) were all tested live too - none came close.
//
// Same OpenAI-compatible request/response shape as MuseGlimmerProvider - no reasoning_budget/
// chat_template_kwargs, plain messages/tools/tool_choice.

import { ProviderHttpError, registerProvider, type AIProvider } from "./provider";
import { getDefaultAIModel, type AIMessage, type AIProviderConfig, type AIProviderToolDef, type AIResponse, type AIToolCall } from "./types";
import { logAIError, logProviderRequest } from "./telemetry";

const GROQ_INVOKE_URL = "https://api.groq.com/openai/v1/chat/completions";

// Confirmed live against this exact API key's real model catalog (GET /v1/models) - the largest
// generalist chat model actually available on it.
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
        throw new ProviderHttpError(`Groq returned HTTP ${response.status}: ${errorText.slice(0, 300)}`, response.status);
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
