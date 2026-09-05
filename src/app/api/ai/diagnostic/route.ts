// GET /api/ai/diagnostic
// Isolated connectivity/health probe - deliberately bypasses the whole homepage-intelligence
// pipeline (caching, standings, personalization) to answer one narrow question: can this Vercel
// deployment reach NVIDIA's NIM endpoint and the currently-configured model, and how fast?
// This is what actually diagnosed the Kimi K3 -> DeepSeek -> Nemotron provider swaps: proved the
// endpoint/auth were fine (77ms, HTTP 200) while DeepSeek's real chat completions still took 26+
// seconds for 5 tokens of hidden reasoning alone. Kept in place permanently as a lightweight
// health check, not deleted - useful any time "is the AI provider actually working right now"
// needs a real answer instead of a guess. Never echoes the API key.

import { NextResponse } from "next/server";

export const maxDuration = 90;

async function timedFetch(url: string, init: RequestInit, timeoutMs: number): Promise<{ latencyMs: number; result: { ok: boolean; status?: number; body?: string; error?: string } }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    return { latencyMs: Date.now() - startedAt, result: { ok: response.ok, status: response.status, body: text.slice(0, 1500) } };
  } catch (err) {
    const isAbort = err instanceof Error && err.name === "AbortError";
    return { latencyMs: Date.now() - startedAt, result: { ok: false, error: isAbort ? `Timed out after ${timeoutMs}ms` : String(err) } };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function GET() {
  const apiKey = process.env.NVIDIA_API_KEY;
  const model = process.env.NVIDIA_AI_MODEL || "(default, not set)";

  if (!apiKey) {
    return NextResponse.json({ ok: false, stage: "config", error: "NVIDIA_API_KEY not set" }, { status: 500 });
  }

  const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "application/json" };

  // Stage 1: lightweight catalog lookup - no GPU/inference involved, should always be fast.
  const modelsList = await timedFetch("https://integrate.api.nvidia.com/v1/models", { method: "GET", headers }, 10_000);

  // Stage 2: a request shaped like the REAL homepage-intelligence call (same max_tokens,
  // reasoning_budget, and chat_template_kwargs the configured provider actually sends - see
  // nemotron.ts) but with a much larger timeout budget than production's 45s - isolates whether
  // this model genuinely completes a realistically-sized structured-output request at all, and how
  // long it actually takes, rather than guessing.
  const completion = await timedFetch(
    "https://integrate.api.nvidia.com/v1/chat/completions",
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "Reply with exactly this JSON and nothing else: {\"status\":\"OK\",\"note\":\"diagnostic probe\"}" }],
        max_tokens: 800,
        temperature: 0.7,
        reasoning_budget: 2048,
        chat_template_kwargs: { enable_thinking: true },
      }),
    },
    85_000,
  );

  return NextResponse.json({
    configuredModel: model,
    modelsList: { ...modelsList.result, latencyMs: modelsList.latencyMs },
    realisticChatCompletion: { ...completion.result, latencyMs: completion.latencyMs },
  });
}
