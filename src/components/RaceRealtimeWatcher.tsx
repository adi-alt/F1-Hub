"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

/**
 * Renders nothing — pure side effect. Subscribes to `races` table changes and refreshes this
 * page's server-rendered data the moment the pipeline writes something new (qualifying landing,
 * results landing, a prediction freezing), instead of waiting for a manual reload or the next
 * 300s ISR window. Every pipeline write that matters upserts the whole `races` row (see
 * fetch_races.py/train_predict.py), so subscribing to just this one table is enough signal — no
 * separate race_results/race_inputs channels needed.
 *
 * `router.refresh()` alone isn't enough on its own: getRace/getRacesByYear/getNextUpcomingRace
 * are wrapped in `unstable_cache` with a 300s revalidate window, so a refresh before that window
 * naturally elapses would just re-serve the same stale cached value. What actually busts it is
 * the pipeline's own `trigger_revalidation("races")` call (see ergast_utils.py) hitting
 * /api/admin/revalidate right after it writes — this subscription exists to notice that happened
 * and pull the now-fresh data in, not to force freshness by itself.
 *
 * `raceId` narrows to one race (the race detail page); omit it to watch every row (the home
 * page, where "the next upcoming race" can itself change identity once the current one completes).
 */
export function RaceRealtimeWatcher({ raceId }: { raceId?: string }) {
  const router = useRouter();

  useEffect(() => {
    const channel = supabase
      .channel(raceId ? `race-${raceId}` : "races-all")
      .on(
        "postgres_changes",
        raceId
          ? { event: "*", schema: "public", table: "races", filter: `id=eq.${raceId}` }
          : { event: "*", schema: "public", table: "races" },
        () => router.refresh(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [raceId, router]);

  return null;
}
