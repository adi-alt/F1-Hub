"use client";

import { useQuery } from "@tanstack/react-query";
import type { RaceLapEntry } from "@/lib/supabase/races";

async function fetchSeasonLaps(year: number, round: number): Promise<RaceLapEntry[]> {
  const res = await fetch(`/api/season/laps?year=${year}&round=${round}`);
  if (!res.ok) throw new Error(`${res.status}`);
  const body = (await res.json()) as { laps: RaceLapEntry[] };
  return body.laps;
}

/** Season's equivalent of Archive's useArchiveLaps - same on-demand, fetch-once shape
 * (`staleTime: Infinity`), own API route/table (race_laps, not archive_laps) since the two sides
 * are written by separate pipeline scripts (fetch_races.py vs enrich_archive_laps.py). */
export function useSeasonLaps(year: number, round: number) {
  return useQuery({
    queryKey: ["season-laps", year, round],
    queryFn: () => fetchSeasonLaps(year, round),
    staleTime: Infinity,
  });
}
