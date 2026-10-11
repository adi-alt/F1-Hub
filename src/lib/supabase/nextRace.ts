import { getAllArchiveCircuits } from "@/lib/supabase/archive";
import { getRacesByYear } from "@/lib/supabase/races";
import { resolveCurrentCircuitToArchiveId } from "@/lib/circuitSlug";
import { getRecentCircuitPhotos } from "@/lib/personalization";
import { getCurrentSeason } from "@/lib/currentSeason";

/** The next race on the real calendar, plus the extra real fields a context rail renders: its own
 * country (for the flag), a real photo, and its circuit (which is what Apex's own circuit take is
 * keyed by - see RaceWeekendTake). */
export type NextRaceSummary = {
  year: number;
  round: number;
  name: string;
  raceDate: string | null;
  country: string | null;
  circuit: string | null;
  photoUrl: string | null;
} | null;

/**
 * Lives here rather than inside one page because two surfaces now render it: the Communities index
 * rail and a single community's own rail. Previously it was a private helper in
 * app/groups/page.tsx, which a second caller could only have reached by importing a page module or
 * by copying the photo-fallback chain - and a copied fallback chain is exactly how the two would
 * have drifted apart.
 *
 * The photo is the round's own pipeline photo, else the most recent photo of a past race at the
 * same circuit (resolved through resolveCurrentCircuitToArchiveId). Never the archive circuit's
 * Commons category photo (often not the track at all): with no race photo the widget degrades to
 * its plain header, rather than to a stand-in.
 */
export async function getNextRace(races?: Awaited<ReturnType<typeof getRacesByYear>>): Promise<NextRaceSummary> {
  const all = races ?? (await getRacesByYear(await getCurrentSeason()));
  const upcoming = all.filter((r) => r.status !== "completed").sort((a, b) => a.round - b.round)[0];
  if (!upcoming) return null;

  let photoUrl = upcoming.photoUrls?.[0] ?? upcoming.photoUrl ?? null;
  if (!photoUrl && upcoming.circuit) {
    const archiveCircuits = await getAllArchiveCircuits();
    const localities = new Map(archiveCircuits.filter((c) => c.locality).map((c) => [c.circuitId, c.locality as string]));
    const idsByName = new Map(archiveCircuits.filter((c) => c.name).map((c) => [c.name!.trim().toLowerCase(), c.circuitId]));
    const archiveId = resolveCurrentCircuitToArchiveId(upcoming.circuit, localities, idsByName);
    // Photos of past races AT this circuit - the same real source the homepage's rotating backdrop
    // draws on. Sorted ascending by year, so the last entry is the most recent one.
    const recent = await getRecentCircuitPhotos(archiveId, upcoming.circuit, upcoming.year);
    photoUrl = recent.at(-1)?.url ?? null;
  }

  return {
    year: upcoming.year,
    round: upcoming.round,
    name: upcoming.name,
    raceDate: upcoming.raceDate ?? null,
    country: upcoming.country ?? null,
    circuit: upcoming.circuit ?? null,
    photoUrl,
  };
}
