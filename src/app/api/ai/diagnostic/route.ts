// GET /api/ai/diagnostic
// Temporary, isolated connectivity probe - deliberately bypasses the whole homepage-intelligence
// pipeline (caching, standings, personalization, chat completion) to answer one narrow question:
// can this Vercel deployment reach NVIDIA's NIM endpoint at all, and how fast? Hits GET /v1/models
// (lightweight - no generation, no token cost) rather than a real chat completion, so a slow/failed
// result here means the problem is connectivity/auth, not "the model is slow to generate."
// Never echoes the API key. Safe to leave in place; delete once the provider timeout is resolved.

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

  // Stage 2: the smallest possible real chat completion - isolates whether an actual inference
  // call (not just endpoint reachability) succeeds, and how long a cold model backend takes to
  // spin up, independent of our own app's reasoning_effort/context/schema-validation logic.
  const completion = await timedFetch(
    "https://integrate.api.nvidia.com/v1/chat/completions",
    {
      method: "POST",
      headers,
      body: JSON.stringify({ model, messages: [{ role: "user", content: "Reply with exactly: OK" }], max_tokens: 5 }),
    },
    75_000,
  );

  return NextResponse.json({
    configuredModel: model,
    modelsList: { ...modelsList.result, latencyMs: modelsList.latencyMs },
    minimalChatCompletion: { ...completion.result, latencyMs: completion.latencyMs },
  });
}
