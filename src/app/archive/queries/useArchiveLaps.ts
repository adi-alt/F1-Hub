import { useQuery } from "@tanstack/react-query";
import type { ArchiveLapEntry } from "@/lib/firestore/archive";

async function fetchLaps(year: number, round: number): Promise<ArchiveLapEntry[]> {
  const res = await fetch(`/api/archive/laps?year=${year}&round=${round}`);
  if (!res.ok) throw new Error(`${res.status}`);
  const body = (await res.json()) as { laps: ArchiveLapEntry[] };
  return body.laps;
}

/** `enabled` stays false until the user actually clicks "Show lap chart" (LapChart.tsx) — lap
 * data is the one thing in archive that's expensive enough to not fetch until someone asks
 * for it (see pipeline/enrich_archive_laps.py's docstring: ~1,300 rows for a single race). */
export function useArchiveLaps(year: number, round: number, enabled: boolean) {
  return useQuery({
    queryKey: ["archive-laps", year, round],
    queryFn: () => fetchLaps(year, round),
    enabled,
    staleTime: Infinity,
  });
}
