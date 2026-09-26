// Server-only (calls Supabase through archive.ts) - never imported by TrackIntelligence.tsx or
// any other client component, the same "keep circuitIntelligence.ts dependency-free" boundary that
// file's own top comment already establishes. This is what sits on the OTHER side of that
// boundary: the one place real driver birthdates get resolved and turned into real ages.

import { getArchiveDriverDatesOfBirth, getArchiveDriverIdsByCode } from "@/lib/supabase/archive";
import type { CircuitYearRecord } from "@/lib/circuitIntelligence";

export type AgeRecord = { driver: string; age: number; year: number };

export type AgeRecords = {
  youngestWinner: AgeRecord | null;
  oldestWinner: AgeRecord | null;
  youngestPoleSitter: AgeRecord | null;
  oldestPoleSitter: AgeRecord | null;
};

/** Age in whole years on a specific date - not "race year minus birth year", which is off by up
 * to a full year in either direction for anyone born after the race's own month/day. Both inputs
 * are real ISO dates (archive_drivers.date_of_birth, and the race's own raceDateIso), never
 * approximated. */
function ageAt(dobIso: string, raceDateIso: string): number {
  const dob = new Date(dobIso);
  const raceDate = new Date(raceDateIso);
  let age = raceDate.getUTCFullYear() - dob.getUTCFullYear();
  const hadBirthdayByRaceDay = raceDate.getUTCMonth() > dob.getUTCMonth() || (raceDate.getUTCMonth() === dob.getUTCMonth() && raceDate.getUTCDate() >= dob.getUTCDate());
  if (!hadBirthdayByRaceDay) age -= 1;
  return age;
}

/**
 * Youngest/oldest winner and pole-sitter at this circuit, from real birthdates - never a
 * fabricated or estimated age. Two real gaps mean a year is silently excluded rather than guessed:
 * no recorded race date for that year (raceDateIso null - a genuine data gap in older archive
 * rows), or no birthdate this app can resolve for that driver (either the archive doesn't have one
 * yet, enrich_archive_driver_media.py hasn't backfilled that era, or - only for a live-schema year
 * - the winner's 3-letter code couldn't be resolved to an archive_drivers id at all).
 *
 * Never resolves a live year's code by guessing - it goes through getArchiveDriverIdsByCode, the
 * one place this app already trusts to pick the CORRECT driver for a code that isn't globally
 * unique across F1 history (see that function's own comment: "VER" is both Max Verstappen and
 * Jean-Éric Vergne). An archive-sourced year never needs that lookup at all - it already carries
 * its own unambiguous archive_drivers id directly (winnerArchiveDriverId / poleArchiveDriverId).
 */
export async function computeAgeRecords(timeline: CircuitYearRecord[]): Promise<AgeRecords> {
  const withWinner = timeline.filter((r): r is CircuitYearRecord & { winnerDriver: string; raceDateIso: string } => !!r.winnerDriver && !!r.raceDateIso);
  const withPole = timeline.filter((r): r is CircuitYearRecord & { poleSitter: string; raceDateIso: string } => !!r.poleSitter && !!r.raceDateIso);

  const winnerCodesNeedingLookup = [...new Set(withWinner.filter((r) => !r.winnerArchiveDriverId && r.winnerCode).map((r) => r.winnerCode as string))];
  const poleCodesNeedingLookup = [...new Set(withPole.filter((r) => !r.poleArchiveDriverId && r.poleCode).map((r) => r.poleCode as string))];
  const codesNeedingLookup = [...new Set([...winnerCodesNeedingLookup, ...poleCodesNeedingLookup])];
  const resolvedIds = codesNeedingLookup.length ? await getArchiveDriverIdsByCode(codesNeedingLookup) : new Map<string, string>();

  const winnerIdFor = (r: CircuitYearRecord) => r.winnerArchiveDriverId ?? (r.winnerCode ? (resolvedIds.get(r.winnerCode) ?? null) : null);
  const poleIdFor = (r: CircuitYearRecord) => r.poleArchiveDriverId ?? (r.poleCode ? (resolvedIds.get(r.poleCode) ?? null) : null);

  const allIds = [...new Set([...withWinner.map(winnerIdFor), ...withPole.map(poleIdFor)].filter((id): id is string => !!id))];
  const dobById = allIds.length ? await getArchiveDriverDatesOfBirth(allIds) : new Map<string, string | null>();

  const winnerAges: AgeRecord[] = [];
  for (const r of withWinner) {
    const dob = dobById.get(winnerIdFor(r) ?? "");
    if (!dob) continue;
    winnerAges.push({ driver: r.winnerDriver, age: ageAt(dob, r.raceDateIso), year: r.year });
  }
  const poleAges: AgeRecord[] = [];
  for (const r of withPole) {
    const dob = dobById.get(poleIdFor(r) ?? "");
    if (!dob) continue;
    poleAges.push({ driver: r.poleSitter, age: ageAt(dob, r.raceDateIso), year: r.year });
  }

  const youngest = (ages: AgeRecord[]): AgeRecord | null => (ages.length ? ages.reduce((a, b) => (b.age < a.age ? b : a)) : null);
  const oldest = (ages: AgeRecord[]): AgeRecord | null => (ages.length ? ages.reduce((a, b) => (b.age > a.age ? b : a)) : null);

  return {
    youngestWinner: youngest(winnerAges),
    oldestWinner: oldest(winnerAges),
    youngestPoleSitter: youngest(poleAges),
    oldestPoleSitter: oldest(poleAges),
  };
}
