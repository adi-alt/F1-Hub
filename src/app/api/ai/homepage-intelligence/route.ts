// POST /api/ai/homepage-intelligence
// The single bundled AI endpoint for the F1 Hub homepage.
// Features:
// 1. Single model invocation with pre-fetched context (no tool loops).
// 2. Strict 40 RPM provider ceiling enforcement with sliding window.
// 3. Two-tier caching: GLOBAL (race/model/simulation/community - independent of any one user's
//    prediction) vs PERSONAL (global + this user's favorites/pick/fingerprint/visit history).
// 4. Single-flight generation lock so a cache-miss stampede doesn't fan out into N model calls.
// 5. Guaranteed deterministic (and itself personalized) fallback on rate limit, provider error, or
//    timeout - see fallback.ts.
// 6. Zero-call shortcut for unauthenticated or default-state users via the global cache tier.

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session/getSession";
import { resolveCurrentCircuitToArchiveId } from "@/lib/circuitSlug";
import { getNextUpcomingRace, getRacesByYear } from "@/lib/supabase/races";
import { getAllArchiveCircuits } from "@/lib/supabase/archive";
import {
  computeSeasonStandings,
  getTrackHistory,
  getFavoriteDriverCard,
  getFavoriteTeamCard,
} from "@/lib/personalization";
import { getUserProfile, touchHomepageVisit } from "@/lib/supabase/users";
import { getUserPicksForYear } from "@/lib/supabase/picks";
import { computePredictionFingerprint } from "@/lib/predictionPerformance";
import { listFeedPosts } from "@/lib/supabase/groupPosts";
import { computeSinceLastVisit } from "@/lib/ai/sinceLastVisit";
import { generateHomepageIntelligence } from "@/lib/ai/orchestrator";
import {
  buildGlobalCacheKey,
  buildPersonalCacheKey,
  computeDataVersion,
  getCachedIntelligence,
  setCachedIntelligence,
  withSingleFlight,
  DEFAULT_GLOBAL_TTL_SECONDS,
  DEFAULT_PERSONAL_TTL_SECONDS,
} from "@/lib/ai/cache";
import { checkProviderCapacity } from "@/lib/ai/providerRateLimiter";
import { generateDeterministicFallback, type FallbackDataContext } from "@/lib/ai/fallback";
import { logAIError, logDeterministicFallback } from "@/lib/ai/telemetry";
import type { HomepageContextData } from "@/lib/ai/context";
import type { HomepageIntelligence } from "@/lib/ai/schemas/homepageIntelligence";
import type { AgentContext } from "@/lib/ai/types";
import crypto from "crypto";

// Headroom above the provider's own 80s AbortController timeout (nemotron.ts, single attempt - see
// orchestrator.ts's own comment on why this task doesn't retry) plus our own data-fetching/
// processing overhead - Vercel's own default function duration would otherwise kill this route
// before our own timeout logic ever gets to run its course and return a clean fallback. 80s itself
// carries real margin above the one measured real-task completion (58.4s, via the diagnostic
// route's representative-context probe).
export const maxDuration = 110;

type GenerationResult = { data: HomepageIntelligence; isFallback: boolean; fallbackReason?: string; cacheTier: "personal" | "global" | "global_shared" | "fresh" };

