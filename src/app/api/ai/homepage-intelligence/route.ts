// POST /api/ai/homepage-intelligence
// The single bundled AI endpoint for the F1 Hub homepage.
// Features:
// 1. Single model invocation with pre-fetched context (no tool loops).
// 2. Strict 40 RPM provider ceiling enforcement with sliding window.
// 3. Two-tier aggressive caching: global shared across users vs personal user-scoped.
// 4. Guaranteed deterministic fallback on rate limit, provider error, or timeout.
// 5. Zero-call shortcut for unauthenticated or default-state users.

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session/getSession";
import { getNextUpcomingRace, getRacesByYear } from "@/lib/supabase/races";
import {
  computeSeasonStandings,
  getTrackHistory,
  getFavoriteDriverCard,
  getFavoriteTeamCard,
} from "@/lib/personalization";
import { getUserProfile } from "@/lib/supabase/users";
import { getUserPicksForYear } from "@/lib/supabase/picks";
import { computePredictionPerformance } from "@/lib/predictionPerformance";
import { listFeedPosts } from "@/lib/supabase/groupPosts";
import { generateHomepageIntelligence } from "@/lib/ai/orchestrator";
import {
  buildGlobalCacheKey,
  buildPersonalCacheKey,
  computeDataVersion,
  getCachedIntelligence,
  setCachedIntelligence,
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

export async function POST() {
  const requestId = `req_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;

  try {
    // 1. Authenticate user via session
    const session = await getSession();
    const userId = session?.uid || null;

    // 2. Fetch deterministic data in parallel
    const year = new Date().getFullYear();
    const [nextRace, races] = await Promise.all([
      getNextUpcomingRace(year).catch(() => null),
      getRacesByYear(year).catch(() => []),
    ]);
    const raceId = nextRace?.id || `season_${year}_prep`;

    const [standings, trackHistory] = await Promise.all([
      computeSeasonStandings(year).catch(() => null),
      nextRace?.circuit ? getTrackHistory(nextRace.circuit).catch(() => null) : Promise.resolve(null),
    ]);

    // User-specific data (if signed in)
    let favoriteDriverCard = null;
    let favoriteTeamCard = null;
    let userPick = null;
    let predictionPerf = null;
    let feedPosts: Array<{ title?: string; group_id?: string }> = [];

    if (userId) {
      const [profile, picks, feed] = await Promise.all([
        getUserProfile(userId).catch(() => null),
        getUserPicksForYear(userId, year).catch(() => []),
        listFeedPosts(userId, { feedType: "following", limit: 10 }).catch(() => ({ posts: [], hasMore: false })),
      ]);

      userPick = nextRace ? picks.find((p) => p.raceId === nextRace.id) ?? null : null;
      predictionPerf = computePredictionPerformance(picks, races);
      feedPosts = feed.posts.map((p) => ({
        title: p.title ?? undefined,
        group_id: p.groupId ?? undefined,
      }));

      if (profile?.favoriteDrivers?.[0]) {
        favoriteDriverCard = await getFavoriteDriverCard(profile.favoriteDrivers[0]).catch(() => null);
      }
      if (profile?.favoriteTeams?.[0]) {
        favoriteTeamCard = await getFavoriteTeamCard(profile.favoriteTeams[0]).catch(() => null);
      }
    }

    // 3. Compute composite dataVersion hash
    const dataVersion = computeDataVersion([
      raceId,
      nextRace?.updatedAt,
      nextRace?.prediction ? JSON.stringify(nextRace.prediction) : "",
      userPick?.submittedAt,
      predictionPerf?.winner.total,
    ]);

    const globalCacheKey = buildGlobalCacheKey(raceId, dataVersion);
    const personalCacheKey = userId ? buildPersonalCacheKey(userId, raceId, dataVersion) : null;

    // 4. Aggressive Caching Checks
    // Check personal cache if authenticated
    if (personalCacheKey) {
      const cachedPersonal = await getCachedIntelligence<HomepageIntelligence>(personalCacheKey, requestId);
      if (cachedPersonal) {
        return NextResponse.json({
          data: cachedPersonal,
          cached: true,
          cacheTier: "personal",
          dataVersion,
          isFallback: false,
        });
      }

      // If user has no personal favorites or prediction history, check global cache
      const isDefaultUser = !favoriteDriverCard && !favoriteTeamCard && !userPick && (!predictionPerf || predictionPerf.winner.total === 0);
      if (isDefaultUser) {
        const cachedGlobal = await getCachedIntelligence<HomepageIntelligence>(globalCacheKey, requestId);
        if (cachedGlobal) {
          return NextResponse.json({
            data: cachedGlobal,
            cached: true,
            cacheTier: "global_shared",
            dataVersion,
            isFallback: false,
          });
        }
      }
    } else {
      // Unauthenticated visitor: check global cache
      const cachedGlobal = await getCachedIntelligence<HomepageIntelligence>(globalCacheKey, requestId);
      if (cachedGlobal) {
        return NextResponse.json({
          data: cachedGlobal,
          cached: true,
          cacheTier: "global",
          dataVersion,
          isFallback: false,
        });
      }
    }

    // 5. Build context objects
    const driverLeader = standings?.drivers?.[0];
    const driverSecond = standings?.drivers?.[1];
    const constructorLeader = standings?.teams?.[0];

    const fallbackContext: FallbackDataContext = {
      race: nextRace
        ? {
            name: nextRace.name,
            round: nextRace.round,
            season: nextRace.year,
            circuitName: nextRace.circuit,
            city: nextRace.circuit,
          }
        : null,
      standings: {
        driverLeader: driverLeader ? { name: driverLeader.driverName, points: driverLeader.points } : undefined,
        driverSecond: driverSecond ? { name: driverSecond.driverName, points: driverSecond.points } : undefined,
        constructorLeader: constructorLeader ? { name: constructorLeader.team, points: constructorLeader.points } : undefined,
      },
      trackHistory: trackHistory
        ? {
            defendingWinner: trackHistory.defendingWinner?.driverName,
            topPerformer: trackHistory.topPerformer?.driverName,
            totalRaces: trackHistory.totalRaces,
          }
        : null,
      favoriteDriver: favoriteDriverCard
        ? {
            name: favoriteDriverCard.name,
            teamName: favoriteDriverCard.team || undefined,
          }
        : null,
      favoriteTeam: favoriteTeamCard
        ? {
            name: favoriteTeamCard.name,
          }
        : null,
      model: nextRace?.prediction
        ? {
            topPredictedDriver: nextRace.prediction.finishOrder?.[0]?.driver || undefined,
            winProbability: nextRace.prediction.finishFeatureImportance?.grid || undefined,
          }
        : null,
      userPrediction: userPick
        ? {
            predictedWinner: userPick.predictedWinner || undefined,
            submitted: !!userPick.submittedAt,
          }
        : null,
      predictionPerformance: predictionPerf
        ? {
            winnerAccuracy:
              predictionPerf.winner.total > 0
                ? (predictionPerf.winner.correct / predictionPerf.winner.total) * 100
                : 0,
            totalPredictions: predictionPerf.winner.total,
            avgPositionError: predictionPerf.avgPositionError ?? undefined,
          }
        : null,
      communitySummary: feedPosts.length > 0
        ? {
            recentPostCount: feedPosts.length,
            hotTopic: feedPosts[0]?.title || undefined,
          }
        : null,
    };

    // 6. Check Provider RPM Capacity (NVIDIA 40 RPM ceiling)
    const capacity = checkProviderCapacity("nvidia");
    if (!capacity.allowed) {
      logDeterministicFallback(requestId, "PROVIDER_RATE_LIMITED", {
        currentRPM: capacity.currentRPM,
        limit: capacity.limit,
        retryAfterSeconds: capacity.retryAfterSeconds,
      });

      const fallback = generateDeterministicFallback(fallbackContext, "PROVIDER_RATE_LIMITED");
      return NextResponse.json({
        data: fallback.data,
        cached: false,
        isFallback: true,
        fallbackReason: "PROVIDER_RATE_LIMITED",
        retryAfterSeconds: capacity.retryAfterSeconds,
        dataVersion,
      });
    }

    // 7. Invoke Orchestrator (Direct Mode)
    const contextData: HomepageContextData = {
      race: nextRace
        ? {
            id: nextRace.id,
            name: nextRace.name,
            round: nextRace.round,
            season: nextRace.year,
            circuitName: nextRace.circuit,
            city: nextRace.circuit,
          }
        : null,
      standings: {
        driverLeader: driverLeader
          ? { name: driverLeader.driverName, team: driverLeader.team, points: driverLeader.points }
          : undefined,
        driverSecond: driverSecond
          ? { name: driverSecond.driverName, team: driverSecond.team, points: driverSecond.points }
          : undefined,
        constructorLeader: constructorLeader
          ? { name: constructorLeader.team, points: constructorLeader.points }
          : undefined,
      },
      trackHistory: trackHistory
        ? {
            defendingWinner: trackHistory.defendingWinner?.driverName,
            topPerformer: trackHistory.topPerformer?.driverName,
            totalRaces: trackHistory.totalRaces,
          }
        : null,
      favoriteDriver: favoriteDriverCard
        ? {
            name: favoriteDriverCard.name,
            teamName: favoriteDriverCard.team || undefined,
          }
        : null,
      favoriteTeam: favoriteTeamCard
        ? {
            name: favoriteTeamCard.name,
          }
        : null,
      model: nextRace?.prediction
        ? {
            topPredictedDriver: nextRace.prediction.finishOrder?.[0]?.driver,
            winProbability: nextRace.prediction.finishFeatureImportance?.grid,
          }
        : null,
      userPrediction: userPick
        ? {
            predictedWinner: userPick.predictedWinner || undefined,
            submitted: !!userPick.submittedAt,
          }
        : null,
      predictionPerformance: predictionPerf
        ? {
            winnerAccuracy:
              predictionPerf.winner.total > 0
                ? (predictionPerf.winner.correct / predictionPerf.winner.total) * 100
                : 0,
            podiumAccuracy:
              predictionPerf.podiumSlots.total > 0
                ? (predictionPerf.podiumSlots.correct / predictionPerf.podiumSlots.total) * 100
                : 0,
            avgPositionError: predictionPerf.avgPositionError ?? undefined,
            totalPredictions: predictionPerf.winner.total,
          }
        : null,
      communityPosts: feedPosts.map((p) => ({ title: p.title })),
    };

    const agentContext: AgentContext = {
      userId,
      requestId,
      agentType: "homepage_intelligence",
      raceId,
    };

    const output = await generateHomepageIntelligence(contextData, agentContext, dataVersion);

    // 8. Cache the result aggressively
    if (!output.isFallback) {
      // Save global cache slice (accessible by all users)
      await setCachedIntelligence(globalCacheKey, output.data, dataVersion, DEFAULT_GLOBAL_TTL_SECONDS, {
        model: output.modelIdentifier,
        promptVersion: output.promptVersion,
        requestId,
      });

      // If user is authenticated, save personal cache bundle
      if (personalCacheKey) {
        await setCachedIntelligence(personalCacheKey, output.data, dataVersion, DEFAULT_PERSONAL_TTL_SECONDS, {
          model: output.modelIdentifier,
          promptVersion: output.promptVersion,
          requestId,
        });
      }
    }

    return NextResponse.json({
      data: output.data,
      cached: false,
      isFallback: output.isFallback || false,
      fallbackReason: output.fallbackReason,
      dataVersion,
    });
  } catch (err) {
    logAIError(requestId, "unhandled_route_exception", String(err));
    // Even on unhandled exception, return deterministic fallback rather than crashing
    const fallback = generateDeterministicFallback({}, "SERVER_EXCEPTION");
    return NextResponse.json({
      data: fallback.data,
      cached: false,
      isFallback: true,
      fallbackReason: "SERVER_EXCEPTION",
    });
  }
}
