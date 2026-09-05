// GET /api/ai/benchmark-real
// Runs 5 real, concurrent requests per candidate model against the REAL production context -
// buildHomepageContext() + the real system prompt + real fetched data for the authenticated
// session's own account - not the /api/ai/diagnostic route's simplified hand-written sample. Records
// latency, token usage, and schema/grounding validity per run, then reports median/P95 per model.
//
// Deliberately duplicates route.ts's own data-fetching (steps 2-3 there) rather than importing a
// refactored shared helper: this file can be added, changed, or deleted freely without ever
// touching the production homepage-intelligence route, its caching, its fallback, or its default
// provider. Nothing here calls getCachedIntelligence/setCachedIntelligence/withSingleFlight - this
// benchmark can never read or pollute the real cache. buildHomepageContext, formatHomepagePrompt,
// cleanJsonOutput, and validateHomepageIntelligence ARE the real, unmodified production functions,
// imported as-is - the only things this file changes are which model receives the identical
// resulting prompt.
//
// Candidates: the currently-configured NVIDIA/Nemotron provider (production baseline - same
// maxTokens/reasoningBudget/timeout as production) vs GLM-4.7-Flash via Hugging Face (see
// huggingface.ts). Same prompt, same context, model swapped only.

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session/getSession";
import { resolveCurrentCircuitToArchiveId } from "@/lib/circuitSlug";
import { getNextUpcomingRace, getRacesByYear } from "@/lib/supabase/races";
import { getAllArchiveCircuits } from "@/lib/supabase/archive";
import { computeSeasonStandings, getTrackHistory, getFavoriteDriverCard, getFavoriteTeamCard } from "@/lib/personalization";
import { getUserProfile } from "@/lib/supabase/users";
import { getUserPicksForYear } from "@/lib/supabase/picks";
import { computePredictionFingerprint } from "@/lib/predictionPerformance";
import { listFeedPosts } from "@/lib/supabase/groupPosts";
import { computeSinceLastVisit } from "@/lib/ai/sinceLastVisit";
import { buildHomepageContext, type HomepageContextData } from "@/lib/ai/context";
import { formatHomepagePrompt } from "@/lib/ai/prompts/homepagePrompt";
import { cleanJsonOutput } from "@/lib/ai/orchestrator";
import { validateHomepageIntelligence } from "@/lib/ai/schemas/homepageIntelligence";
import { HF_BENCHMARK_MODELS } from "@/lib/ai/huggingface";

export const maxDuration = 150;

const RUNS_PER_MODEL = 5;
const REQUEST_TIMEOUT_MS = 90_000; // same budget both candidates get - production's own Nemotron timeout

type RunResult = {
  ok: boolean;
  latencyMs: number;
  promptTokens?: number;
  completionTokens?: number;
  jsonValid: boolean;
  schemaValid: boolean;
  headline?: string;
  personalRaceBriefPresent?: boolean;
  error?: string;
  // Full raw content on every run (not just valid ones) - a truncated/invalid response is itself
  // part of the quality signal the account owner asked to see, not just a pass/fail count.
  rawContent?: string;
};

async function runOnce(url: string, headers: Record<string, string>, body: Record<string, unknown>): Promise<RunResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const startedAt = Date.now();
  try {
    const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal: controller.signal });
    const latencyMs = Date.now() - startedAt;
    if (!response.ok) {
      const text = await response.text();
      return { ok: false, latencyMs, jsonValid: false, schemaValid: false, error: `HTTP ${response.status}: ${text.slice(0, 200)}` };
    }
    const json = await response.json();
    const content: string | null = json.choices?.[0]?.message?.content ?? null;
    const usage = json.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined;
    if (!content) {
      return { ok: false, latencyMs, jsonValid: false, schemaValid: false, promptTokens: usage?.prompt_tokens, completionTokens: usage?.completion_tokens, error: "empty content" };
    }

    let parsed: unknown;
    let jsonValid = true;
    try {
      parsed = JSON.parse(cleanJsonOutput(content));
    } catch {
      jsonValid = false;
    }
    const validation = jsonValid ? validateHomepageIntelligence(parsed) : { valid: false as const };
    const p = parsed as { raceBrief?: { headline?: string }; personalRaceBrief?: unknown } | undefined;

    return {
      ok: true,
      latencyMs,
      promptTokens: usage?.prompt_tokens,
      completionTokens: usage?.completion_tokens,
      jsonValid,
      schemaValid: !!validation.valid,
      headline: jsonValid ? p?.raceBrief?.headline : undefined,
      personalRaceBriefPresent: jsonValid ? !!p?.personalRaceBrief : undefined,
      rawContent: content,
    };
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    const isAbort = err instanceof Error && err.name === "AbortError";
    return { ok: false, latencyMs, jsonValid: false, schemaValid: false, error: isAbort ? `Timed out after ${REQUEST_TIMEOUT_MS}ms` : String(err) };
  } finally {
    clearTimeout(timeoutId);
  }
}

