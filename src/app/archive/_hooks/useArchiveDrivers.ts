import { useQuery } from "@tanstack/react-query";
import { archiveKeys } from "../_queries/archiveKeys";
import { fetchArchiveDrivers } from "../_service/archiveDrivers.client";
import type { ArchiveDriver } from "@/lib/supabase/archive";

/** `enabled` stays false until the user actually switches to "By driver" - the 805-row list is
 * dead weight on every other facet's load, previously fetched server-side unconditionally. Once
 * fetched, `staleTime: Infinity` means switching away and back is instant (React Query still
 * serves the cached result even while `enabled` is false again - `enabled` only gates *automatic*
 * fetching, not reading already-cached data), so this only ever costs one real request per
 * session. `initialDrivers` comes from the server when `?section=driver` was the page's own
 * initial facet - the exact same real data this query would fetch, avoiding a redundant round trip
 * for the single most common way to land on this tab. */
export function useArchiveDrivers(enabled: boolean, initialDrivers?: ArchiveDriver[]) {
  return useQuery({
    queryKey: archiveKeys.drivers(),
    queryFn: fetchArchiveDrivers,
    enabled,
    initialData: initialDrivers,
    staleTime: Infinity,
  });
}
