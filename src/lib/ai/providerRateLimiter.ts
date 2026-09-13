// Provider-level rate limiter — enforces strict RPM ceiling across the application.
// Specifically addresses NVIDIA's 40 RPM quota on the configured model, ensuring that concurrent requests
// across users or homepage loads do NOT exceed provider capacity.
//
// If the provider limit is reached, callers receive { allowed: false } and immediately fall back
// to deterministic content without failing or throwing 500 errors.

import { getProviderRPMLimit, type ProviderCapacityStatus } from "./types";

export { getProviderRPMLimit };

interface ProviderBucket {
  timestamps: number[];
}

const buckets = new Map<string, ProviderBucket>();
const WINDOW_MS = 60_000; // 1 minute sliding window

function getBucket(provider: string): ProviderBucket {
  let bucket = buckets.get(provider);
  if (!bucket) {
    bucket = { timestamps: [] };
    buckets.set(provider, bucket);
  }
  return bucket;
}

/** Clean up timestamps older than 60 seconds from the window. */
function pruneBucket(bucket: ProviderBucket, now: number): void {
  const cutoff = now - WINDOW_MS;
  // Binary search or filter — array length is small (<= 40)
  while (bucket.timestamps.length > 0 && bucket.timestamps[0] <= cutoff) {
    bucket.timestamps.shift();
  }
}

/**
 * Check if the provider has remaining RPM capacity without consuming a token.
 */
export function checkProviderCapacity(provider = "nvidia"): ProviderCapacityStatus {
  const now = Date.now();
  const limit = getProviderRPMLimit();
  const bucket = getBucket(provider);
  pruneBucket(bucket, now);

  const currentRPM = bucket.timestamps.length;
  const allowed = currentRPM < limit;

  let retryAfterSeconds = 0;
  if (!allowed && bucket.timestamps.length > 0) {
    const oldestTimestamp = bucket.timestamps[0];
    const msUntilExpiry = oldestTimestamp + WINDOW_MS - now;
    retryAfterSeconds = Math.max(1, Math.ceil(msUntilExpiry / 1000));
  }

  return {
    allowed,
    currentRPM,
    limit,
    retryAfterSeconds,
  };
}

/**
 * Acquire provider capacity for 1 request. If capacity is available, records the timestamp
 * and returns allowed: true. If capacity is exhausted, returns allowed: false without recording.
 */
export function acquireProviderCapacity(provider = "nvidia"): ProviderCapacityStatus {
  const now = Date.now();
  const limit = getProviderRPMLimit();
  const bucket = getBucket(provider);
  pruneBucket(bucket, now);

  const currentRPM = bucket.timestamps.length;
  if (currentRPM >= limit) {
    const oldestTimestamp = bucket.timestamps[0];
    const msUntilExpiry = oldestTimestamp + WINDOW_MS - now;
    const retryAfterSeconds = Math.max(1, Math.ceil(msUntilExpiry / 1000));
    return {
      allowed: false,
      currentRPM,
      limit,
      retryAfterSeconds,
    };
  }

  // Consume capacity
  bucket.timestamps.push(now);

  return {
    allowed: true,
    currentRPM: bucket.timestamps.length,
    limit,
    retryAfterSeconds: 0,
  };
}

/**
 * Get current rolling RPM for the provider.
 */
export function getProviderRPM(provider = "nvidia"): number {
  const now = Date.now();
  const bucket = getBucket(provider);
  pruneBucket(bucket, now);
  return bucket.timestamps.length;
}

/**
 * Reset provider rate limiter (primarily for unit tests).
 */
export function resetProviderRateLimiter(provider?: string): void {
  if (provider) {
    buckets.delete(provider);
  } else {
    buckets.clear();
  }
}
