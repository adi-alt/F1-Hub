import type { ArchiveRaceDoc } from "@/lib/supabase/archive";

export type ArchiveDriverStandingRow = { driverId: string; driverName: string; team: string; points: number; wins: number; podiums: number };
// teamId is nullable - archive_results.team_id is only populated once enrich_archive_entities.py
// has reached that row (same gap ArchiveTeamTable's own favorite column already lives with) - a
// constructor with no enriched row yet just can't be favorited from this table until it has.
export type ArchiveConstructorStandingRow = { team: string; teamId: string | null; points: number; wins: number; podiums: number };

/** computeStandings' (src/lib/standings.ts) own reduction, adapted to Archive's field names
 * (driverName/constructor/position vs driver/team/finishPosition) - kept as its own pure file, not
 * inside src/lib/supabase/archive.ts, on purpose: that file imports supabaseAdmin, and this needs
 * to be safely importable from a client component (the Archive year page's Championship table)
 * without pulling that whole server-only module graph into the browser bundle - the exact bug
 * fixed twice already this session for the same "pure function living in the wrong file" shape. */
export function computeArchiveStandings(races: ArchiveRaceDoc[]): { drivers: ArchiveDriverStandingRow[]; constructors: ArchiveConstructorStandingRow[] } {
  const drivers = new Map<string, ArchiveDriverStandingRow>();
  const constructors = new Map<string, ArchiveConstructorStandingRow>();

  for (const race of races) {
    for (const r of race.results) {
      const driver = drivers.get(r.driverId) ?? { driverId: r.driverId, driverName: r.driverName, team: r.constructor, points: 0, wins: 0, podiums: 0 };
      driver.team = r.constructor; // keep the most recent team (a mid-season driver swap is rare but real)
      driver.points += r.points;
      if (r.position === 1) driver.wins += 1;
      if (r.position <= 3) driver.podiums += 1;
      drivers.set(r.driverId, driver);

      const constructor = constructors.get(r.constructor) ?? { team: r.constructor, teamId: null, points: 0, wins: 0, podiums: 0 };
      if (r.teamId) constructor.teamId = r.teamId;
      constructor.points += r.points;
      if (r.position === 1) constructor.wins += 1;
      if (r.position <= 3) constructor.podiums += 1;
      constructors.set(r.constructor, constructor);
    }
  }

  return {
    drivers: [...drivers.values()].sort((a, b) => b.points - a.points || b.wins - a.wins),
    constructors: [...constructors.values()].sort((a, b) => b.points - a.points || b.wins - a.wins),
  };
}
