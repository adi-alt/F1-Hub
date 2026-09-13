import { useQuery } from "@tanstack/react-query";
import { archiveKeys } from "../_queries/archiveKeys";
import { fetchArchiveTeams } from "../_service/archiveTeams.client";
import type { ArchiveTeam } from "@/lib/supabase/archive";

/** useArchiveDrivers' sibling - see its own comment for the enabled/staleTime/initialData
 * reasoning, identical here for the 171-row team list. */
export function useArchiveTeams(enabled: boolean, initialTeams?: ArchiveTeam[]) {
  return useQuery({
    queryKey: archiveKeys.teams(),
    queryFn: fetchArchiveTeams,
    enabled,
    initialData: initialTeams,
    staleTime: Infinity,
  });
}