export async function POST() {
  const requestId = `req_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;

  try {
    // 1. Authenticate user via session (never trust a client-provided identity for anything below)
    const session = await getSession();
    const userId = session?.uid || null;

    // 2. Fetch deterministic GLOBAL data in parallel
    const year = new Date().getFullYear();
    const [nextRace, races, archiveCircuits] = await Promise.all([
      getNextUpcomingRace(year).catch(() => null),
      getRacesByYear(year).catch(() => []),
      getAllArchiveCircuits().catch(() => []),
    ]);
    const raceId = nextRace?.id || `season_${year}_prep`;

    // Same circuit-name -> archive-circuit-id resolution page.tsx already uses - nextRace.circuit is
    // FastF1's raw location string ("Budapest"), NOT an archive circuitId ("hungaroring"). A
    // previous version of this route passed the raw string straight into getTrackHistory(), which
    // silently returned null for almost every circuit.
    const circuitLocalities = new Map(archiveCircuits.filter((c) => c.locality).map((c) => [c.circuitId, c.locality as string]));
    const circuitIdsByName = new Map(archiveCircuits.filter((c) => c.name).map((c) => [c.name!.trim().toLowerCase(), c.circuitId]));
    const resolvedCircuitId = nextRace ? resolveCurrentCircuitToArchiveId(nextRace.circuit, circuitLocalities, circuitIdsByName) : null;

    const standings = await computeSeasonStandings(year).catch(() => null);
    const driverLeader = standings?.drivers?.[0];
    const driverSecond = standings?.drivers?.[1];
    const driverThird = standings?.drivers?.[2];
    const constructorLeader = standings?.teams?.[0];
    const constructorSecond = standings?.teams?.[1];

    // 3. User-specific data (if signed in) - favorites, prediction, prediction fingerprint,
    // community context, and prior-visit state for the Since-Last-Visit diff.
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

      if (profile?.favoriteDrivers?.[0]) {
        favoriteDriverCard = await getFavoriteDriverCard(profile.favoriteDrivers[0]).catch(() => null);
      }
      if (profile?.favoriteTeams?.[0]) {
        favoriteTeamCard = await getFavoriteTeamCard(profile.favoriteTeams[0]).catch(() => null);
      }

      // Circuit history is resolved once here (with the user's real favorite ids attached) rather
      // than a second, unpersonalized getTrackHistory call below.
      if (resolvedCircuitId) {
        trackHistory = await getTrackHistory(resolvedCircuitId, {
          favoriteDriverId: profile?.favoriteDrivers?.[0],
          favoriteTeamId: profile?.favoriteTeams?.[0],
        }).catch(() => null);
      }
    } else if (resolvedCircuitId) {
      trackHistory = await getTrackHistory(resolvedCircuitId).catch(() => null);
    }

    // Real Monte Carlo simulation - the only source a "probability" figure is allowed to come from.
    const simTop = nextRace?.simulation?.drivers ? [...nextRace.simulation.drivers].sort((a, b) => b.p1 - a.p1)[0] : undefined;
    const simTopName = simTop ? (nextRace?.inputs?.find((i) => i.driver === simTop.driver)?.driverName ?? standings?.drivers.find((d) => d.driver === simTop.driver)?.driverName ?? simTop.driver) : undefined;

    // Random Forest - a ranking + feature importance, never a probability.
    const rfTop = nextRace?.prediction?.finishOrder?.[0];
    const rfTopName = rfTop ? (nextRace?.inputs?.find((i) => i.driver === rfTop.driver)?.driverName ?? standings?.drivers.find((d) => d.driver === rfTop.driver)?.driverName ?? rfTop.driver) : undefined;
    const rfTopFactors = nextRace?.prediction?.finishFeatureImportance
      ? Object.entries(nextRace.prediction.finishFeatureImportance)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([k]) => k)
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

    // 4. Compute independent GLOBAL and PERSONAL data-version hashes.
    // GLOBAL depends only on facts every visitor shares - a user's own prediction must never
    // invalidate the cache entry every other visitor reads.
    const globalDataVersion = computeDataVersion([
      raceId,
      nextRace?.updatedAt,
      simTop ? `${simTop.driver}:${simTop.p1}` : "",
      rfTop ? `${rfTop.driver}` : "",
      feedPosts.length, // global community-pulse input only counts volume, not per-user content
    ]);
    const personalDataVersion = userId
      ? computeDataVersion([
          globalDataVersion,
          userId,
          favoriteDriverCard?.driverId,
          favoriteTeamCard?.teamId,
          userPick?.submittedAt,
          fingerprint?.totalPredictions,
          sinceLastVisit?.changes.length ?? 0,
        ])
      : null;

    const globalCacheKey = buildGlobalCacheKey(raceId, globalDataVersion);
    const personalCacheKey = userId && personalDataVersion ? buildPersonalCacheKey(userId, raceId, personalDataVersion) : null;

    // 5. Build the fallback context up front - used whether we hit cache, generate fresh, or fail.
    const fallbackContext: FallbackDataContext = {
      race: nextRace ? { name: nextRace.name, round: nextRace.round, season: nextRace.year, circuitName: nextRace.circuit, city: nextRace.circuit } : null,
      standings: {
        driverLeader: driverLeader ? { name: driverLeader.driverName, points: driverLeader.points } : undefined,
        driverSecond: driverSecond ? { name: driverSecond.driverName, points: driverSecond.points } : undefined,
        constructorLeader: constructorLeader ? { name: constructorLeader.team, points: constructorLeader.points } : undefined,
      },
      trackHistory: trackHistory ? { defendingWinner: trackHistory.defendingWinner?.driverName, topPerformer: trackHistory.topPerformer?.driverName, totalRaces: trackHistory.totalRaces } : null,
      favoriteDriver: favoriteDriverCard
        ? {
            name: favoriteDriverCard.name,
            teamName: favoriteDriverCard.team || undefined,
            rank: standings ? standings.drivers.findIndex((d) => d.driver === favoriteDriverCard!.code) + 1 || undefined : undefined,
            points: standings?.drivers.find((d) => d.driver === favoriteDriverCard!.code)?.points,
            circuit: trackHistory?.favoriteDriverCircuitStats ?? null,
          }
        : null,
      favoriteTeam: favoriteTeamCard
        ? {
            name: favoriteTeamCard.name,
            rank: standings ? standings.teams.findIndex((t) => t.team === favoriteTeamCard!.currentName) + 1 || undefined : undefined,
            points: standings?.teams.find((t) => t.team === favoriteTeamCard!.currentName)?.points,
          }
        : null,
      model: rfTopName ? { topPredictedDriver: rfTopName } : null,
      simulation: simTopName ? { topSimulatedDriver: simTopName, p1Probability: simTop?.p1 } : null,
      userPrediction: userPick ? { predictedWinner: userPick.predictedWinner || undefined, submitted: !!userPick.submittedAt } : null,
      predictionPerformance: fingerprint && fingerprint.totalPredictions > 0 ? { winnerAccuracy: fingerprint.winnerAccuracy, totalPredictions: fingerprint.totalPredictions, avgPositionError: fingerprint.avgPositionError ?? undefined } : null,
      communitySummary: feedPosts.length > 0 ? { recentPostCount: feedPosts.length, hotTopic: feedPosts[0]?.title || undefined } : null,
      sinceLastVisit,
    };

    // 6. Aggressive caching checks - personal, then global-shared for a default-state user, then
    // plain global for a guest.
    const isDefaultUser = !favoriteDriverCard && !favoriteTeamCard && !userPick && (!fingerprint || fingerprint.totalPredictions === 0);

    async function respondCached(data: HomepageIntelligence, cacheTier: GenerationResult["cacheTier"]) {
      if (userId) await touchHomepageVisit(userId).catch((err) => logAIError(requestId, "touch_visit_failed", String(err)));
      return NextResponse.json({ data, cached: true, cacheTier, dataVersion: personalDataVersion ?? globalDataVersion, isFallback: false });
    }

    if (personalCacheKey) {
      const cachedPersonal = await getCachedIntelligence<HomepageIntelligence>(personalCacheKey, requestId);
      if (cachedPersonal) return respondCached(cachedPersonal, "personal");

      if (isDefaultUser) {
        const cachedGlobal = await getCachedIntelligence<HomepageIntelligence>(globalCacheKey, requestId);
        if (cachedGlobal) return respondCached(cachedGlobal, "global_shared");
      }
    } else {
      const cachedGlobal = await getCachedIntelligence<HomepageIntelligence>(globalCacheKey, requestId);
      if (cachedGlobal) return respondCached(cachedGlobal, "global");
    }

    // 7. Check Provider RPM Capacity (NVIDIA 40 RPM ceiling) before doing any generation work.
    const capacity = checkProviderCapacity("nvidia");
    if (!capacity.allowed) {
      logDeterministicFallback(requestId, "PROVIDER_RATE_LIMITED", { currentRPM: capacity.currentRPM, limit: capacity.limit, retryAfterSeconds: capacity.retryAfterSeconds });
      const fallback = generateDeterministicFallback(fallbackContext, "PROVIDER_RATE_LIMITED");
      if (userId) await touchHomepageVisit(userId).catch(() => {});
      return NextResponse.json({ data: fallback.data, cached: false, isFallback: true, fallbackReason: "PROVIDER_RATE_LIMITED", retryAfterSeconds: capacity.retryAfterSeconds, dataVersion: personalDataVersion ?? globalDataVersion });
    }

    // 8. Build the compact structured context and invoke the orchestrator - single-flight guarded
    // on whichever cache key this response will be stored under, so concurrent misses on the same
    // key collapse into one real model call (see cache.ts's own comment on the process-local limit).
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

    const agentContext: AgentContext = { userId, requestId, agentType: "homepage_intelligence", raceId };
    const generationKey = personalCacheKey ?? globalCacheKey;

    const output = await withSingleFlight(generationKey, () => generateHomepageIntelligence(contextData, agentContext, personalDataVersion ?? globalDataVersion));

    // 9. Cache the result. Global slice only stores generic (non-personal) content quality - it's
    // still the SAME response object (the model already tailors it when personal context existed), but
    // it's only ever served back to another user when isDefaultUser is true, so nothing leaks.
    if (!output.isFallback) {
      await setCachedIntelligence(globalCacheKey, output.data, globalDataVersion, DEFAULT_GLOBAL_TTL_SECONDS, { model: output.modelIdentifier, promptVersion: output.promptVersion, requestId });
      if (personalCacheKey) {
        await setCachedIntelligence(personalCacheKey, output.data, personalDataVersion!, DEFAULT_PERSONAL_TTL_SECONDS, { model: output.modelIdentifier, promptVersion: output.promptVersion, requestId });
      }
    }

    if (userId) await touchHomepageVisit(userId).catch((err) => logAIError(requestId, "touch_visit_failed", String(err)));

    return NextResponse.json({ data: output.data, cached: false, isFallback: output.isFallback || false, fallbackReason: output.fallbackReason, dataVersion: personalDataVersion ?? globalDataVersion });
  } catch (err) {
    logAIError(requestId, "unhandled_route_exception", String(err));
    // Even on unhandled exception, return deterministic fallback rather than crashing.
    const fallback = generateDeterministicFallback({}, "SERVER_EXCEPTION");
    return NextResponse.json({ data: fallback.data, cached: false, isFallback: true, fallbackReason: "SERVER_EXCEPTION" });
  }
}
