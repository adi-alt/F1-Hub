// Server-side AI Caching Layer — Two-Tier Architecture (Global vs Personal).
// Prevents unnecessary calls to NVIDIA and guarantees sub-100ms response times for repeat visits.
// Stores in Supabase `ai_cache` table with an in-memory L1 cache for instant retrieval.

import { supabaseAdmin } from "@/lib/supabase/admin";
import { logCacheEvent, logAIError } from "./telemetry";
import crypto from "crypto";

interface CacheEntry<T> {
  value: T;
  dataVersion: string;
  expiresAt: number; // Unix ms
  modelIdentifier?: string;
  promptVersion?: string;
}

// In-memory L1 cache (works even without Supabase migration)
const memoryCache = new Map<string, CacheEntry<unknown>>();

// Default TTLs (in seconds)
export const DEFAULT_GLOBAL_TTL_SECONDS = 3600; // 1 hour
export const DEFAULT_PERSONAL_TTL_SECONDS = 1800; // 30 minutes

/**
 * Builds a deterministic hash string from data components to detect data changes.
 */
export function computeDataVersion(components: (string | number | null | undefined)[]): string {
  const normalized = components.map((c) => (c === undefined || c === null ? "" : String(c))).join("|");
  return crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}

export function buildGlobalCacheKey(raceId: string, dataVersion: string): string {
  return `ai:global:${raceId}:${dataVersion}`;
}

export function buildPersonalCacheKey(userId: string, raceId: string, dataVersion: string): string {
  return `ai:personal:${userId}:${raceId}:${dataVersion}`;
}

// ─── Race Intelligence cache keys ──────────────────────────────────────────────
// Bump either version constant whenever raceContext.ts's shape or raceIntelligencePrompt.ts's
// expectations change - old cached entries under the previous version simply become unreachable
// (a new key), never silently served as if generated under the new logic.
export const RACE_CONTEXT_VERSION = "ctx-v1";
export const RACE_PROMPT_VERSION = "prompt-v1";

// A cached entry's own generationMode travels WITH the content, not as a separate uncached
// response field - a cache hit must always report the exact mode that produced that exact content
// (a stale cached fallback must never be relabeled "ai" just because the provider is healthy again
// on a later request). Asymmetric TTL (see setCachedRaceEntry below) is what keeps a cached
// fallback from lingering: it expires fast, so the next request gets a fresh real attempt instead.
export interface CachedRaceEntry<T> {
  content: T;
  generationMode: "ai" | "deterministic";
  generatedAt: string;
}

const RACE_FALLBACK_TTL_SECONDS = 120;
const RACE_REAL_TTL_SECONDS = 60 * 60 * 24 * 30; // a completed race's facts never change again - long, not infinite, so a genuinely stuck entry still eventually clears

/** dataVersion = a hash of resultsSource + dataCompletenessHash (computeDataVersion() below is
 * reused for this) - included on BOTH the shared and personal keys, not just shared: a personal
 * insight generated while a race's data was still incomplete must not silently survive that race
 * later being upgraded to a fuller/official dataset while the shared cache correctly busts. */
export function buildSharedRaceCacheKey(raceId: string, dataVersion: string): string {
  return `ai:race:shared:${raceId}:${dataVersion}:${RACE_CONTEXT_VERSION}:${RACE_PROMPT_VERSION}`;
}

export function buildPersonalRaceCacheKey(raceId: string, userId: string, favoriteDriverId: string | null, favoriteTeamId: string | null, dataVersion: string): string {
  return `ai:race:personal:${raceId}:${userId}:${favoriteDriverId ?? "-"}:${favoriteTeamId ?? "-"}:${dataVersion}:${RACE_CONTEXT_VERSION}:${RACE_PROMPT_VERSION}`;
}

/** Same read path as getCachedIntelligence (L1 memory then Supabase ai_cache), but returns the
 * whole {content, generationMode, generatedAt} envelope instead of a bare value. */
export async function getCachedRaceEntry<T>(cacheKey: string, requestId = "cache_lookup"): Promise<CachedRaceEntry<T> | null> {
  return getCachedIntelligence<CachedRaceEntry<T>>(cacheKey, requestId);
}

/** Fallback entries get a short TTL (2 minutes) so the request right after a provider recovers
 * gets a fresh real attempt, rather than being stuck behind a long TTL meant for real content -
 * the homepage avoids this by never caching a fallback at all, but that means re-running the whole
 * context-check/attempt on every single request during an outage; a short-lived cached fallback is
 * the better trade here now that mode travels with content instead of being a separate field. */
