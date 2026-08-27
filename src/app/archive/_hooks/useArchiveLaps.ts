import { useQuery } from "@tanstack/react-query";
import { archiveKeys } from "../_queries/archiveKeys";
import { fetchArchiveLaps } from "../_service/archiveLaps.client";

/** `enabled` stays false until the user actually clicks "Show lap chart" (LapChart.tsx) — lap
 * data is the one thing in archive that's expensive enough to not fetch until someone asks
 * for it (see pipeline/enrich_archive_laps.py's docstring: ~1,300 rows for a single race). */
export function useArchiveLaps(year: number, round: number, enabled: boolean) {
  return useQuery({
    queryKey: archiveKeys.laps(year, round),
    queryFn: () => fetchArchiveLaps(year, round),
    enabled,
    staleTime: Infinity,
  });
}
