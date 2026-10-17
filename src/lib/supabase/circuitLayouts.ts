import { unstable_cache } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { queryWithRetry } from "@/lib/supabase/queryWithRetry";
import { chooseLayout, displayLayout, latestLayout, layoutToDrawing, parseLayout, type CircuitDrawing, type CircuitLayout } from "@/lib/circuitLayout";

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

/** Every layout of a circuit (all seasons, drawn and measured), for the circuit page's history. Never throws. */
export async function getCircuitLayouts({ circuitId, circuitName }: { circuitId: string | null; circuitName: string | null }): Promise<CircuitLayout[]> {
  try {
    return await cachedLayouts(circuitId, circuitName);
  } catch (e) {
    console.warn(e instanceof Error ? e.message : e);
    return [];
  }
}

/** Every circuit's own drawing, keyed by archive circuit id: its most recent usual layout (a variant named for one
 * race never stands in). One read of the whole track library (~200 layouts, cached), for the places that show many
 * circuits at once - the archive's circuit grid - instead of a query per card. */
export const getCircuitDrawingsById = unstable_cache(
  async (): Promise<Record<string, CircuitDrawing>> => {
    const { data, error } = await queryWithRetry(() => supabaseAdmin.from("circuit_layouts").select("layout_id, circuit_id, seasons, race_name_match, source, geometry, attribution").range(0, 999));
    if (error) throw new Error(`circuit drawings: ${error.message}`);
    const byCircuit = new Map<string, CircuitLayout[]>();
    for (const row of (data ?? []) as Record<string, unknown>[]) {
      const layout = parseLayout(row);
      const id = row.circuit_id as string | null;
      if (layout && id) byCircuit.set(id, [...(byCircuit.get(id) ?? []), layout]);
    }
    const out: Record<string, CircuitDrawing> = {};
    for (const [id, layouts] of byCircuit) {
      const layout = latestLayout(layouts, 0);
      if (layout) out[id] = layoutToDrawing(layout);
    }
    return out;
  },
  ["get-circuit-drawings-by-id-v1"],
  { revalidate: false, tags: ["races"] },
);

/** The bulk drawings, or an empty map when the library can't be read: a grid then shows its other imagery. */
export async function safeCircuitDrawingsById(): Promise<Record<string, CircuitDrawing>> {
  try {
    return await getCircuitDrawingsById();
  } catch (e) {
    console.warn(e instanceof Error ? e.message : e);
    return {};
  }
}

/** One circuit's drawing for a given season and race, chosen as the circuits pages choose theirs (displayLayout):
 * that race's layout, else the circuit as last raced. Null when the library has nothing for it. Never throws. */
export async function getCircuitDrawing(args: { circuitId: string | null; circuitName: string | null; year: number; raceName: string }): Promise<CircuitDrawing | null> {
  const layout = displayLayout(await getCircuitLayouts(args), args.year, args.raceName);
  return layout ? layoutToDrawing(layout) : null;
}