function avg(nums: number[]): number | null {
  return nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : null;
}

function summarize(runs: RunResult[]) {
  const latencies = [...runs.map((r) => r.latencyMs)].sort((a, b) => a - b);
  const p95Index = Math.min(latencies.length - 1, Math.ceil(latencies.length * 0.95) - 1);
  return {
    runs: runs.length,
    okCount: runs.filter((r) => r.ok).length,
    timeoutCount: runs.filter((r) => r.error?.includes("Timed out")).length,
    jsonValidCount: runs.filter((r) => r.jsonValid).length,
    schemaValidCount: runs.filter((r) => r.schemaValid).length,
    personalizedCount: runs.filter((r) => r.personalRaceBriefPresent).length,
    medianMs: latencies.length ? latencies[Math.floor(latencies.length / 2)] : null,
    p95Ms: latencies.length ? latencies[p95Index] : null,
    minMs: latencies[0] ?? null,
    maxMs: latencies[latencies.length - 1] ?? null,
    avgPromptTokens: avg(runs.map((r) => r.promptTokens).filter((x): x is number => x != null)),
    avgCompletionTokens: avg(runs.map((r) => r.completionTokens).filter((x): x is number => x != null)),
  };
}

export async function GET() {
  const nvidiaKey = process.env.NVIDIA_API_KEY;
  const nvidiaModel = process.env.NVIDIA_AI_MODEL || "nvidia/nemotron-3.5-lightning-30b-a3b";
  const hfToken = process.env.HF_TOKEN;

  if (!nvidiaKey) return NextResponse.json({ error: "NVIDIA_API_KEY not set" }, { status: 500 });

  // ---- Duplicated verbatim from route.ts's own real data-fetching (steps 1-3 there). ----
  const session = await getSession();
  const userId = session?.uid || null;
  const year = new Date().getFullYear();
  const [nextRace, races, archiveCircuits] = await Promise.all([
    getNextUpcomingRace(year).catch(() => null),
    getRacesByYear(year).catch(() => []),
    getAllArchiveCircuits().catch(() => []),
  ]);

  const circuitLocalities = new Map(archiveCircuits.filter((c) => c.locality).map((c) => [c.circuitId, c.locality as string]));
  const circuitIdsByName = new Map(archiveCircuits.filter((c) => c.name).map((c) => [c.name!.trim().toLowerCase(), c.circuitId]));
  const resolvedCircuitId = nextRace ? resolveCurrentCircuitToArchiveId(nextRace.circuit, circuitLocalities, circuitIdsByName) : null;

  const standings = await computeSeasonStandings(year).catch(() => null);
  const driverLeader = standings?.drivers?.[0];
  const driverSecond = standings?.drivers?.[1];
  const driverThird = standings?.drivers?.[2];
  const constructorLeader = standings?.teams?.[0];
  const constructorSecond = standings?.teams?.[1];

  let favoriteDriverCard = null;
  let favoriteTeamCard = null;
  let userPick = null;
  let fingerprint = null;
  let feedPosts: Array<{ title?: string; groupName?: string | null; createdAt?: string }> = [];
  let lastHomepageVisitAt: string | null = null;
  let newCommunityPostCount = 0;
  let trackHistory = null;

  if (userId) {
    const profile = await getUserProfile(userId).catch(() => null);
    lastHomepageVisitAt = profile?.lastHomepageVisitAt ?? null;

    const [picks, feed] = await Promise.all([
      getUserPicksForYear(userId, year).catch(() => []),
      listFeedPosts(userId, { feedType: "following", limit: 10 }).catch(() => ({ posts: [], hasMore: false })),
    ]);

    userPick = nextRace ? (picks.find((p) => p.raceId === nextRace.id) ?? null) : null;
    fingerprint = computePredictionFingerprint(picks, races, driverLeader?.driver ?? null);
    feedPosts = feed.posts.map((p) => ({ title: p.title ?? undefined, groupName: p.groupName, createdAt: p.createdAt }));
    newCommunityPostCount = lastHomepageVisitAt
      ? feedPosts.filter((p) => p.createdAt && new Date(p.createdAt).getTime() > new Date(lastHomepageVisitAt!).getTime()).length
      : 0;

    if (profile?.favoriteDrivers?.[0]) favoriteDriverCard = await getFavoriteDriverCard(profile.favoriteDrivers[0]).catch(() => null);
    if (profile?.favoriteTeams?.[0]) favoriteTeamCard = await getFavoriteTeamCard(profile.favoriteTeams[0]).catch(() => null);
    if (resolvedCircuitId) {
      trackHistory = await getTrackHistory(resolvedCircuitId, { favoriteDriverId: profile?.favoriteDrivers?.[0], favoriteTeamId: profile?.favoriteTeams?.[0] }).catch(() => null);
    }
  } else if (resolvedCircuitId) {
    trackHistory = await getTrackHistory(resolvedCircuitId).catch(() => null);
  }

  const simTop = nextRace?.simulation?.drivers ? [...nextRace.simulation.drivers].sort((a, b) => b.p1 - a.p1)[0] : undefined;
  const simTopName = simTop ? (nextRace?.inputs?.find((i) => i.driver === simTop.driver)?.driverName ?? standings?.drivers.find((d) => d.driver === simTop.driver)?.driverName ?? simTop.driver) : undefined;
  const rfTop = nextRace?.prediction?.finishOrder?.[0];
  const rfTopName = rfTop ? (nextRace?.inputs?.find((i) => i.driver === rfTop.driver)?.driverName ?? standings?.drivers.find((d) => d.driver === rfTop.driver)?.driverName ?? rfTop.driver) : undefined;
  const rfTopFactors = nextRace?.prediction?.finishFeatureImportance
    ? Object.entries(nextRace.prediction.finishFeatureImportance).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k)
    : undefined;

  const sinceLastVisit = userId
    ? computeSinceLastVisit({
        lastVisitIso: lastHomepageVisitAt,
        races,
        currentStandings: standings ?? { drivers: [], teams: [], poleCounts: {} },
        favoriteDriverCode: favoriteDriverCard?.code ?? null,
        favoriteDriverName: favoriteDriverCard?.name ?? null,
        favoriteTeamName: favoriteTeamCard?.currentName ?? null,
        pickSubmittedAt: userPick?.submittedAt ?? null,
        newCommunityPostCount,
      })
    : null;

  const contextData: HomepageContextData = {
    race: nextRace ? { id: nextRace.id, name: nextRace.name, round: nextRace.round, season: nextRace.year, circuitName: nextRace.circuit, city: nextRace.circuit } : null,
    standings: {
      driverLeader: driverLeader ? { name: driverLeader.driverName, team: driverLeader.team, points: driverLeader.points } : undefined,
      driverSecond: driverSecond ? { name: driverSecond.driverName, team: driverSecond.team, points: driverSecond.points } : undefined,
      driverThird: driverThird ? { name: driverThird.driverName, team: driverThird.team, points: driverThird.points } : undefined,
      constructorLeader: constructorLeader ? { name: constructorLeader.team, points: constructorLeader.points } : undefined,
      constructorSecond: constructorSecond ? { name: constructorSecond.team, points: constructorSecond.points } : undefined,
    },
    trackHistory: trackHistory ? { defendingWinner: trackHistory.defendingWinner?.driverName, topPerformer: trackHistory.topPerformer?.driverName, totalRaces: trackHistory.totalRaces } : null,
    model: rfTopName ? { topPredictedDriver: rfTopName, topFeatureFactors: rfTopFactors } : null,
    simulation: simTopName ? { topSimulatedDriver: simTopName, p1Probability: simTop?.p1, podiumProbability: simTop?.podium } : null,
    communityPosts: feedPosts.map((p) => ({ title: p.title, groupName: p.groupName ?? undefined })),
    favoriteDriver: favoriteDriverCard
      ? {
          name: favoriteDriverCard.name,
          teamName: favoriteDriverCard.team || undefined,
          rank: standings ? standings.drivers.findIndex((d) => d.driver === favoriteDriverCard!.code) + 1 || undefined : undefined,
          points: standings?.drivers.find((d) => d.driver === favoriteDriverCard!.code)?.points,
          circuit: trackHistory?.favoriteDriverCircuitStats
            ? { appearances: trackHistory.favoriteDriverCircuitStats.appearances, wins: trackHistory.favoriteDriverCircuitStats.wins, podiums: trackHistory.favoriteDriverCircuitStats.podiums, bestFinish: trackHistory.favoriteDriverCircuitStats.bestFinish, avgFinish: trackHistory.favoriteDriverCircuitStats.avgFinish }
            : null,
        }
      : null,
    favoriteTeam: favoriteTeamCard
      ? {
          name: favoriteTeamCard.name,
          rank: standings ? standings.teams.findIndex((t) => t.team === favoriteTeamCard!.currentName) + 1 || undefined : undefined,
          points: standings?.teams.find((t) => t.team === favoriteTeamCard!.currentName)?.points,
          circuit: trackHistory?.favoriteTeamCircuitStats
            ? { appearances: trackHistory.favoriteTeamCircuitStats.appearances, wins: trackHistory.favoriteTeamCircuitStats.wins, podiums: trackHistory.favoriteTeamCircuitStats.podiums, bestFinish: trackHistory.favoriteTeamCircuitStats.bestFinish }
            : null,
        }
      : null,
    userPrediction: userPick ? { predictedWinner: userPick.predictedWinner || undefined, submitted: !!userPick.submittedAt } : null,
    predictionFingerprint: fingerprint && fingerprint.totalPredictions > 0 ? fingerprint : null,
    sinceLastVisit,
  };

  // ---- Real, unmodified context builder + prompt - exactly what production sends. ----
  const contextString = buildHomepageContext(contextData);
  const messages = formatHomepagePrompt(contextString);

  const nvidiaHeaders = { Authorization: `Bearer ${nvidiaKey}`, "Content-Type": "application/json", Accept: "application/json" };
  const nvidiaBody = {
    model: nvidiaModel,
    messages,
    max_tokens: 3500,
    temperature: 0.7,
    reasoning_budget: 512,
    chat_template_kwargs: { enable_thinking: true },
  };

  const results: { nemotron: RunResult[]; glm: RunResult[] } = { nemotron: [], glm: [] };
  const runs: Promise<void>[] = [];

  for (let i = 0; i < RUNS_PER_MODEL; i++) {
    runs.push(
      runOnce("https://integrate.api.nvidia.com/v1/chat/completions", nvidiaHeaders, nvidiaBody).then((r) => {
        results.nemotron[i] = r;
      }),
    );
  }

  if (hfToken) {
    const hfHeaders = { Authorization: `Bearer ${hfToken}`, "Content-Type": "application/json", Accept: "application/json" };
    const hfBody = { model: HF_BENCHMARK_MODELS.glm, messages, max_tokens: 3500, temperature: 0.7, stream: false };
    for (let i = 0; i < RUNS_PER_MODEL; i++) {
      runs.push(
        runOnce("https://router.huggingface.co/v1/chat/completions", hfHeaders, hfBody).then((r) => {
          results.glm[i] = r;
        }),
      );
    }
  }

  await Promise.all(runs);

  return NextResponse.json({
    testedForUserId: userId,
    contextCharacterLength: contextString.length,
    // All 10 requests ran concurrently (both models' 5 runs at once), not sequentially - each
    // real request in production has run in isolation, so this may inflate absolute latency
    // slightly for both candidates via shared queueing/throughput contention. Since both experience
    // the same concurrent-load condition, the COMPARISON between them is still fair; the absolute
    // numbers are a conservative (not optimistic) estimate of real single-request latency.
    concurrencyCaveat: "All runs executed concurrently, not sequentially - see this field's own comment in source.",
    hfTokenConfigured: !!hfToken,
    results,
    summary: {
      nemotron: summarize(results.nemotron),
      glm: hfToken ? summarize(results.glm) : null,
    },
  });
}
