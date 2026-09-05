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
