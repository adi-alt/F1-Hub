// GET /api/ai/diagnostic-provider-path
// Debug-only, temporary: calls the REAL, unmodified production provider path - getDefaultProvider()
// from provider.ts (the exact function orchestrator.ts calls) and DEFAULT_ORCHESTRATOR_CONFIG.provider
// from types.ts (the exact config orchestrator.ts merges) - directly, bypassing only the cache/
// single-flight/fallback wrapper in orchestrator.ts itself. This isolates one specific question:
// does MuseGlimmerProvider.chat() reproduce the 45s+ tail latency a real live homepage request hit,
// or does it behave like the benchmark route's raw fetch (~14-16s)? If it reproduces the tail, the
// cause is inside the provider/request construction or transport path. If it comes back fast, the
// benchmark and production code paths are equivalent and the tail was real NVIDIA-side variance the
// 15-run sample didn't happen to catch - not a code discrepancy.
//
// Does NOT touch caching, fallback, or the default provider - purely a read-only timing probe.
// Uses a fixed representative context (not the authenticated caller's own real data) so this stays
// comparable across runs without depending on session state.

import { NextResponse } from "next/server";
import { getDefaultProvider } from "@/lib/ai/provider";
import { buildHomepageContext, type HomepageContextData } from "@/lib/ai/context";
import { formatHomepagePrompt } from "@/lib/ai/prompts/homepagePrompt";
import { DEFAULT_ORCHESTRATOR_CONFIG, getDefaultAIModel } from "@/lib/ai/types";

export const maxDuration = 150;

const FIXED_CONTEXT: HomepageContextData = {
  race: { id: "race_2026_13", name: "Italian Grand Prix", round: 13, season: 2026, circuitName: "Monza", city: "Monza", country: "Italy" },
  standings: {
    driverLeader: { name: "Kimi Antonelli", team: "Mercedes", points: 216 },
    driverSecond: { name: "Lewis Hamilton", team: "Ferrari", points: 163 },
    driverThird: { name: "Max Verstappen", team: "Red Bull", points: 140 },
    constructorLeader: { name: "Mercedes", points: 365 },
    constructorSecond: { name: "Ferrari", points: 290 },
  },
  trackHistory: { defendingWinner: "Max Verstappen", topPerformer: "Michael Schumacher", totalRaces: 75 },
  model: { topPredictedDriver: "Kimi Antonelli", topFeatureFactors: ["grid", "recentForm", "teamPace"] },
  simulation: { topSimulatedDriver: "Kimi Antonelli", p1Probability: 0.34, podiumProbability: 0.61 },
  communityPosts: [],
  favoriteDriver: { name: "Lewis Hamilton", rank: 2, points: 163, teamName: "Ferrari", circuit: { appearances: 19, wins: 5, podiums: 8, bestFinish: 1, avgFinish: 5.9 } },
  favoriteTeam: { name: "Mercedes", rank: 1, points: 365, circuit: { appearances: 16, wins: 5, podiums: 13, bestFinish: 1 } },
  userPrediction: { submitted: false },
  predictionFingerprint: null,
  sinceLastVisit: null,
};

export async function GET() {
  const provider = getDefaultProvider();
  const model = getDefaultAIModel();
  const providerConfig = { ...DEFAULT_ORCHESTRATOR_CONFIG.provider, model };

  const contextString = buildHomepageContext(FIXED_CONTEXT);
  const messages = formatHomepagePrompt(contextString);

  const runs = await Promise.all(
    [0, 1, 2].map(async (i) => {
      const startedAt = Date.now();
      try {
        const response = await provider.chat(messages, null, providerConfig);
        return { run: i, ok: true, latencyMs: Date.now() - startedAt, contentLength: response.content?.length ?? 0, usage: response.usage, finishReason: response.finishReason };
      } catch (err) {
        return { run: i, ok: false, latencyMs: Date.now() - startedAt, error: String(err) };
      }
    }),
  );

  return NextResponse.json({
    providerName: provider.name,
    model,
    providerConfig,
    contextCharacterLength: contextString.length,
    runs,
  });
}
