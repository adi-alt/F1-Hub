// POST /api/ai/benchmark-real
// Generalized real-context AI model bake-off harness. Runs N real, concurrent requests per
// candidate model - {provider: "nvidia"|"hf", model, label} - against the REAL production
// context (buildHomepageContext() + the real system prompt + real fetched data for the
// authenticated session's own account), not the /api/ai/diagnostic route's simplified sample.
//
// Deliberately duplicates route.ts's own data-fetching (steps 2-3 there) rather than importing a
// refactored shared helper: this file can be added, changed, or deleted freely without ever
// touching the production homepage-intelligence route, its caching, its fallback, or its default
// provider. Nothing here calls getCachedIntelligence/setCachedIntelligence/withSingleFlight - this
// benchmark can never read or pollute the real cache. buildHomepageContext, formatHomepagePrompt,
// cleanJsonOutput, and validateHomepageIntelligence ARE the real, unmodified production functions,
// imported as-is - the only thing this file varies is which model/provider receives the identical
// resulting prompt.
//
// Candidate list is driven entirely by the POST body, not hardcoded here - a full bake-off across
// dozens of models is run as several small batches (a handful of models per call, so total wall
// time and concurrent connections stay bounded within maxDuration), orchestrated externally by
// whoever calls this route, not by a job queue inside the app.
//
// Payload shape per candidate: every NVIDIA model gets the SAME plain, universal OpenAI-compatible
// body (model, messages, max_tokens, temperature, stream:false) - NO reasoning-specific extras -
// except the one candidate explicitly flagged useProductionNemotronShape, which gets the exact
// live-production Nemotron shape (chat_template_kwargs.enable_thinking + reasoning_budget:512)
// unchanged. Every NVIDIA-hosted model has its own undocumented reasoning-control shape (confirmed
// this session: Kimi K3, DeepSeek, and Nemotron each differ) - applying Nemotron's own hand-tuned
// params to an unrelated model isn't a fair "same prompt, different model" test, and using an
// unrecognized/unsupported param for a fresh candidate is exactly the kind of guess that has
// previously caused real HTTP 400s. Testing every fresh candidate at its own out-of-the-box default
// reasoning depth is the fair baseline; only the current production entry represents "as configured
// today." HF's router is already a plain OpenAI-compatible passthrough for every model (confirmed
// via HF's own docs), so no such split is needed there.

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

export const maxDuration = 150; // matches the already-verified-working duration from the prior single-pair benchmark run

const REQUEST_TIMEOUT_MS = 90_000; // same budget every candidate gets - production's own Nemotron timeout
const DEFAULT_RUNS_PER_MODEL = 5;

type Candidate = {
  provider: "nvidia" | "hf";
  model: string;
  label: string;
  useProductionNemotronShape?: boolean;
};

type RunResult = {
  ok: boolean;
  latencyMs: number;
  promptTokens?: number;
  completionTokens?: number;
  reasoningTokens?: number;
  jsonValid: boolean;
  schemaValid: boolean;
  headline?: string;
  personalRaceBriefPresent?: boolean;
  error?: string;
  rateLimitHeaders?: Record<string, string>;
  // Full raw content on every run (not just valid ones) - a truncated/invalid response is itself
  // part of the quality signal, not just a pass/fail count.
  rawContent?: string;
};

function extractRateLimitHeaders(response: Response): Record<string, string> {
  const out: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    if (/ratelimit|retry-after/i.test(key)) out[key] = value;
  });
  return out;
}

