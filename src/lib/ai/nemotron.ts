// NemotronProvider — Concrete AIProvider implementation for NVIDIA's own Nemotron 3.5 Lightning
// via NVIDIA NIM. Endpoint: https://integrate.api.nvidia.com/v1/chat/completions
// Uses standard fetch with AbortSignal timeout and OpenAI-compatible completions format.
//
// Third provider in this file's history - see docs/AGENTIC_AI.md's addenda for the full story.
// Kimi K3 (moonshotai/kimi-k3): rejected reasoning_effort="medium" outright (HTTP 400), then timed
// out at 30s regardless of effort level once that was fixed. DeepSeek V4 Flash: reachable and
// fast for a lightweight /v1/models call (77ms), but a real chat completion - confirmed live via a
// diagnostic probe - took 26+ seconds to produce just 5 tokens of hidden reasoning and never even
// reached real content. Nemotron, tested directly by the account owner in NVIDIA's own playground
// (not guessed), answered real multi-paragraph questions in 4-10s typically, one at 32s worst case
// - an NVIDIA-first-party model on the same NIM infrastructure, not a third-party community
// integration, which plausibly explains why it doesn't share the other two models' latency.
//
// Nemotron's reasoning control has its own third shape: NOT DeepSeek's
// `chat_template_kwargs: { thinking, reasoning_effort }` - it's
// `chat_template_kwargs: { enable_thinking }` plus a top-level `reasoning_budget` (a token count
// for the hidden reasoning pass, separate from `max_tokens`). Implemented exactly as demonstrated
// in a real, working example rather than assumed to match either prior provider's shape.

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

export class NemotronProvider implements AIProvider {
  readonly name = "nemotron";

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

    if (config.reasoningBudget) {
      payload.chat_template_kwargs = { enable_thinking: true };
      payload.reasoning_budget = config.reasoningBudget;
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

      // enable_thinking can return hidden chain-of-thought in a separate reasoning_content field
      // alongside the real answer in content - we only ever want the final answer (never surface
      // hidden reasoning to the UI or feed it back as if it were the structured JSON output), so
      // this deliberately reads content only.
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
      logAIError("nemotron_provider", isAbort ? "timeout" : "provider_error", errorMsg);
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

// Auto-register instance with the provider registry
registerProvider(new NemotronProvider());
