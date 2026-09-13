import { useQuery } from "@tanstack/react-query";
import { archiveKeys } from "../_queries/archiveKeys";
import { fetchArchiveLaps } from "../_service/archiveLaps.client";

/** Race Analysis (LapChart.tsx) renders its chart by default, so this fetches as soon as the race
 * page mounts - `staleTime: Infinity` still means a race's ~1,300 lap rows (see
 * pipeline/enrich_archive_laps.py) are only ever fetched once per session, not re-fetched on
 * every render. */
export function useArchiveLaps(year: number, round: number) {
  return useQuery({
    queryKey: archiveKeys.laps(year, round),
    queryFn: () => fetchArchiveLaps(year, round),
    staleTime: Infinity,
  });
}
