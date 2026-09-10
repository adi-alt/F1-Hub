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
import { ALL_CONTEXT_SOURCES, buildRaceIntelligenceContext, hasPersonalContext, type ContextSource, type RaceIntelligenceContext } from "@/lib/ai/context/raceContext";
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
  // Archive races live in a completely separate table (different id scheme, no
  // tireCompoundPace/safetyCarPeriods/trafficStats, no this-season short codes) - archiveContext.ts
  // builds the exact same RaceIntelligenceContext shape from it, so everything past this dispatch
  // (schema/prompt/orchestrator/cache/UI) is identical either way. Archive is looked up by
  // year+round (its own real getArchiveRace signature), not the opaque `raceId` - `raceId` is only
  // used below for cache-key uniqueness, which archive_races.id already provides.
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
    let dataVersionSeed: string;
    if (isArchive) {
      const archiveRace = await getArchiveRace(archiveYear, archiveRound);
      if (!archiveRace) return NextResponse.json({ error: "Race not found" }, { status: 404 });
      context = await buildArchiveIntelligenceContext(archiveYear, archiveRound, userId ?? undefined);
      // Archive rows are immutable once backfilled - no preliminary/official upgrade path a live
      // race has, so dataCoverage is the only real signal that can ever change this key.
      dataVersionSeed = computeDataVersion([raceId, JSON.stringify(context.dataCoverage)]);
    } else {
      const race = await getRaceById(raceId);
      if (!race) return NextResponse.json({ error: "Race not found" }, { status: 404 });
      if (race.status !== "completed") return NextResponse.json({ error: "Race not completed yet" }, { status: 400 });
      context = await buildRaceIntelligenceContext(raceId, userId ?? undefined);
      // Data version - a completed race's underlying facts don't change again once official, so
      // this is what actually invalidates a cache entry (see cache.ts's own comment), not a timer.
      // Real signal, not a guess: results_source/data_completeness are exactly the two fields the
      // pipeline itself writes when a race is upgraded (e.g. openf1_preliminary -> official).
      dataVersionSeed = computeDataVersion([raceId, race.updatedAt, JSON.stringify(context.dataCoverage)]);
    }
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
    const personalFacts = wantsPersonal
      ? {
          driver: context.evidenceFacts.find((f) => f.id === "favorite-driver-result")?.fact ?? null,
          team: context.evidenceFacts.find((f) => f.id === "favorite-team-result")?.fact ?? null,
        }
      : null;

    const dataVersion = dataVersionSeed;
    const sharedCacheKey = buildSharedRaceCacheKey(raceId, dataVersion);
    const personalCacheKey = wantsPersonal
      ? buildPersonalRaceCacheKey(raceId, userId!, context.favoriteDriver?.driverId ?? null, context.favoriteTeam?.teamId ?? null, dataVersion)
      : null;

    let sharedEntry = await getCachedRaceEntry<SharedRaceIntelligence>(sharedCacheKey, requestId);
    let personalEntry = personalCacheKey ? await getCachedRaceEntry<PersonalRaceInsight | null>(personalCacheKey, requestId) : null;

    const needShared = !sharedEntry;
    const needPersonal = wantsPersonal && !personalEntry;

    if (needShared || needPersonal) {
      const capacity = checkProviderCapacity("groq");
      if (!capacity.allowed && !sharedEntry) {
        // No shared cache to fall back to and the provider is over capacity - deterministic shared
        // content only, same "never leave the page with nothing" guarantee the homepage route has.
        return NextResponse.json({
          shared: { content: generateDeterministicRaceFallback(context).shared, generationMode: "deterministic", generatedAt: new Date().toISOString() },
          personal: null,
          dataCoverage: context.dataCoverage,
          evidenceFactCounts,
          personalFacts,
        });
      }

      const agentContext: AgentContext = { userId, requestId, agentType: "race_intelligence", raceId };
      const generationKey = needShared ? sharedCacheKey : personalCacheKey!;

      const result = await withSingleFlight(generationKey, () =>
        generateRaceIntelligence(context, agentContext, {
          needShared,
          needPersonal,
          existingSharedHeadline: sharedEntry?.content.headline,
        }),
      );

      if (result.shared) {
        await setCachedRaceEntry(sharedCacheKey, result.shared.data, result.shared.generationMode, dataVersion, { requestId, promptVersion: "race_v1" });
        sharedEntry = { content: result.shared.data, generationMode: result.shared.generationMode, generatedAt: new Date().toISOString() };
      }
      if (personalCacheKey && result.personal) {
        await setCachedRaceEntry(personalCacheKey, result.personal.data, result.personal.generationMode, dataVersion, { requestId, promptVersion: "race_v1" });
        personalEntry = { content: result.personal.data, generationMode: result.personal.generationMode, generatedAt: new Date().toISOString() };
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
