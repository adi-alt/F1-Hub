// POST /api/ai/homepage-intelligence
// The single bundled AI endpoint for the F1 Hub homepage.
// Features:
// 1. Single model invocation with pre-fetched context (no tool loops).
// 2. Strict 40 RPM provider ceiling enforcement with sliding window.
// 3. Two-tier caching: GLOBAL (race/model/simulation - independent of any one user's prediction)
//    vs PERSONAL (global + this user's favorites/pick/fingerprint/visit history).
// 4. Single-flight generation lock so a cache-miss stampede doesn't fan out into N model calls.
// 5. Guaranteed deterministic (and itself personalized) fallback on rate limit, provider error, or
//    timeout - see fallback.ts.
// 6. Zero-call shortcut for unauthenticated or default-state users via the global cache tier.
// 7. CACHE-FIRST for authenticated users too (2026-09-10 perf pass): only `getUserProfile`/
//    `getUserPicksForYear` (needed to build the personal cache key at all) run before the cache
//    check. `getFavoriteDriverCard`/`getFavoriteTeamCard`/`getTrackHistory`/`listFeedPosts` - the
//    genuinely expensive personalization-enrichment calls - are deferred until AFTER a real cache
//    MISS is confirmed, since none of them affect the cache key and a cache HIT never needs them.
//    Real, measured problem this fixes: an authenticated cache HIT was taking 1.5-3s (vs ~0.55s
//    anonymous) purely from unconditionally rebuilding full personalization context before ever
//    checking whether cached intelligence already existed.

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
  type FavoriteDriverCard,
  type FavoriteTeamCard,
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
import { checkUserRateLimit } from "@/lib/ai/guardrails";
import { generateDeterministicFallback, type FallbackDataContext } from "@/lib/ai/fallback";
import { logAIError, logDeterministicFallback } from "@/lib/ai/telemetry";
import type { HomepageContextData } from "@/lib/ai/context";
import { stripPersonalFields, type HomepageIntelligence } from "@/lib/ai/schemas/homepageIntelligence";
import type { AgentContext } from "@/lib/ai/types";
import crypto from "crypto";

// Headroom above the provider's own 90s AbortController timeout (nemotron.ts, single attempt - see
// orchestrator.ts's own comment on why this task doesn't retry) plus our own data-fetching/
// processing overhead - Vercel's own default function duration would otherwise kill this route
// before our own timeout logic ever gets to run its course and return a clean fallback. See
// types.ts's own comment for why 90s: the real production context reliably took longer than every
// diagnostic sample measurement, so this is deliberately generous rather than tightly fit to one
// number.
export const maxDuration = 110;

type GenerationResult = { data: HomepageIntelligence; isFallback: boolean; fallbackReason?: string; cacheTier: "personal" | "global" | "global_shared" | "fresh" };