async function runOnce(url: string, headers: Record<string, string>, body: Record<string, unknown>): Promise<RunResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const startedAt = Date.now();
  try {
    const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal: controller.signal });
    const latencyMs = Date.now() - startedAt;
    const rateLimitHeaders = extractRateLimitHeaders(response);
    if (!response.ok) {
      const text = await response.text();
      return { ok: false, latencyMs, jsonValid: false, schemaValid: false, error: `HTTP ${response.status}: ${text.slice(0, 200)}`, rateLimitHeaders };
    }
    const json = await response.json();
    const content: string | null = json.choices?.[0]?.message?.content ?? null;
    const usage = json.usage as { prompt_tokens?: number; completion_tokens?: number; completion_tokens_details?: { reasoning_tokens?: number } } | undefined;
    if (!content) {
      return { ok: false, latencyMs, jsonValid: false, schemaValid: false, promptTokens: usage?.prompt_tokens, completionTokens: usage?.completion_tokens, error: "empty content", rateLimitHeaders };
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
      reasoningTokens: usage?.completion_tokens_details?.reasoning_tokens,
      jsonValid,
      schemaValid: !!validation.valid,
      headline: jsonValid ? p?.raceBrief?.headline : undefined,
      personalRaceBriefPresent: jsonValid ? !!p?.personalRaceBrief : undefined,
      rawContent: content,
      rateLimitHeaders,
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
  const n = latencies.length;
  const p95Index = Math.min(n - 1, Math.ceil(n * 0.95) - 1);
  return {
    runs: n,
    okCount: runs.filter((r) => r.ok).length,
    timeoutCount: runs.filter((r) => r.error?.includes("Timed out")).length,
    jsonValidCount: runs.filter((r) => r.jsonValid).length,
    schemaValidCount: runs.filter((r) => r.schemaValid).length,
    personalizedCount: runs.filter((r) => r.personalRaceBriefPresent).length,
    medianMs: n ? latencies[Math.floor(n / 2)] : null,
    p95Ms: n ? latencies[p95Index] : null,
    minMs: latencies[0] ?? null,
    maxMs: latencies[n - 1] ?? null,
    avgPromptTokens: avg(runs.map((r) => r.promptTokens).filter((x): x is number => x != null)),
    avgCompletionTokens: avg(runs.map((r) => r.completionTokens).filter((x): x is number => x != null)),
    avgReasoningTokens: avg(runs.map((r) => r.reasoningTokens).filter((x): x is number => x != null)),
  };
}

export async function POST(request: Request) {
  const nvidiaKey = process.env.NVIDIA_API_KEY;
  const hfToken = process.env.HF_TOKEN;

  let payload: { candidates?: Candidate[]; runsPerModel?: number };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const candidates = payload.candidates;
  if (!candidates || !candidates.length) {
    return NextResponse.json({ error: "candidates array required, e.g. [{provider:'nvidia',model:'...',label:'...'}]" }, { status: 400 });
  }
  const runsPerModel = payload.runsPerModel && payload.runsPerModel > 0 ? payload.runsPerModel : DEFAULT_RUNS_PER_MODEL;

  const needsNvidia = candidates.some((c) => c.provider === "nvidia");
  const needsHf = candidates.some((c) => c.provider === "hf");
  if (needsNvidia && !nvidiaKey) return NextResponse.json({ error: "NVIDIA_API_KEY not set" }, { status: 500 });
  if (needsHf && !hfToken) return NextResponse.json({ error: "HF_TOKEN not set" }, { status: 500 });

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
  const hfHeaders = { Authorization: `Bearer ${hfToken}`, "Content-Type": "application/json", Accept: "application/json" };

  function buildBody(candidate: Candidate): Record<string, unknown> {
    if (candidate.provider === "nvidia" && candidate.useProductionNemotronShape) {
      return {
        model: candidate.model,
        messages,
        max_tokens: 3500,
        temperature: 0.7,
        reasoning_budget: 512,
        chat_template_kwargs: { enable_thinking: true },
      };
    }
    return { model: candidate.model, messages, max_tokens: 3500, temperature: 0.7, stream: false };
  }

  const results: Record<string, RunResult[]> = {};
  const runs: Promise<void>[] = [];

  for (const candidate of candidates) {
    results[candidate.label] = [];
    const url = candidate.provider === "nvidia" ? "https://integrate.api.nvidia.com/v1/chat/completions" : "https://router.huggingface.co/v1/chat/completions";
    const headers = candidate.provider === "nvidia" ? nvidiaHeaders : hfHeaders;
    const body = buildBody(candidate);
    for (let i = 0; i < runsPerModel; i++) {
      runs.push(
        runOnce(url, headers, body).then((r) => {
          results[candidate.label][i] = r;
        }),
      );
    }
  }

  await Promise.all(runs);

  const summary: Record<string, ReturnType<typeof summarize>> = {};
  for (const candidate of candidates) summary[candidate.label] = summarize(results[candidate.label]);

  return NextResponse.json({
    testedForUserId: userId,
    contextCharacterLength: contextString.length,
    // All requests across all candidates in this call ran concurrently, not sequentially - each
    // real request in production runs in isolation, so this may inflate absolute latency slightly
    // via shared queueing/throughput contention. Since every candidate in a given call experiences
    // the same concurrent-load condition, the COMPARISON between them stays fair; treat absolute
    // numbers as a conservative (not optimistic) estimate of real single-request latency.
    concurrencyCaveat: "All runs in this call executed concurrently, not sequentially.",
    candidates,
    runsPerModel,
    results,
    summary,
  });
}
