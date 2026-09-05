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
import { HOMEPAGE_SYSTEM_PROMPT } from "@/lib/ai/prompts/homepagePrompt";

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

export async function GET() {
  const apiKey = process.env.NVIDIA_API_KEY;
  const model = process.env.NVIDIA_AI_MODEL || "(default, not set)";

  if (!apiKey) {
    return NextResponse.json({ ok: false, stage: "config", error: "NVIDIA_API_KEY not set" }, { status: 500 });
  }

  const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "application/json" };
  const completionUrl = "https://integrate.api.nvidia.com/v1/chat/completions";

  // All stages run concurrently - sequential would sum worst-case timeouts (10s + 85s + 100s +
  // 100s = 295s, well past this route's own maxDuration). Total wall-clock time here is bounded by
  // whichever single stage is slowest, not their sum.
  const [modelsList, completion, realTask, reducedBudgetTask] = await Promise.all([
    // Stage 1: lightweight catalog lookup - no GPU/inference involved, should always be fast.
    timedFetch("https://integrate.api.nvidia.com/v1/models", { method: "GET", headers }, 10_000),

    // Stage 2: a trivial one-line echo - isolates whether the model/endpoint responds at all,
    // independent of task complexity.
    timedFetch(
      completionUrl,
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
    ),

    // Stage 3: the REAL system prompt + a representative structured/personal context, at
    // production's actual maxTokens/reasoningBudget - the one test that answers "does the real
    // 12-field task complete at all," rather than a trivial one-line echo that isn't
    // representative of it.
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
          max_tokens: 3500,
          temperature: 0.7,
          reasoning_budget: 2048,
          chat_template_kwargs: { enable_thinking: true },
        }),
      },
      100_000,
    ),

    // Stage 4: same real prompt as stage 3, but with a much smaller reasoning_budget - two real
    // production timeouts at 80s (after stage 3 measured 58.4s against a simplified sample
    // context) suggest the real route's actual context is bigger/more complex than the
    // hand-written sample here, and reasoning_budget directly controls how long the model spends
    // thinking before it ever starts the real answer. Testing whether trading some reasoning
    // depth for speed is the better lever than continuing to raise the timeout indefinitely.
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
          max_tokens: 3500,
          temperature: 0.7,
          reasoning_budget: 512,
          chat_template_kwargs: { enable_thinking: true },
        }),
      },
      100_000,
    ),
  ]);

  return NextResponse.json({
    configuredModel: model,
    modelsList: { ...modelsList.result, latencyMs: modelsList.latencyMs },
    trivialChatCompletion: { ...completion.result, latencyMs: completion.latencyMs },
    realisticHomepageTask: { ...realTask.result, latencyMs: realTask.latencyMs },
    reducedReasoningBudgetTask: { ...reducedBudgetTask.result, latencyMs: reducedBudgetTask.latencyMs },
  });
}
