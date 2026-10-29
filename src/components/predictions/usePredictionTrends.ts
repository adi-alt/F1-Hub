"use client";

import { useEffect, useState } from "react";
import type { PredictionTrend } from "@/lib/groupPredictionTypes";

/** The batch endpoint's own cap (MAX_TREND_BATCH): more ids than this go in further requests. */
const BATCH = 50;

/**
 * The community trend for every round on screen, in one request per 50 rounds
 * (GET /api/predictions/trends) instead of one per card. Rounds nobody has entered are skipped -
 * their trend is known to be empty. Returns an id → trend map that fills in when the request lands;
 * a failed request leaves it empty, and the cards simply show no shares.
 */
export function usePredictionTrends(
  rounds: readonly { id: string; entryCount: number }[],
  initialTrends?: Record<string, PredictionTrend>,
): Record<string, PredictionTrend> {
  const [trends, setTrends] = useState<Record<string, PredictionTrend>>(initialTrends ?? {});
  // A stable key, so a re-render with the same rounds doesn't refetch.
  const key = rounds
    .filter((r) => r.entryCount > 0)
    .map((r) => r.id)
    .sort()
    .join(",");

  useEffect(() => {
    if (!key) return;
    const ids = key.split(",");
    if (initialTrends && ids.every((id) => Object.prototype.hasOwnProperty.call(initialTrends, id))) return;
    const controller = new AbortController();
    const batches: string[][] = [];
    for (let i = 0; i < ids.length; i += BATCH) batches.push(ids.slice(i, i + BATCH));
    Promise.all(
      batches.map((batch) =>
        fetch(`/api/predictions/trends?ids=${batch.map(encodeURIComponent).join(",")}`, { signal: controller.signal })
          .then((res) => (res.ok ? (res.json() as Promise<{ trends: Record<string, PredictionTrend> }>) : { trends: {} }))
          .then((body) => body.trends),
      ),
    )
      .then((parts) => setTrends((prev) => Object.assign({}, prev, ...parts)))
      .catch(() => {});
    return () => controller.abort();
  }, [key, initialTrends]);

  return initialTrends ? { ...initialTrends, ...trends } : trends;
}
