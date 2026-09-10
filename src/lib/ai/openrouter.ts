// OpenRouterProvider — Concrete AIProvider implementation for OpenRouter's OpenAI-compatible chat
// completions API (https://openrouter.ai/api/v1/chat/completions). The fallback provider in the
// Groq -> OpenRouter chain (see providerFallback.ts) - used only when Groq is rate-limited or a
// retry against it also fails.
//
// openai/gpt-oss-20b, not the free-tier models - live-tested (2026-09-10) against this app's own
// race-intelligence-shaped structured-JSON prompt:
// - openai/gpt-oss-20b (paid, ~$0.0001/call): 3/3 success, ~4.3s median (1.9s-7.7s range) - real,
//   working, genuinely usable as a fallback.
// - openai/gpt-oss-120b (paid, same model Groq hosts): 3/3 success but ~22s median - Groq's LPU
//   hardware is the real speed advantage, not the model choice, so this is a poor fallback pick.
// - nvidia/nemotron-3-ultra-550b-a55b:free: 2/3 at 32-45s, one run returned empty whitespace (not
//   valid JSON at all) - slow AND unreliable.
// - nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free and google/gemma-4-26b-a4b-it:free: 0/3 -
//   the shared free pool was at capacity / rate-limited both times, every single request.
// None of the free-tier variants are usable for anything user-facing right now.

import { ProviderHttpError, registerProvider, type AIProvider } from "./provider";
import type { AIMessage, AIProviderConfig, AIProviderToolDef, AIResponse, AIToolCall } from "./types";
import { logAIError, logProviderRequest } from "./telemetry";

const OPENROUTER_INVOKE_URL = "https://openrouter.ai/api/v1/chat/completions";

export const OPENROUTER_FALLBACK_MODEL_ID = "openai/gpt-oss-20b";

export class OpenRouterProvider implements AIProvider {
  readonly name = "openrouter";

  async chat(messages: AIMessage[], tools: AIProviderToolDef[] | null, config: AIProviderConfig): Promise<AIResponse> {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error("OPENROUTER_API_KEY environment variable is not configured on the server.");
    }

    const model = config.model || OPENROUTER_FALLBACK_MODEL_ID;
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
      const response = await fetch(OPENROUTER_INVOKE_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          // OpenRouter's own optional attribution headers (shows up on their dashboard/leaderboard)
          // - harmless to include, not required for the API to work.
          "HTTP-Referer": "https://apexf1hub.com",
          "X-Title": "F1 Hub",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const latencyMs = Date.now() - startTime;
      if (!response.ok) {
        const errorText = await response.text();
        logProviderRequest("openrouter", model, "error", 0, 0, latencyMs, { status: response.status, error: errorText.slice(0, 200), providerName: this.name });
        throw new ProviderHttpError(`OpenRouter returned HTTP ${response.status}: ${errorText.slice(0, 300)}`, response.status);
      }

      const json = await response.json();
      logProviderRequest("openrouter", model, "success", 0, 0, latencyMs, { providerName: this.name });

      const choice = json.choices?.[0];
      if (!choice) throw new Error("OpenRouter returned an empty choices array.");

      // OpenRouter can also embed a provider-level failure inside a 200 response (confirmed live:
      // "Upstream error from Nvidia: ResourceExhausted..." came back as HTTP 200 with an `error`
      // field, not a 4xx/5xx) - checked here since response.ok alone would have missed it.
      if (json.error) {
        throw new ProviderHttpError(`OpenRouter upstream error: ${JSON.stringify(json.error).slice(0, 300)}`, json.error.code === 429 ? 429 : 502);
      }

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
      const errorMsg = isAbort ? `OpenRouter request timed out after ${timeoutMs}ms` : String(err);
      logAIError("openrouter_provider", isAbort ? "timeout" : "provider_error", errorMsg);
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

registerProvider(new OpenRouterProvider());
