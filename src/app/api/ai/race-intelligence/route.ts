// POST /api/ai/race-intelligence?raceId=...
// Race Intelligence - same reliability machinery the homepage route already proved (guardrails,
// two-tier caching, single-flight, deterministic fallback), applied to one completed race.
//
// Real fix this route embodies (see pipeline/OPENF1_FALLBACK.md's own sibling doc,
// src/lib/ai/context/raceContext.ts's docstring): weather/tireStints were always visible to the
// app, but tireCompoundPace/safetyCarPeriods/trafficStats were fetched over the wire and silently
// dropped before this feature existed - RaceIntelligenceContext is the first thing that actually
// uses them.

import { NextResponse } from "next/server";
import crypto from "crypto";
import { getSession } from "@/lib/session/getSession";
import { getRaceById } from "@/lib/supabase/races";
import { getArchiveRace } from "@/lib/supabase/archive";
import { ALL_CONTEXT_SOURCES, buildRaceIntelligenceContext, hasPersonalContext, toSharedRaceContext, type ContextSource, type RaceIntelligenceContext } from "@/lib/ai/context/raceContext";
import { buildArchiveIntelligenceContext } from "@/lib/ai/context/archiveContext";
import { generateRaceIntelligence } from "@/lib/ai/orchestrator";
import {
  buildPersonalRaceCacheKey,
  buildSharedRaceCacheKey,
  computeDataVersion,
  getCachedRaceEntry,
  setCachedRaceEntry,
  withSingleFlight,
  type CachedRaceEntry,
} from "@/lib/ai/cache";
import { checkProviderCapacity } from "@/lib/ai/providerRateLimiter";
import { checkUserRateLimit } from "@/lib/ai/guardrails";
import { generateDeterministicRaceFallback } from "@/lib/ai/fallback";
import type { PersonalRaceInsight, SharedRaceIntelligence } from "@/lib/ai/schemas/raceIntelligence";
import type { AgentContext } from "@/lib/ai/types";
import { logAIError } from "@/lib/ai/telemetry";

export const maxDuration = 110; // same headroom reasoning as homepage-intelligence/route.ts

