// HuggingFaceProvider — Generic AIProvider implementation for any model served through Hugging
// Face's Inference Providers router. Confirmed against HF's own current docs (not guessed, given
// how costly wrong API-shape assumptions were for the three NVIDIA NIM providers before this one):
// https://router.huggingface.co/v1/chat/completions is a genuine, plain OpenAI-compatible
// passthrough - one endpoint, standard {model, messages, max_tokens, temperature, stream} body,
// no per-model quirks the way NVIDIA NIM had for Kimi K3 (top-level reasoning_effort), DeepSeek
// (chat_template_kwargs.reasoning_effort), and Nemotron (chat_template_kwargs.enable_thinking +
// reasoning_budget) - each of which needed its own bespoke request shape.
//
// One class, not one file per candidate model: config.model already carries which underlying
// model (and optionally which HF-listed provider, via "<model-id>:<provider>", or ":fastest" /
// ":cheapest" / ":auto" policy suffixes) a given call targets, exactly the same pattern the NVIDIA
// providers already used. Two named instances are registered below - "glm" (zai-org/GLM-4.7-Flash)
// and "ministral" (mistralai/Ministral-3-14B-Instruct-2512) - as the first real benchmark
// candidates against Nemotron's own measured latency, per the account owner's own research:
// smaller instruction/reasoning models with good structured-output behavior, not another larger
// model. Neither is wired into getDefaultProvider() yet - this is benchmarking infrastructure, not
// a production swap; see the diagnostic route's own benchmark stage.
//
// Requires HF_TOKEN (server-only, never NEXT_PUBLIC_) - a fine-grained token with "Make calls to
// Inference Providers" permission, from https://huggingface.co/settings/tokens.

import { registerProvider, type AIProvider } from "./provider";
import type { AIMessage, AIProviderConfig, AIProviderToolDef, AIResponse, AIToolCall } from "./types";
import { logAIError } from "./telemetry";

const HF_ROUTER_URL = "https://router.huggingface.co/v1/chat/completions";

export class HuggingFaceProvider implements AIProvider {
  readonly name: string;

  constructor(name: string) {
    this.name = name;
  }

  async chat(messages: AIMessage[], tools: AIProviderToolDef[] | null, config: AIProviderConfig): Promise<AIResponse> {
    const apiKey = process.env.HF_TOKEN;
    if (!apiKey) {
      throw new Error("HF_TOKEN environment variable is not configured on the server.");
    }
    if (!config.model) {
      throw new Error(`HuggingFaceProvider("${this.name}"): config.model is required - this provider has no default, it always represents one specific benchmark candidate.`);
    }

    const timeoutMs = config.timeoutMs || 30_000;

    const payload: Record<string, unknown> = {
      model: config.model,
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

    if (tools && tools.length > 0) {
      payload.tools = tools;
      payload.tool_choice = "auto";
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(HF_ROUTER_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Hugging Face router returned HTTP ${response.status}: ${errorText.slice(0, 300)}`);
      }

      const json = await response.json();
      const choice = json.choices?.[0];
      if (!choice) {
        throw new Error("Hugging Face router returned an empty choices array.");
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
      const errorMsg = isAbort ? `Hugging Face request timed out after ${timeoutMs}ms` : String(err);
      logAIError(`hf_provider_${this.name}`, isAbort ? "timeout" : "provider_error", errorMsg);
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

// Benchmark candidate model ids - kept alongside the provider registrations so a caller only
// needs the provider name, not to also remember the exact HF model string.
export const HF_BENCHMARK_MODELS: Record<string, string> = {
  glm: "zai-org/GLM-4.7-Flash",
  ministral: "mistralai/Ministral-3-14B-Instruct-2512",
};

registerProvider(new HuggingFaceProvider("glm"));
registerProvider(new HuggingFaceProvider("ministral"));