export async function POST() {
  const requestId = `req_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;

  try {
    // 1. Authenticate user via session (never trust a client-provided identity for anything below)
    const session = await getSession();
    const userId = session?.uid || null;

    // 2. Fetch deterministic GLOBAL data AND (when signed in) ONLY the two personal reads that
    // actually feed the cache key: `getUserProfile` (favorite ids) and `getUserPicksForYear` (pick
    // timestamp + prediction fingerprint). Deliberately NOT `listFeedPosts` here - see step 6's own
    // comment for why it's cache-key-irrelevant and safe to defer entirely to the miss path.
    const year = new Date().getFullYear();
    const [nextRace, races, archiveCircuits, standings, userBatch] = await Promise.all([
      getNextUpcomingRace(year).catch(() => null),
      getRacesByYear(year).catch(() => []),
      getAllArchiveCircuits().catch(() => []),
      computeSeasonStandings(year).catch(() => null),
      userId
        ? Promise.all([getUserProfile(userId).catch(() => null), getUserPicksForYear(userId, year).catch(() => [])])
        : Promise.resolve(null),
    ]);
    const raceId = nextRace?.id || `season_${year}_prep`;

    const driverLeader = standings?.drivers?.[0];
    const driverSecond = standings?.drivers?.[1];
    const driverThird = standings?.drivers?.[2];
    const constructorLeader = standings?.teams?.[0];
    const constructorSecond = standings?.teams?.[1];

    // 3. Just enough personal state to build the cache key - profile's raw favorite ID strings
    // (not the enriched "card" objects getFavoriteDriverCard/getFavoriteTeamCard build, which also
    // pull circuit stats/images and are only needed once we know generation is actually happening),
    // the user's pick, and their prediction fingerprint.
    let profile: Awaited<ReturnType<typeof getUserProfile>> = null;
    let userPick = null;
    let fingerprint = null;
    let lastHomepageVisitAt: string | null = null;

    if (userId && userBatch) {
      const [p, picks] = userBatch;
      profile = p;
      lastHomepageVisitAt = profile?.lastHomepageVisitAt ?? null;
      userPick = nextRace ? (picks.find((pick) => pick.raceId === nextRace.id) ?? null) : null;
      fingerprint = computePredictionFingerprint(picks, races, driverLeader?.driver ?? null);
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

    // 4. Compute independent GLOBAL and PERSONAL data-version hashes.
    // GLOBAL depends only on facts every visitor shares - a user's own prediction must never
    // invalidate the cache entry every other visitor reads.
    //
    // Deliberately NOT including nextRace?.updatedAt: the pipeline bumps that timestamp on every
    // single push of the race row (pipeline/fetch_races.py's race_row["updated_at"]), including
    // runs where nothing the AI actually talks about changed at all (a re-fetch that found the
    // same practice/qualifying data, a preliminary-result retry that didn't yet succeed, etc). With
    // it included, every pipeline tick during a race weekend was busting this cache early - well
    // before its real 1-hour TTL - forcing a fresh, slow (~10-90s, see nemotron.ts's own timeout)
    // model call far more often than necessary. simTop/rfTop/raceId already cover every input this
    // response's SHARED content actually depends on.
    //
    // No longer includes feedPosts.length: that count came from `listFeedPosts(userId, {feedType:
    // "following"})` - an AUTHENTICATED, PER-USER "following" feed, not a sitewide count. Folding it
    // into globalDataVersion meant two different signed-in default-state users regenerating the
    // global tier could produce two different globalCacheKey values purely from their own follow-
    // graph size - real cross-user cache fragmentation of a key that's supposed to be identical for
    // everyone. It only ever fed the `communityPulse` output field, which nothing in the UI renders
    // (CommunityPulse.tsx is not mounted anywhere) - removing it loses no real behavior and fixes
    // the fragmentation as a side effect.
    const globalDataVersion = computeDataVersion([
      raceId,
      simTop ? `${simTop.driver}:${simTop.p1}` : "",
      rfTop ? `${rfTop.driver}` : "",
    ]);
    // Deliberately NOT including sinceLastVisit?.changes.length (or anything else derived from
    // lastHomepageVisitAt): that value is a diff against the user's OWN last-visit timestamp, which
    // touchHomepageVisit() (step 9 below, and in the cache-hit/fallback paths) bumps to "now" at the
    // end of EVERY request - including this one. The very next request (e.g. an immediate hard
    // refresh) would then read a last-visit timestamp only seconds old, almost always producing
    // ZERO diff changes regardless of what the first request found, changing personalDataVersion
    // and forcing a full regeneration even though nothing about the underlying F1 data actually
    // changed. Confirmed live with the real computeSinceLastVisit/computeDataVersion functions: two
    // "requests" 5 seconds apart against identical standings produced two different hashes purely
    // because visiting moves the diff window forward. Every other component here already captures
    // the events that should genuinely invalidate personal content (a new pick, a new fingerprint
    // count, a favorite change) - and championship/rank changes coincide with raceId itself
    // changing in the normal season flow (a race completing is what advances "next race"), so
    // dropping this one volatile, self-referential signal doesn't introduce a real staleness gap.
    //
    // Uses profile's raw favorite ID strings directly (not favoriteDriverCard?.driverId /
    // favoriteTeamCard?.teamId, which are literally the same values, just wrapped in a "card" object
    // that also carries circuit stats/images this key doesn't need) - the value is identical either
    // way, but the raw ids are available right after the batch above, without waiting on
    // getFavoriteDriverCard/getFavoriteTeamCard (deferred to step 6b, after the cache check).
    //
    // Hashes the WHOLE favorites arrays (sorted, joined), not just index [0] - a real bug fix: a
    // user with multiple favorites changing/adding/removing anything past the first entry used to
    // leave this hash (and therefore the cache key) completely unchanged, silently serving AI
    // content built from the stale favorite set indefinitely.
    // The sorted joins above catch a favorite SET change (add/remove) but, being sorted, are blind
    // to a pure REORDER of the same set - concretely, toggling a favorite off then back on moves it
    // to the end of profile.favoriteDrivers/Teams (see setArchiveFavorite's own array_append-style
    // logic), changing which entry is "primary" (index [0], what personalOutlook/the deterministic
    // fallback key off) without changing the sorted string at all. Appending each array's raw (not
    // sorted) [0] separately closes that gap without losing the set-change coverage sorting gives.
    const personalDataVersion = userId
      ? computeDataVersion([
          globalDataVersion,
          userId,
          [...(profile?.favoriteDrivers ?? [])].sort().join(","),
          [...(profile?.favoriteTeams ?? [])].sort().join(","),
          [...(profile?.favoriteTracks ?? [])].sort().join(","),
          profile?.favoriteDrivers?.[0] ?? "",
          profile?.favoriteTeams?.[0] ?? "",
          userPick?.submittedAt,
          fingerprint?.totalPredictions,
        ])
      : null;

    const globalCacheKey = buildGlobalCacheKey(raceId, globalDataVersion);
    const personalCacheKey = userId && personalDataVersion ? buildPersonalCacheKey(userId, raceId, personalDataVersion) : null;

    // 5. Aggressive caching checks - personal, then global-shared for a default-state user, then
    // plain global for a guest. Same isDefaultUser signal as before, but keyed off the raw profile
    // ids (already in hand) instead of the enriched favorite-card objects, for the same reason the
    // hash above does - the truthiness is identical (a card is non-null iff a real favorite id
    // exists), so this doesn't change which tier any user lands in.
    const isDefaultUser = !profile?.favoriteDrivers?.length && !profile?.favoriteTeams?.length && !userPick && (!fingerprint || fingerprint.totalPredictions === 0);

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

    // 6. Real cache MISS confirmed - only now is it worth paying for the expensive personalization
    // enrichment (favorite driver/team "cards" with circuit stats/images, track history, and the
    // user's community feed) that a cache HIT never needed. Same circuit-name -> archive-circuit-id
    // resolution page.tsx already uses - nextRace.circuit is FastF1's raw location string
    // ("Budapest"), NOT an archive circuitId ("hungaroring").
    const circuitLocalities = new Map(archiveCircuits.filter((c) => c.locality).map((c) => [c.circuitId, c.locality as string]));
    const circuitIdsByName = new Map(archiveCircuits.filter((c) => c.name).map((c) => [c.name!.trim().toLowerCase(), c.circuitId]));
    const resolvedCircuitId = nextRace ? resolveCurrentCircuitToArchiveId(nextRace.circuit, circuitLocalities, circuitIdsByName) : null;

    let favoriteDriverCards: FavoriteDriverCard[] = [];
    let favoriteTeamCards: FavoriteTeamCard[] = [];
    let trackHistory = null;
    let feedPosts: Array<{ title?: string; groupName?: string | null; createdAt?: string }> = [];
    // Real, new signal: is the upcoming race's own circuit one of the user's favorite circuits -
    // `favoriteTracks` was previously fetched/stored but never read anywhere on the homepage.
    let isFavoriteCircuit = false;

    if (userId) {
      const driverIds = profile?.favoriteDrivers ?? [];
      const teamIds = profile?.favoriteTeams ?? [];
      isFavoriteCircuit = !!resolvedCircuitId && (profile?.favoriteTracks ?? []).includes(resolvedCircuitId);

      // 6a. ALL favorite driver/team cards (not just index [0]), track history, AND the feed - four
      // mutually-independent fetches (feed doesn't need the profile's favorite ids; track history
      // only needs resolvedCircuitId and the ids already in hand) - one batch instead of four
      // sequential awaits. Track history's own circuit-stats remain scoped to the PRIMARY (first)
      // favorite driver/team - getTrackHistory's signature is single-entity by design and isn't
      // being extended here; every OTHER favorite still gets its name/rank/points below, just not
      // this one circuit-specific stat block.
      const [driverCards, teamCards, history, feed] = await Promise.all([
        Promise.all(driverIds.map((id) => getFavoriteDriverCard(id).catch(() => null))),
        Promise.all(teamIds.map((id) => getFavoriteTeamCard(id).catch(() => null))),
        resolvedCircuitId
          ? getTrackHistory(resolvedCircuitId, {
              favoriteDriverId: driverIds[0],
              favoriteTeamId: teamIds[0],
            }).catch(() => null)
          : Promise.resolve(null),
        listFeedPosts(userId, { feedType: "following", limit: 10 }).catch(() => ({ posts: [], hasMore: false })),
      ]);
      favoriteDriverCards = driverCards.filter((c): c is FavoriteDriverCard => c !== null);
      favoriteTeamCards = teamCards.filter((c): c is FavoriteTeamCard => c !== null);
      trackHistory = history;
      feedPosts = feed.posts.map((p) => ({ title: p.title ?? undefined, groupName: p.groupName, createdAt: p.createdAt }));
    } else if (resolvedCircuitId) {
      trackHistory = await getTrackHistory(resolvedCircuitId).catch(() => null);
    }

    // The "primary" favorite - first-listed, stable (Postgres arrays + a plain field-mapper
    // preserve insertion order; nothing on this path re-sorts) - is what the deterministic
    // fallback and since-last-visit diffing still key off, matching the rest of the homepage's UI.
    const primaryDriverCard = favoriteDriverCards[0] ?? null;
    const primaryTeamCard = favoriteTeamCards[0] ?? null;
    const newCommunityPostCount = userId && lastHomepageVisitAt
      ? feedPosts.filter((p) => p.createdAt && new Date(p.createdAt).getTime() > new Date(lastHomepageVisitAt!).getTime()).length
      : 0;

    const sinceLastVisit = userId
      ? computeSinceLastVisit({
          lastVisitIso: lastHomepageVisitAt,
          races,
          currentStandings: standings ?? { drivers: [], teams: [], poleCounts: {} },
          favoriteDriverCode: primaryDriverCard?.code ?? null,
          favoriteDriverName: primaryDriverCard?.name ?? null,
          favoriteTeamName: primaryTeamCard?.currentName ?? null,
          pickSubmittedAt: userPick?.submittedAt ?? null,
          newCommunityPostCount,
        })
      : null;

    // 6b. Build the fallback context - used whether we generate fresh or fail (never on a cache hit,
    // which already returned above).
    const fallbackContext: FallbackDataContext = {
      race: nextRace ? { name: nextRace.name, round: nextRace.round, season: nextRace.year, circuitName: nextRace.circuit, city: nextRace.circuit } : null,
      standings: {
        driverLeader: driverLeader ? { name: driverLeader.driverName, points: driverLeader.points } : undefined,
        driverSecond: driverSecond ? { name: driverSecond.driverName, points: driverSecond.points } : undefined,
        constructorLeader: constructorLeader ? { name: constructorLeader.team, points: constructorLeader.points } : undefined,
      },
      trackHistory: trackHistory ? { defendingWinner: trackHistory.defendingWinner?.driverName, topPerformer: trackHistory.topPerformer?.driverName, totalRaces: trackHistory.totalRaces } : null,
      // Deterministic templates can't synthesize prose across N favorites the way free-form AI text
      // can - the fallback path deliberately stays scoped to the primary favorite only (see the
      // plan's own scope note); the real AI path's `contextData` below gets every favorite.
      favoriteDriver: primaryDriverCard
        ? {
            name: primaryDriverCard.name,
            teamName: primaryDriverCard.team || undefined,
            rank: standings ? standings.drivers.findIndex((d) => d.driver === primaryDriverCard!.code) + 1 || undefined : undefined,
            points: standings?.drivers.find((d) => d.driver === primaryDriverCard!.code)?.points,
            circuit: trackHistory?.favoriteDriverCircuitStats ?? null,
          }
        : null,
      favoriteTeam: primaryTeamCard
        ? {
            name: primaryTeamCard.name,
            rank: standings ? standings.teams.findIndex((t) => t.team === primaryTeamCard!.currentName) + 1 || undefined : undefined,
            points: standings?.teams.find((t) => t.team === primaryTeamCard!.currentName)?.points,
          }
        : null,
      favoriteCircuit: isFavoriteCircuit && nextRace ? { name: nextRace.circuit } : null,
      model: rfTopName ? { topPredictedDriver: rfTopName } : null,
      simulation: simTopName ? { topSimulatedDriver: simTopName, p1Probability: simTop?.p1 } : null,
      userPrediction: userPick ? { predictedWinner: userPick.predictedWinner || undefined, submitted: !!userPick.submittedAt } : null,
      predictionPerformance: fingerprint && fingerprint.totalPredictions > 0 ? { winnerAccuracy: fingerprint.winnerAccuracy, totalPredictions: fingerprint.totalPredictions, avgPositionError: fingerprint.avgPositionError ?? undefined } : null,
      communitySummary: feedPosts.length > 0 ? { recentPostCount: feedPosts.length, hotTopic: feedPosts[0]?.title || undefined } : null,
      sinceLastVisit,
    };

    // 7. Both checks below gate ONLY the "about to attempt real generation" path - every cache hit
    // above (step 5) already returned, so a warm cache never costs either budget. This is
    // deliberate: per-user AI generation quota (Part 19 of the AI-architecture spec) exists to stop
    // one user from repeatedly forcing real generation attempts (e.g. churning favorites to keep
    // busting personalDataVersion), not to penalize ordinary cache-hit traffic. Checked BEFORE the
    // provider bucket, and independent of it: an attempt that lands here counts against this user's
    // budget whether or not the provider itself happens to also be saturated right now - otherwise a
    // user could fire unlimited attempts for free during any window the provider bucket is full and
    // have them all succeed in a burst the moment it frees up.
    if (userId) {
      const userLimit = checkUserRateLimit(userId);
      if (!userLimit.allowed) {
        const fallback = generateDeterministicFallback(fallbackContext, "USER_RATE_LIMITED");
        await touchHomepageVisit(userId).catch(() => {});
        return NextResponse.json({ data: fallback.data, cached: false, isFallback: true, fallbackReason: "USER_RATE_LIMITED", retryAfterSeconds: userLimit.retryAfterSeconds, dataVersion: personalDataVersion ?? globalDataVersion });
      }
    }

    // Provider RPM Capacity (global 40 RPM ceiling, shared across all users) - a separate concern
    // from the per-user budget above: this protects Groq's own quota from the aggregate of every
    // user's traffic, not any one user's behavior.
    const capacity = checkProviderCapacity("groq");
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
      // ALL favorites, not just the primary - lets the model genuinely synthesize across multiple
      // drivers/teams (see homepagePrompt.ts's new prioritization rule) rather than only ever
      // knowing about one. Circuit-specific stats stay attached to the primary entry only (index 0)
      // since getTrackHistory itself only ever resolves stats for one driver/team id at a time.
      favoriteDrivers: favoriteDriverCards.map((card, i) => ({
        name: card.name,
        teamName: card.team || undefined,
        rank: standings ? standings.drivers.findIndex((d) => d.driver === card.code) + 1 || undefined : undefined,
        points: standings?.drivers.find((d) => d.driver === card.code)?.points,
        circuit:
          i === 0 && trackHistory?.favoriteDriverCircuitStats
            ? {
                appearances: trackHistory.favoriteDriverCircuitStats.appearances,
                wins: trackHistory.favoriteDriverCircuitStats.wins,
                podiums: trackHistory.favoriteDriverCircuitStats.podiums,
                bestFinish: trackHistory.favoriteDriverCircuitStats.bestFinish,
                avgFinish: trackHistory.favoriteDriverCircuitStats.avgFinish,
              }
            : null,
      })),
      favoriteTeams: favoriteTeamCards.map((card, i) => ({
        name: card.name,
        rank: standings ? standings.teams.findIndex((t) => t.team === card.currentName) + 1 || undefined : undefined,
        points: standings?.teams.find((t) => t.team === card.currentName)?.points,
        circuit:
          i === 0 && trackHistory?.favoriteTeamCircuitStats
            ? { appearances: trackHistory.favoriteTeamCircuitStats.appearances, wins: trackHistory.favoriteTeamCircuitStats.wins, podiums: trackHistory.favoriteTeamCircuitStats.podiums, bestFinish: trackHistory.favoriteTeamCircuitStats.bestFinish }
            : null,
      })),
      favoriteCircuit: isFavoriteCircuit && nextRace ? { isFavorite: true, name: nextRace.circuit } : null,
      userPrediction: userPick ? { predictedWinner: userPick.predictedWinner || undefined, submitted: !!userPick.submittedAt } : null,
      predictionFingerprint: fingerprint && fingerprint.totalPredictions > 0 ? fingerprint : null,
      sinceLastVisit,
    };

    const agentContext: AgentContext = { userId, requestId, agentType: "homepage_intelligence", raceId };
    const generationKey = personalCacheKey ?? globalCacheKey;

    const output = await withSingleFlight(generationKey, () => generateHomepageIntelligence(contextData, agentContext, personalDataVersion ?? globalDataVersion));

    // 9. Cache the result. The global slice must never carry THIS user's personal content - any
    // other guest/default-state user can read globalCacheKey (see step 5), so it gets a stripped
    // copy with every personal-only field nulled out (their already-optional shape, per the schema)
    // rather than the raw model output, which still contains this user's favorite/pick/coach text
    // whenever they had any personal context at generation time.
    if (!output.isFallback) {
      await setCachedIntelligence(globalCacheKey, stripPersonalFields(output.data), globalDataVersion, DEFAULT_GLOBAL_TTL_SECONDS, { model: output.modelIdentifier, promptVersion: output.promptVersion, requestId });
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
