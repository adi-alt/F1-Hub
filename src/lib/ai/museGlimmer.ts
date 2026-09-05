// MuseGlimmerProvider — Concrete AIProvider implementation for Meta's Muse Glimmer 30B via NVIDIA
// NIM. Endpoint: https://integrate.api.nvidia.com/v1/chat/completions
// Uses standard fetch with AbortSignal timeout and OpenAI-compatible completions format.
//
// Fourth provider in this file's history - see docs/AGENTIC_AI.md's addenda for the full story,
// most recently the rigorous multi-model bake-off (Section 39+) that found it: a real, controlled
// 15-run replication against the exact real production context (buildHomepageContext + the real
// prompt + real Hamilton/Mercedes account data, not a hand-written sample) measured 15/15 valid
// JSON, median 14.0s, P95 15.0s, max 15.85s - roughly 3x faster than Nemotron's own real-context
// baseline (7/15 valid, median 40.1s) with equal or better grounding and personalization quality.
//
// Config was NOT copied verbatim from NVIDIA's own Playground example (which additionally included
// a generic demo `tools` block unrelated to our JSON-schema task - deliberately not adopted). It was
// empirically tuned for Apex's actual structured-output workload: `temperature: 1, top_p: 0.95,
// max_tokens: 8192` is what the bake-off's controlled retest confirmed working, after the same
// "copy NVIDIA's own example" approach measurably WORSENED two other candidates in the same bake-off
// (DeepSeek V4 Pro got slower and less reliable; Nemotron with reasoning_budget==max_tokens failed
// completely, 0/5, because reasoning consumed the entire token budget before any real content).
// Unlike Nemotron, Muse Glimmer has no reasoning_budget/chat_template_kwargs shape - it's a plain
// OpenAI-compatible chat model, no hidden "thinking" pass to control.
//
// This is a "current best candidate," not a closed decision - GLM-5.3-Flash (via Hugging Face)
// showed an even faster small-sample signal (3/4 valid, 8.4s median) that couldn't be replicated
// before Hugging Face's monthly inference credits ran out mid-bake-off. NemotronProvider is
// deliberately left in place (not deleted) for exactly that reason - this could still be revisited.

import { registerProvider, type AIProvider } from "./provider";
import {
  getDefaultAIModel,
  type AIMessage,
  type AIProviderConfig,
  type AIProviderToolDef,
  type AIResponse,
  type AIToolCall,
} from "./types";
import { getProviderRPM, getProviderRPMLimit } from "./providerRateLimiter";
import { logAIError, logProviderRequest } from "./telemetry";

const NVIDIA_INVOKE_URL = "https://integrate.api.nvidia.com/v1/chat/completions";

export class MuseGlimmerProvider implements AIProvider {
  readonly name = "muse-glimmer";

  async chat(
    messages: AIMessage[],
    tools: AIProviderToolDef[] | null,
    config: AIProviderConfig,
  ): Promise<AIResponse> {
    const apiKey = process.env.NVIDIA_API_KEY;
    if (!apiKey) {
      throw new Error("NVIDIA_API_KEY environment variable is not configured on the server.");
    }

    const model = config.model || getDefaultAIModel();
    const timeoutMs = config.timeoutMs || 30_000;
    const startTime = Date.now();

    // Construct OpenAI-compatible payload
    const payload: Record<string, unknown> = {
      model,
      messages: messages.map((m) => {
        if (m.role === "tool") {
          return {
            role: "tool",
            tool_call_id: m.tool_call_id,
            content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
          };
        }
        if (m.role === "assistant" && m.tool_calls) {
          return {
            role: "assistant",
            content: m.content || null,
            tool_calls: m.tool_calls,
          };
        }
        return {
          role: m.role,
          content: m.content,
        };
      }),
      max_tokens: config.maxTokens || 2048,
      temperature: config.temperature ?? 0.7,
      // Explicit, not the default - this is a single synchronous bundled call whose JSON output is
      // schema-validated before ever reaching React, so there's nothing to stream to.
      stream: false,
    };

    if (config.topP != null) {
      payload.top_p = config.topP;
    }

    if (tools && tools.length > 0) {
      payload.tools = tools;
      payload.tool_choice = "auto";
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(NVIDIA_INVOKE_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const latencyMs = Date.now() - startTime;
      const currentRPM = getProviderRPM("nvidia");
      const limit = getProviderRPMLimit();

      if (!response.ok) {
        const errorText = await response.text();
        logProviderRequest("nvidia", model, "error", currentRPM, limit, latencyMs, {
          status: response.status,
          error: errorText.slice(0, 200),
        });
        throw new Error(`NVIDIA NIM returned HTTP ${response.status}: ${errorText.slice(0, 300)}`);
      }

      const json = await response.json();
      logProviderRequest("nvidia", model, "success", currentRPM, limit, latencyMs);

      const choice = json.choices?.[0];
      if (!choice) {
        throw new Error("NVIDIA NIM returned an empty choices array.");
      }

      const rawToolCalls = choice.message?.tool_calls as Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }> | undefined;

      const toolCalls: AIToolCall[] = (rawToolCalls || []).map((tc) => ({
        id: tc.id,
        type: "function",
        function: {
          name: tc.function.name,
          arguments: tc.function.arguments,
        },
      }));

      return {
        content: choice.message?.content ?? null,
        toolCalls,
        finishReason: choice.finish_reason || "stop",
        usage: json.usage
          ? {
              promptTokens: json.usage.prompt_tokens ?? 0,
              completionTokens: json.usage.completion_tokens ?? 0,
              totalTokens: json.usage.total_tokens ?? 0,
            }
          : undefined,
      };
    } catch (err: unknown) {
      const isAbort = err instanceof Error && err.name === "AbortError";
      const errorMsg = isAbort ? `NVIDIA request timed out after ${timeoutMs}ms` : String(err);
      logAIError("muse_glimmer_provider", isAbort ? "timeout" : "provider_error", errorMsg);
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

// Auto-register instance with the provider registry
registerProvider(new MuseGlimmerProvider());
