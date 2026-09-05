// GET /api/ai/diagnostic
// Temporary, isolated connectivity probe - deliberately bypasses the whole homepage-intelligence
// pipeline (caching, standings, personalization, chat completion) to answer one narrow question:
// can this Vercel deployment reach NVIDIA's NIM endpoint at all, and how fast? Hits GET /v1/models
// (lightweight - no generation, no token cost) rather than a real chat completion, so a slow/failed
// result here means the problem is connectivity/auth, not "the model is slow to generate."
// Never echoes the API key. Safe to leave in place; delete once the provider timeout is resolved.

import { NextResponse } from "next/server";

export const maxDuration = 20;

export async function GET() {
  const apiKey = process.env.NVIDIA_API_KEY;
  const model = process.env.NVIDIA_AI_MODEL || "(default, not set)";

  if (!apiKey) {
    return NextResponse.json({ ok: false, stage: "config", error: "NVIDIA_API_KEY not set" }, { status: 500 });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);
  const startedAt = Date.now();

  try {
    const response = await fetch("https://integrate.api.nvidia.com/v1/models", {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      signal: controller.signal,
    });
    const latencyMs = Date.now() - startedAt;
    const text = await response.text();

    return NextResponse.json({
      ok: response.ok,
      stage: "models_list",
      httpStatus: response.status,
      latencyMs,
      configuredModel: model,
      bodyPreview: text.slice(0, 1500),
    });
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    const isAbort = err instanceof Error && err.name === "AbortError";
    return NextResponse.json({
      ok: false,
      stage: "models_list",
      error: isAbort ? `Timed out after ${latencyMs}ms (10s budget)` : String(err),
      configuredModel: model,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}
