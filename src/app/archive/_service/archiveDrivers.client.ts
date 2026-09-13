import type { ArchiveDriver } from "@/lib/supabase/archive";

/** Client-side fetch wrapper around /api/archive/drivers - used only by useArchiveDrivers
 * (_hooks), kept as its own file the same way archiveLaps.client.ts is. */
export async function fetchArchiveDrivers(): Promise<ArchiveDriver[]> {
  const res = await fetch("/api/archive/drivers");
  if (!res.ok) throw new Error(`${res.status}`);
  const body = (await res.json()) as { drivers: ArchiveDriver[] };
  return body.drivers;
}
