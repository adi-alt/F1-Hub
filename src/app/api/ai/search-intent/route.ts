import { NextResponse } from "next/server";
import crypto from "crypto";
import { getSession } from "@/lib/session/getSession";
import { limitRequest } from "@/lib/rateLimit";
import { guardAIExecution, sanitizePromptInput } from "@/lib/ai/guardrails";
import { chatWithProviderFallback } from "@/lib/ai/providerFallback";
import { getCachedIntelligence, setCachedIntelligence, withSingleFlight } from "@/lib/ai/cache";
import { logAIError } from "@/lib/ai/telemetry";
import { entityResults, filterRaces, interpretSearchIntent, resolveEntities, SEARCH_INTENT_VERSION, type SearchIntent } from "@/lib/ai/searchIntent";
import { getAllArchiveCircuits, getAllArchiveDrivers, getAllArchiveTeams, getArchiveEntityRaces, getArchiveRacesByCircuitId } from "@/lib/supabase/archive";
import { normalise } from "@/lib/searchQuery";

export const maxDuration = 20;

const MAX_QUERY_LENGTH = 120;
/** A reading of a query doesn't change with the data: cached a day, shared (the query is all that goes in). */
const CACHE_TTL_SECONDS = 24 * 3600;
const AI_DEADLINE_MS = (maxDuration - 5) * 1000;

/**
 * POST /api/ai/search-intent { query } - the command palette's natural-language navigation, for queries the cheap
 * parser couldn't place. The model reads the query into filters (lib/ai/searchIntent); the races and entities come
 * from the archive. Behind the same guard as every AI route; a refusal answers { results: [], unavailable }.
 */
export async function POST(request: Request) {
  const requestId = `req_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const limited = await limitRequest(request, "search", session.uid);
  if (limited) return limited;

  const body = (await request.json().catch(() => null)) as { query?: unknown } | null;
  const query = typeof body?.query === "string" ? sanitizePromptInput(body.query.trim(), MAX_QUERY_LENGTH) : "";
  if (query.length < 4) return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });

  const cacheKey = `ai:global:${SEARCH_INTENT_VERSION}:${normalise(query)}`;
  let intent = await getCachedIntelligence<SearchIntent | { none: true }>(cacheKey, requestId);
  if (!intent) {
    const guard = await guardAIExecution(session.uid, request);
    if (!guard.allowed) return NextResponse.json({ results: [], unavailable: guard.reason, retryAfterSeconds: guard.retryAfterSeconds });
    try {
      intent = await withSingleFlight(cacheKey, async () => {
        const read = await interpretSearchIntent(query, async (messages) => {
          const result = await chatWithProviderFallback(messages, null, { maxTokens: 600, temperature: 0, reasoningEffort: "low", deadlineAt: Date.now() + AI_DEADLINE_MS }, requestId);
          return result.response.content ?? "";
        });
        const value = read ?? { none: true as const };
        await setCachedIntelligence(cacheKey, value, SEARCH_INTENT_VERSION, CACHE_TTL_SECONDS, { promptVersion: SEARCH_INTENT_VERSION, requestId });
        return value;
      });
    } catch (err) {
      logAIError(requestId, "search_intent_failed", String(err));
      return NextResponse.json({ results: [], unavailable: "PROVIDER_ERROR" });
    }
  }
  if ("none" in intent) return NextResponse.json({ results: [] });

  const [drivers, teams, circuits] = await Promise.all([getAllArchiveDrivers().catch(() => []), getAllArchiveTeams().catch(() => []), getAllArchiveCircuits().catch(() => [])]);
  const entities = resolveEntities(intent, { drivers, teams, circuits });
  if (intent.kind === "entity") return NextResponse.json({ results: entityResults(entities) });

  // The narrowest real race set the filters name: the driver's races, else the team's, else the circuit's.
  const races = entities.driver
    ? await getArchiveEntityRaces("driver", entities.driver.driverId).catch(() => [])
    : entities.team
      ? await getArchiveEntityRaces("team", entities.team.teamId).catch(() => [])
      : entities.circuit
        ? await getArchiveRacesByCircuitId(entities.circuit.circuitId).catch(() => [])
        : [];
  return NextResponse.json({ results: filterRaces(intent, entities, races) }, { headers: { "Cache-Control": "private, no-store" } });
}
