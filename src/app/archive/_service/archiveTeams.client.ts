import type { ArchiveTeam } from "@/lib/supabase/archive";

/** Client-side fetch wrapper around /api/archive/teams - used only by useArchiveTeams (_hooks),
 * kept as its own file the same way archiveLaps.client.ts is. */
export async function fetchArchiveTeams(): Promise<ArchiveTeam[]> {
  const res = await fetch("/api/archive/teams");
  if (!res.ok) throw new Error(`${res.status}`);
  const body = (await res.json()) as { teams: ArchiveTeam[] };
  return body.teams;
}