export async function setCachedRaceEntry<T>(cacheKey: string, content: T, generationMode: "ai" | "deterministic", dataVersion: string, metadata?: { model?: string; promptVersion?: string; requestId?: string }): Promise<void> {
  const entry: CachedRaceEntry<T> = { content, generationMode, generatedAt: new Date().toISOString() };
  const ttl = generationMode === "ai" ? RACE_REAL_TTL_SECONDS : RACE_FALLBACK_TTL_SECONDS;
  await setCachedIntelligence(cacheKey, entry, dataVersion, ttl, metadata);
}

/**
 * Retrieve cached intelligence from L1 memory or Supabase ai_cache table.
 */
export async function getCachedIntelligence<T>(
  cacheKey: string,
  requestId = "cache_lookup",
): Promise<T | null> {
  const now = Date.now();

  // 1. Check L1 memory cache
  const mem = memoryCache.get(cacheKey);
  if (mem) {
    if (mem.expiresAt > now) {
      logCacheEvent(requestId, cacheKey.startsWith("ai:global") ? "hit_global" : "hit_personal", cacheKey);
      return mem.value as T;
    }
    memoryCache.delete(cacheKey);
  }

  // 2. Check Supabase ai_cache table
  try {
    const { data, error } = await supabaseAdmin
      .from("ai_cache")
      .select("value, expires_at")
      .eq("key", cacheKey)
      .single();

    if (error || !data) {
      logCacheEvent(requestId, "miss", cacheKey);
      return null;
    }

    const expiresAt = new Date(data.expires_at).getTime();
    if (expiresAt <= now) {
      logCacheEvent(requestId, "expired", cacheKey);
      return null;
    }

    // Populate L1 cache
    memoryCache.set(cacheKey, {
      value: data.value,
      dataVersion: "",
      expiresAt,
    });

    logCacheEvent(requestId, cacheKey.startsWith("ai:global") ? "hit_global" : "hit_personal", cacheKey);
    return data.value as T;
  } catch (err) {
    logAIError(requestId, "cache_read_error", String(err));
    return null;
  }
}

/**
 * Store intelligence in both L1 memory cache and Supabase ai_cache table.
 */
export async function setCachedIntelligence<T>(
  cacheKey: string,
  value: T,
  dataVersion: string,
  ttlSeconds: number,
  metadata?: { model?: string; promptVersion?: string; requestId?: string },
): Promise<void> {
  const now = Date.now();
  const expiresAtMs = now + ttlSeconds * 1000;
  const expiresAtDate = new Date(expiresAtMs).toISOString();

  // 1. Write to L1 memory cache
  memoryCache.set(cacheKey, {
    value,
    dataVersion,
    expiresAt: expiresAtMs,
    modelIdentifier: metadata?.model,
    promptVersion: metadata?.promptVersion,
  });

  logCacheEvent(metadata?.requestId || "cache_write", "write", cacheKey);

  // 2. Write to Supabase ai_cache table
  try {
    await supabaseAdmin.from("ai_cache").upsert(
      {
        key: cacheKey,
        value: value as Record<string, unknown>,
        data_version: dataVersion,
        model_identifier: metadata?.model || null,
        prompt_version: metadata?.promptVersion || null,
        created_at: new Date(now).toISOString(),
        expires_at: expiresAtDate,
      },
      { onConflict: "key" },
    );
  } catch (err) {
    // Non-fatal if Supabase table is not yet migrated — L1 cache still functions
    logAIError(metadata?.requestId || "cache_write", "cache_write_error", String(err));
  }
}

/** Clear L1 cache (useful for tests) */
export function resetMemoryCache(): void {
  memoryCache.clear();
}

// ─── Single-flight generation lock ─────────────────────────────────────────────
// Prevents a cache-miss "stampede": if N concurrent requests miss the same cache key at once
// (the realistic case - many users load the homepage in the same few seconds right after a race
// weekend goes live), only the FIRST caller actually generates the value; every other caller
// awaits that same in-flight promise instead of independently calling the model N times.
//
// Known limitation, documented rather than silently assumed away: this map is process-local. On
// Vercel's serverless model, concurrent requests can land on different warm/cold Lambda instances,
// each with its own map - so this collapses a stampede *within one instance*, not a strict
// distributed single-flight across every instance. A real distributed lock would need a shared
// primitive (a Postgres advisory lock, a Redis SETNX) this app doesn't have yet; the 40 RPM
// provider-capacity ceiling (providerRateLimiter.ts) is the actual cross-instance backstop that
// keeps a genuine multi-instance stampede from ever reaching NVIDIA's real rate limit.
const inFlight = new Map<string, Promise<unknown>>();

/** Runs `generate()` for `key`, but coalesces concurrent callers onto the same in-flight promise -
 * see the module comment above for what this does and doesn't guarantee. */
export async function withSingleFlight<T>(key: string, generate: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key);
  if (existing) return existing as Promise<T>;

  const promise = generate().finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, promise);
  return promise;
}