export async function POST(request: Request) {
  const requestId = `req_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const { searchParams } = new URL(request.url);
  const raceId = searchParams.get("raceId");
  if (!raceId) return NextResponse.json({ error: "Missing raceId" }, { status: 400 });
  // Archive races live in a completely separate table (same `{year}_r{round}_{slug}` id scheme, but
  // no tireCompoundPace/safetyCarPeriods/trafficStats, no this-season short codes) - archiveContext.ts
  // builds the exact same RaceIntelligenceContext shape from it, so everything past this dispatch
  // (schema/prompt/orchestrator/cache/UI) is identical either way. Archive is looked up by
  // year+round (its own real getArchiveRace signature); the client's `raceId` must name that same
  // row (checked below) and is never itself trusted as the cache identity.
  const isArchive = searchParams.get("source") === "archive";
  const archiveYear = Number(searchParams.get("year"));
  const archiveRound = Number(searchParams.get("round"));
  if (isArchive && (Number.isNaN(archiveYear) || Number.isNaN(archiveRound))) {
    return NextResponse.json({ error: "Missing year/round for archive source" }, { status: 400 });
  }

  try {
    const session = await getSession();
    const userId = session?.uid || null;

    let context: RaceIntelligenceContext;
    // The cache identity comes from the server's own row, never from the request (audit AI-03: the
    // archive path used to key the cache on the client's `raceId` while building the content from
    // year/round, so any caller could file one race's analysis under another race's key - including
    // a live race's, since archive and live ids share one scheme for 2018-2025).
    let cacheRaceId: string;
    let versionParts: (string | number | null | undefined)[];
    if (isArchive) {
      const archiveRace = await getArchiveRace(archiveYear, archiveRound);
      if (!archiveRace) return NextResponse.json({ error: "Race not found" }, { status: 404 });
      if (archiveRace.id !== raceId) return NextResponse.json({ error: "raceId does not match year/round" }, { status: 400 });
      context = await buildArchiveIntelligenceContext(archiveYear, archiveRound, userId ?? undefined);
      // Separate namespace from live races (same id scheme, different context builder). Archive rows
      // are immutable once backfilled - no preliminary/official upgrade path a live race has, so
      // dataCoverage is the only real signal that can ever change this key.
      cacheRaceId = `archive_${archiveRace.id}`;
      versionParts = [cacheRaceId];
    } else {
      const race = await getRaceById(raceId);
      if (!race) return NextResponse.json({ error: "Race not found" }, { status: 404 });
      if (race.status !== "completed") return NextResponse.json({ error: "Race not completed yet" }, { status: 400 });
      context = await buildRaceIntelligenceContext(race.id, userId ?? undefined);
      // Data version - a completed race's underlying facts don't change again once official, so
      // this is what actually invalidates a cache entry (see cache.ts's own comment), not a timer.
      // Real signal, not a guess: results_source/data_completeness are exactly the two fields the
      // pipeline itself writes when a race is upgraded (e.g. openf1_preliminary -> official).
      cacheRaceId = race.id;
      versionParts = [race.id, race.updatedAt];
    }
    // What the shared analysis is generated from, validated against and versioned by - nothing about
    // the requesting user (toSharedRaceContext; audit AI-02/AI-08). Versioned by the SHARED coverage
    // only: the favourite flags used to give each user with favourites their own "shared" entry.
    const sharedContext = toSharedRaceContext(context);
    const wantsPersonal = !!userId && hasPersonalContext(context);

    // "Behind This Analysis" panel material - real, deterministic, recomputed fresh every request
    // (never written into either cache entry, so it's never stale and never crosses users).
    const evidenceFactCounts = Object.fromEntries(
      ALL_CONTEXT_SOURCES.map((s) => [s, context.evidenceFacts.filter((f) => f.source === s).length]),
    ) as Record<ContextSource, number>;
    // The two pre-formatted fact strings personalization already produced (see raceContext.ts) -
    // "your driver finished P4" / "your team scored..." - real deterministic facts for Your
    // Perspective's stat block. No "your prediction vs. outcome" field: no per-user race prediction
    // exists in this context, so it's left out rather than fabricated.
    // Evidence-fact ids are now suffixed per favorite (favorite-driver-result-{driverId}, see
    // raceContext.ts) since there can be more than one - this stat block stays scoped to the
    // primary (first) favorite's fact, matching a prefix rather than the old exact id.
    const personalFacts = wantsPersonal
      ? {
          driver: context.evidenceFacts.find((f) => f.id.startsWith("favorite-driver-result"))?.fact ?? null,
          team: context.evidenceFacts.find((f) => f.id.startsWith("favorite-team-result"))?.fact ?? null,
        }
      : null;

    const dataVersion = computeDataVersion([...versionParts, JSON.stringify(sharedContext.dataCoverage)]);
    const sharedCacheKey = buildSharedRaceCacheKey(cacheRaceId, dataVersion);
    // Hashes ALL favorite ids (sorted/joined), not just the primary - a 2nd/3rd favorite changing
    // must still bust this cache (same fix as the homepage route's personalDataVersion).
    const personalCacheKey = wantsPersonal
      ? buildPersonalRaceCacheKey(
          cacheRaceId,
          userId!,
          context.favoriteDrivers.map((d) => d.driverId).sort().join(",") || null,
          context.favoriteTeams.map((t) => t.teamId).sort().join(",") || null,
          dataVersion,
        )
      : null;

    let sharedEntry = await getCachedRaceEntry<SharedRaceIntelligence>(sharedCacheKey, requestId);
    let personalEntry = personalCacheKey ? await getCachedRaceEntry<PersonalRaceInsight | null>(personalCacheKey, requestId) : null;

    const needShared = !sharedEntry;
    const needPersonal = wantsPersonal && !personalEntry;

    if (needShared || needPersonal) {
      // Both checks gate ONLY the "about to attempt real generation" path - a shared or personal
      // cache hit already returned above, so neither budget is ever touched by cache-hit traffic
      // (see homepage-intelligence/route.ts's identical placement + reasoning). Per-user budget is
      // checked independent of the provider bucket below, deliberately: this stops one user from
      // repeatedly forcing personal-miss generation attempts (e.g. favorite/team churn) regardless
      // of whether the shared provider bucket happens to also be saturated right now.
      if (userId) {
        const userLimit = checkUserRateLimit(userId);
        if (!userLimit.allowed) {
          return NextResponse.json({ error: "Rate limited", reason: "USER_RATE_LIMITED", retryAfterSeconds: userLimit.retryAfterSeconds }, { status: 429 });
        }
      }

      const capacity = checkProviderCapacity("groq");
      if (!capacity.allowed && !sharedEntry) {
        // No shared cache to fall back to and the provider is over capacity - deterministic shared
        // content only, same "never leave the page with nothing" guarantee the homepage route has.
        return NextResponse.json({
          shared: { content: generateDeterministicRaceFallback(sharedContext).shared, generationMode: "deterministic", generatedAt: new Date().toISOString() },
          personal: null,
          dataCoverage: context.dataCoverage,
          evidenceFactCounts,
          personalFacts,
        });
      }

      const agentContext: AgentContext = { userId, requestId, agentType: "race_intelligence", raceId: cacheRaceId, dataVersion };

      // Two separate generations, each single-flighted on - and written to - its own key only:
      // - SHARED from sharedContext, on sharedCacheKey. Every concurrent visitor of a cold race can
      //   safely join this one flight, because nothing in it belongs to anyone in particular.
      // - PERSONAL from the full context, on this user's personalCacheKey, so two users never collapse
      //   into one lock and receive each other's insight (the earlier single-flight leak; see
      //   raceIntelligenceIsolation.test.ts).
      // They used to be one combined call whose shared half had seen this user's favourites. A cold
      // visit by a signed-in user with favourites now costs two calls instead of one; the shared one
      // is then cached for everyone.
      if (needShared) {
        const result = await withSingleFlight(sharedCacheKey, () =>
          generateRaceIntelligence(sharedContext, agentContext, { needShared: true, needPersonal: false }),
        );
        if (result.shared) {
          await setCachedRaceEntry(sharedCacheKey, result.shared.data, result.shared.generationMode, dataVersion, { requestId, promptVersion: "race_v1" });
          sharedEntry = { content: result.shared.data, generationMode: result.shared.generationMode, generatedAt: new Date().toISOString() };
        }
      }
      if (needPersonal && personalCacheKey) {
        const result = await withSingleFlight(personalCacheKey, () =>
          generateRaceIntelligence(context, agentContext, { needShared: false, needPersonal: true, existingSharedHeadline: sharedEntry?.content.headline }),
        );
        if (result.personal) {
          await setCachedRaceEntry(personalCacheKey, result.personal.data, result.personal.generationMode, dataVersion, { requestId, promptVersion: "race_v1" });
          personalEntry = { content: result.personal.data, generationMode: result.personal.generationMode, generatedAt: new Date().toISOString() };
        }
      }
    }

    return NextResponse.json({
      shared: sharedEntry,
      personal: wantsPersonal ? personalEntry : null,
      dataCoverage: context.dataCoverage,
      evidenceFactCounts,
      personalFacts,
    });
  } catch (err) {
    logAIError(requestId, "race_intelligence_route_exception", String(err));
    return NextResponse.json({ error: "Failed to generate race intelligence" }, { status: 500 });
  }
}

export type RaceIntelligenceResponse = {
  shared: CachedRaceEntry<SharedRaceIntelligence> | null;
  personal: CachedRaceEntry<PersonalRaceInsight | null> | null;
  dataCoverage: Record<ContextSource, boolean>;
  evidenceFactCounts: Record<ContextSource, number>;
  personalFacts: { driver: string | null; team: string | null } | null;
};
