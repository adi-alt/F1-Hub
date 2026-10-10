import { unstable_cache } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { queryWithRetry } from "@/lib/supabase/queryWithRetry";
import { chooseLayout, parseLayout, type CircuitLayout } from "@/lib/circuitLayout";

// A circuit's layouts, by archive circuit id and/or a races.circuit spelling (its aliases): a current-season
// race page knows the latter, an archive one the former. Throws on a query error so a failure is never cached.
const cachedLayouts = unstable_cache(
  async (circuitId: string | null, circuitName: string | null): Promise<CircuitLayout[]> => {
    // Two parameterised queries, not one .or() string: a circuit name with a comma or parenthesis must not be
    // read as filter syntax (audit SEC-21's lesson).
    const columns = "layout_id, seasons, race_name_match, source, geometry, attribution";
    const queries = [
      circuitId ? queryWithRetry(() => supabaseAdmin.from("circuit_layouts").select(columns).eq("circuit_id", circuitId)) : null,
      circuitName ? queryWithRetry(() => supabaseAdmin.from("circuit_layouts").select(columns).contains("aliases", [circuitName])) : null,
    ].filter((q) => q !== null);
    const rows = new Map<string, Record<string, unknown>>();
    for (const { data, error } of await Promise.all(queries)) {
      if (error) throw new Error(`circuit layouts (${circuitId}, ${circuitName}): ${error.message}`);
      for (const row of (data ?? []) as Record<string, unknown>[]) rows.set(String(row.layout_id), row);
    }
    return [...rows.values()].map(parseLayout).filter((l): l is CircuitLayout => l !== null);
  },
  ["get-circuit-layouts-v1"],
  { revalidate: false, tags: ["races"] },
);

/** The layout this race was run on, from the track library, or null: no layout for its circuit and season, or no
 * library yet (before its migration). Never throws - the storyline falls back to its route. */
export async function getRaceLayout({
  circuitId,
  circuitName,
  year,
  raceName,
}: {
  circuitId: string | null;
  circuitName: string | null;
  year: number;
  raceName: string;
}): Promise<CircuitLayout | null> {
  try {
    return chooseLayout(await cachedLayouts(circuitId, circuitName), year, raceName);
  } catch (e) {
    console.warn(e instanceof Error ? e.message : e);
    return null;
  }
}
