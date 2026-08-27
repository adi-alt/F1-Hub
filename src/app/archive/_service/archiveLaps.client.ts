import type { ArchiveLapEntry } from "@/lib/supabase/archive";

/** Client-side fetch wrapper around /api/archive/laps — used only by useArchiveLaps (_hooks), kept
 * as its own file so the hook doesn't also have to own the fetch/response-shaping details. */
export async function fetchArchiveLaps(year: number, round: number): Promise<ArchiveLapEntry[]> {
  const res = await fetch(`/api/archive/laps?year=${year}&round=${round}`);
  if (!res.ok) throw new Error(`${res.status}`);
  const body = (await res.json()) as { laps: ArchiveLapEntry[] };
  return body.laps;
}
