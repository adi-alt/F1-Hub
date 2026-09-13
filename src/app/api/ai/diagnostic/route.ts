// GET /api/ai/diagnostic
// Isolated connectivity/health probe AND cross-provider benchmark harness - deliberately bypasses
// the whole homepage-intelligence pipeline (caching, standings, personalization) to answer one
// narrow question: can this Vercel deployment reach a given provider's endpoint, and how fast does
// it complete the REAL bundled task? This is what actually diagnosed the Kimi K3 -> DeepSeek ->
// Nemotron provider swaps: proved NVIDIA's endpoint/auth were fine (77ms, HTTP 200) while DeepSeek's
// real chat completions still took 26+ seconds for 5 tokens of hidden reasoning alone. Kept in
// place permanently as a lightweight health check, not deleted - useful any time "is a provider
// actually working right now, and how does it compare" needs a real answer instead of a guess.
// Never echoes any API key.
//
// Also now benchmarks Hugging Face Inference Providers candidates (see huggingface.ts) alongside
// the current NVIDIA/Nemotron baseline - smaller instruction/reasoning models, tested against the
// exact same real system prompt and context, on the theory (not yet proven or disproven) that a
// 14-31B model with good structured-output behavior may not need Nemotron's own latency for this
// task. Skipped gracefully (not an error) if HF_TOKEN isn't configured.

import { NextResponse } from "next/server";
import { HOMEPAGE_SYSTEM_PROMPT } from "@/lib/ai/prompts/homepagePrompt";
import { HF_BENCHMARK_MODELS } from "@/lib/ai/huggingface";

export const maxDuration = 110;

// A real, representative context block - same shape buildHomepageContext produces, not the
// diagnostic's own trivial "reply with this JSON" test. Isolates whether the REAL task (reason
// through this data and produce all 12 HomepageIntelligence fields) completes at all within a
// generous budget, since a production timeout at 45s turned out to be about task complexity, not
// connectivity - the trivial probe below succeeded in 7s; the real endpoint still timed out.
const SAMPLE_REAL_CONTEXT = `<STRUCTURED_F1_DATA>

Upcoming Race: Round 13 of 2026 - Italian Grand Prix at Monza (Monza, Italy)

Drivers Championship: P1 Kimi Antonelli (216 pts, Mercedes), P2 Lewis Hamilton (163 pts, Ferrari, gap: 53 pts), P3 Max Verstappen (140 pts).

Constructors Championship: P1 Mercedes (365 pts), P2 Ferrari (290 pts).

Circuit Track History: Defending Winner: Max Verstappen; Most Wins / Top Record: Michael Schumacher; Total historic races: 75.

</STRUCTURED_F1_DATA>

<PERSONAL_CONTEXT>

User's Favorite Driver: Lewis Hamilton (P2 in WDC, 163 points) racing for Ferrari.

User's Favorite Driver's History At This Circuit: 19 start(s), 5 win(s), 8 podium(s), best finish P1, average finish P4.2.

User's Own Prediction For This Race: Not yet submitted.

</PERSONAL_CONTEXT>

<UNTRUSTED_COMMUNITY_DATA>

No community posts in the last 7 days.

</UNTRUSTED_COMMUNITY_DATA>`;

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

// Every HF benchmark candidate is tested with this exact same request shape - the point of the
// comparison is "same task, different model," not "different tasks."
function hfBenchmarkRequest(hfToken: string, model: string) {
  return timedFetch(
    "https://router.huggingface.co/v1/chat/completions",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${hfToken}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: HOMEPAGE_SYSTEM_PROMPT },
          { role: "user", content: SAMPLE_REAL_CONTEXT },
        ],
        max_tokens: 3500,
        temperature: 0.7,
        stream: false,
      }),
    },
    100_000,
  );
}

export async function GET() {
  const apiKey = process.env.NVIDIA_API_KEY;
  const model = process.env.NVIDIA_AI_MODEL || "(default, not set)";
  const hfToken = process.env.HF_TOKEN;

  if (!apiKey) {
    return NextResponse.json({ ok: false, stage: "config", error: "NVIDIA_API_KEY not set" }, { status: 500 });
  }

  const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "application/json" };
  const completionUrl = "https://integrate.api.nvidia.com/v1/chat/completions";

  const skipped = { latencyMs: 0, result: { ok: false, error: "HF_TOKEN not configured - skipped" } };

  // All stages run concurrently - sequential would sum worst-case timeouts, well past this route's
  // own maxDuration. Total wall-clock time here is bounded by whichever single stage is slowest,
  // not their sum.
  const [modelsList, configuredModelTask, glmRealTask, ministralRealTask] = await Promise.all([
    // Lightweight catalog lookup - no GPU/inference involved, should always be fast. The permanent
    // "is NVIDIA even reachable" health check.
    timedFetch("https://integrate.api.nvidia.com/v1/models", { method: "GET", headers }, 10_000),

    // Baseline: the REAL system prompt + a representative structured/personal context, at
    // production's actual config (see types.ts's DEFAULT_ORCHESTRATOR_CONFIG - currently Muse
    // Glimmer 30B: temperature 1, top_p 0.95, max_tokens 8192, no reasoning_budget/
    // chat_template_kwargs shape - that's Nemotron-specific and would be a no-op/irrelevant param
    // for whatever model NVIDIA_AI_MODEL actually points to today).
    timedFetch(
      completionUrl,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: HOMEPAGE_SYSTEM_PROMPT },
            { role: "user", content: SAMPLE_REAL_CONTEXT },
          ],
          max_tokens: 8192,
          temperature: 1,
          top_p: 0.95,
        }),
      },
      100_000,
    ),

    // Benchmark candidates - exact same system prompt + context as the baseline above, via Hugging
    // Face's Inference Providers router (a plain OpenAI-compatible passthrough, no per-model
    // reasoning-parameter quirks to guess at). Skipped gracefully without HF_TOKEN.
    hfToken ? hfBenchmarkRequest(hfToken, HF_BENCHMARK_MODELS.glm) : Promise.resolve(skipped),
    hfToken ? hfBenchmarkRequest(hfToken, HF_BENCHMARK_MODELS.ministral) : Promise.resolve(skipped),
  ]);

  return NextResponse.json({
    configuredNvidiaModel: model,
    hfTokenConfigured: !!hfToken,
    modelsList: { ...modelsList.result, latencyMs: modelsList.latencyMs },
    benchmark: {
      configuredModel: { model, ...configuredModelTask.result, latencyMs: configuredModelTask.latencyMs },
      glm: { model: HF_BENCHMARK_MODELS.glm, ...glmRealTask.result, latencyMs: glmRealTask.latencyMs },
      ministral: { model: HF_BENCHMARK_MODELS.ministral, ...ministralRealTask.result, latencyMs: ministralRealTask.latencyMs },
    },
  });
}
