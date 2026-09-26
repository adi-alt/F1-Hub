// Server-only (Supabase + the personalization/picks data layers) - the race page's own "your
// briefing" card is built here, from the SAME sources the homepage's own personalization already
// trusts (getFavoriteDriverCard/getFavoriteTeamCard, getUserPicksForYear, computePredictionPerformance)
// rather than a second, parallel personalization system.

import { getUserProfile } from "@/lib/supabase/users";
import { getUserPicksForYear } from "@/lib/supabase/picks";
import { getFavoriteDriverCard, getFavoriteTeamCard } from "@/lib/personalization";
import { computePredictionPerformance } from "@/lib/predictionPerformance";
import type { CircuitYearRecord } from "@/lib/circuitIntelligence";
import type { RaceDoc, UserPick } from "@/lib/types/race";

export type PersonalRaceContext = {
  favoriteDriver: { name: string; winsHere: number } | null;
  favoriteTeam: { name: string; winsHere: number } | null;
  /** This circuit's own subset of the user's real prediction history - never the user's
   * season-wide accuracy mislabeled as circuit-specific. Null with zero completed picks at this
   * circuit (not a fabricated 0/0). */
  accuracy: { correct: number; total: number } | null;
  /** No favorites AND no prediction history anywhere (not just at this circuit) - the genuine
   * "never used this feature at all" case, which gets a useful first-time prompt instead of an
   * empty personalization card. */
  isFirstTime: boolean;
};

/** A favorite's real win count at this circuit - archive-direct id match for any year (every
 * current driver has an archive_drivers row too, so this isn't "old years only"), plus a
 * this-season code match for a live year archiveIdFor lookups elsewhere in this app resolve
 * separately - kept simple here on purpose: a code match against a real, current 3-letter code is
 * unambiguous for "did MY favorite (whose current code I already know) win this recent race",
 * unlike resolving an arbitrary historical code back to an id (see getArchiveDriverIdsByCode's own
 * collision warning, which doesn't apply to this specific, narrower direction). */
function winsAtCircuit(timeline: CircuitYearRecord[], archiveId: string, currentCode: string | null): number {
  return timeline.filter((r) => r.winnerArchiveDriverId === archiveId || (currentCode !== null && r.winnerCode === currentCode)).length;
}

function teamWinsAtCircuit(timeline: CircuitYearRecord[], teamNames: string[]): number {
  const normalized = new Set(teamNames.filter(Boolean).map((n) => n.toLowerCase()));
  return timeline.filter((r) => r.winnerTeam && normalized.has(r.winnerTeam.toLowerCase())).length;
}

export async function getPersonalRaceContext(uid: string, circuitTimeline: CircuitYearRecord[], circuitLiveRaces: RaceDoc[]): Promise<PersonalRaceContext> {
  const profile = await getUserProfile(uid).catch(() => null);
  const favoriteDriverId = profile?.favoriteDrivers?.[0] ?? null;
  const favoriteTeamId = profile?.favoriteTeams?.[0] ?? null;

  const [favoriteDriverCard, favoriteTeamCard] = await Promise.all([
    favoriteDriverId ? getFavoriteDriverCard(favoriteDriverId).catch(() => null) : Promise.resolve(null),
    favoriteTeamId ? getFavoriteTeamCard(favoriteTeamId).catch(() => null) : Promise.resolve(null),
  ]);

  const favoriteDriver = favoriteDriverCard ? { name: favoriteDriverCard.name, winsHere: winsAtCircuit(circuitTimeline, favoriteDriverCard.driverId, favoriteDriverCard.code) } : null;
  const favoriteTeam = favoriteTeamCard
    ? { name: favoriteTeamCard.name, winsHere: teamWinsAtCircuit(circuitTimeline, [favoriteTeamCard.currentName ?? favoriteTeamCard.name, favoriteTeamCard.name]) }
    : null;

  // Every distinct season this circuit's live races span, so accuracy is computed from real picks
  // across the circuit's whole live-era history, not just the current year.
  const years = [...new Set(circuitLiveRaces.map((r) => r.year))];
  const picksByYear = await Promise.all(years.map((y) => getUserPicksForYear(uid, y).catch(() => [] as UserPick[])));
  const allPicks = picksByYear.flat();
  const circuitRaceIds = new Set(circuitLiveRaces.map((r) => r.id));
  const circuitPicks = allPicks.filter((p) => circuitRaceIds.has(p.raceId));
  const performance = circuitPicks.length ? computePredictionPerformance(circuitPicks, circuitLiveRaces) : null;
  const accuracy = performance && performance.winner.total > 0 ? { correct: performance.winner.correct, total: performance.winner.total } : null;

  const isFirstTime = !favoriteDriver && !favoriteTeam && allPicks.length === 0;

  return { favoriteDriver, favoriteTeam, accuracy, isFirstTime };
}
