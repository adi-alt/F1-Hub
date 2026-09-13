import { getRacesByCircuit, getRacesByYear } from "@/lib/supabase/races";

export async function getCircuitsIndexData(year: number) {
  const races = await getRacesByYear(year);
  return { races };
}

/** Returns null when there's no record of this circuit at all — the page turns that into
 * notFound() rather than this layer knowing about Next's navigation APIs. */
export async function getCircuitDetailData(circuit: string) {
  const races = await getRacesByCircuit(circuit);
  if (races.length === 0) return null;

  const completed = races.filter((r) => r.status === "completed" && r.poleTimeSec !== undefined);
  const trend = completed
    .map((r) => ({ year: r.year, poleTimeSec: r.poleTimeSec as number }))
    .sort((a, b) => a.year - b.year);
  const avgPole = trend.length ? trend.reduce((sum, d) => sum + d.poleTimeSec, 0) / trend.length : null;

  return { races, completed, trend, avgPole };
}
