// Deterministic "Since Last Visit" diff engine.
// Every entry here is a real, computed delta between the user's previous homepage visit
// (profiles.last_homepage_visit_at, read BEFORE this request updates it) and the current state -
// Kimi only summarizes *why* the changes matter, it never invents which changes happened. A user's
// first-ever visit (lastVisitIso === null) returns hasPriorVisit: false rather than a fabricated
// "nothing changed" - there is genuinely no prior state to diff against.

import type { DriverStanding, SeasonStandings } from "@/lib/personalization";
import type { RaceDoc } from "@/lib/types/race";

export type SinceLastVisitChangeType = "DRIVER" | "TEAM" | "CHAMPIONSHIP" | "PREDICTION" | "COMMUNITY";
export type SinceLastVisitChange = { type: SinceLastVisitChangeType; title: string; explanation: string };
export type SinceLastVisitDiff = { hasPriorVisit: boolean; changes: SinceLastVisitChange[] };

/** Standings restricted to races whose result had actually been written by `cutoffIso` - the same
 * reduction computeSeasonStandings does, just time-scoped, so "what did the table look like at the
 * user's last visit" is a real historical reconstruction from race_results, not a stored snapshot.
 *
 * Filters on `updatedAt` (races.updated_at - always populated, real pipeline-write timestamp), not
 * `raceDate`: confirmed live that getRacesByYear's own row mapper (toRaceDoc in races.ts) never
 * maps race_date onto RaceDoc.raceDate at all (only a separate, unrelated calendar-row helper
 * does) - every RaceDoc from the real data path had raceDate === undefined, which silently
 * filtered every race out of the "prior" snapshot and made every second visit look like the
 * entire season had just happened. updatedAt is also arguably the more correct field anyway: what
 * changed the standings is when the result was WRITTEN, not the calendar date of the race. */
function standingsAsOf(races: RaceDoc[], cutoffIso: string): SeasonStandings {
  const cutoff = new Date(cutoffIso).getTime();
  const driverMap = new Map<string, DriverStanding>();
  const teamMap = new Map<string, number>();

  for (const race of races) {
    if (race.status !== "completed" || !race.updatedAt) continue;
    if (new Date(race.updatedAt).getTime() > cutoff) continue;
    for (const r of race.results ?? []) {
      const d = driverMap.get(r.driver) ?? { driver: r.driver, driverName: r.driverName, team: r.team, points: 0, wins: 0, podiums: 0 };
      d.points += r.points;
      d.team = r.team;
      if (r.finishPosition === 1) d.wins += 1;
      if (r.finishPosition <= 3) d.podiums += 1;
      driverMap.set(r.driver, d);
      teamMap.set(r.team, (teamMap.get(r.team) ?? 0) + r.points);
    }
  }

  return {
    drivers: [...driverMap.values()].sort((a, b) => b.points - a.points),
    teams: [...teamMap.entries()].map(([team, points]) => ({ team, points })).sort((a, b) => b.points - a.points),
    poleCounts: {},
  };
}

const MAX_CHANGES = 4;

export function computeSinceLastVisit(params: {
  lastVisitIso: string | null;
  races: RaceDoc[];
  currentStandings: SeasonStandings;
  favoriteDriverCode?: string | null;
  favoriteDriverName?: string | null;
  favoriteTeamName?: string | null;
  /** The user's own pick submittedAt for the currently open race, if any - only counted as a real
   * change when it falls after lastVisitIso (they made it since we last saw them). */
  pickSubmittedAt?: string | null;
  /** Count of the user's community feed posts created after lastVisitIso - a real number, not an
   * estimate; see route.ts's own feedPosts fetch. */
  newCommunityPostCount?: number;
}): SinceLastVisitDiff {
  const { lastVisitIso, races, currentStandings } = params;
  if (!lastVisitIso) return { hasPriorVisit: false, changes: [] };

  const prior = standingsAsOf(races, lastVisitIso);
  const changes: SinceLastVisitChange[] = [];

  // Championship leader change (global, not favorite-specific)
  const priorLeader = prior.drivers[0];
  const currentLeader = currentStandings.drivers[0];
  if (currentLeader && (!priorLeader || priorLeader.driver !== currentLeader.driver)) {
    changes.push({
      type: "CHAMPIONSHIP",
      title: `${currentLeader.driverName} is now the championship leader`,
      explanation: priorLeader
        ? `${currentLeader.driverName} overtook ${priorLeader.driverName} at the top of the drivers' standings.`
        : `${currentLeader.driverName} took the championship lead.`,
    });
  } else if (currentLeader && priorLeader) {
    const priorGap = prior.drivers[1] ? priorLeader.points - prior.drivers[1].points : 0;
    const currentGap = currentStandings.drivers[1] ? currentLeader.points - currentStandings.drivers[1].points : 0;
    if (currentGap !== priorGap && currentStandings.drivers.some((d) => prior.drivers.every((pd) => pd.points !== d.points))) {
      changes.push({
        type: "CHAMPIONSHIP",
        title: currentGap > priorGap ? `${currentLeader.driverName} extended the championship lead` : `The championship gap narrowed`,
        explanation: `The gap to P2 moved from ${priorGap} to ${currentGap} points.`,
      });
    }
  }

  // Favorite driver rank/points change
  if (params.favoriteDriverCode) {
    const priorRank = prior.drivers.findIndex((d) => d.driver === params.favoriteDriverCode);
    const currentRank = currentStandings.drivers.findIndex((d) => d.driver === params.favoriteDriverCode);
    const name = params.favoriteDriverName ?? "Your driver";
    if (currentRank >= 0 && priorRank !== currentRank) {
      changes.push({
        type: "DRIVER",
        title: `${name} moved to P${currentRank + 1}`,
        explanation:
          priorRank >= 0
            ? `${priorRank < currentRank ? "Dropped" : "Gained"} from P${priorRank + 1} to P${currentRank + 1} in the drivers' championship.`
            : `Now classified P${currentRank + 1} in the drivers' championship.`,
      });
    } else if (currentRank >= 0 && priorRank >= 0 && currentStandings.drivers[currentRank].points !== (prior.drivers[priorRank]?.points ?? 0)) {
      const gained = currentStandings.drivers[currentRank].points - (prior.drivers[priorRank]?.points ?? 0);
      if (gained > 0) {
        changes.push({
          type: "DRIVER",
          title: `${name} scored since your last visit`,
          explanation: `Added ${gained} points, now on ${currentStandings.drivers[currentRank].points} for the season.`,
        });
      }
    }
  }

  // Favorite team rank/points change
  if (params.favoriteTeamName) {
    const priorRank = prior.teams.findIndex((t) => t.team === params.favoriteTeamName);
    const currentRank = currentStandings.teams.findIndex((t) => t.team === params.favoriteTeamName);
    if (currentRank >= 0 && priorRank !== currentRank) {
      changes.push({
        type: "TEAM",
        title: `${params.favoriteTeamName} moved to P${currentRank + 1}`,
        explanation:
          priorRank >= 0
            ? `${priorRank < currentRank ? "Dropped" : "Gained"} from P${priorRank + 1} to P${currentRank + 1} in the constructors' championship.`
            : `Now classified P${currentRank + 1} in the constructors' championship.`,
      });
    }
  }

  // User's own prediction activity since last visit
  if (params.pickSubmittedAt && new Date(params.pickSubmittedAt).getTime() > new Date(lastVisitIso).getTime()) {
    changes.push({
      type: "PREDICTION",
      title: "You made a new prediction",
      explanation: "Your podium pick for the upcoming race was submitted since your last visit.",
    });
  }

  // Community activity since last visit
  if (params.newCommunityPostCount && params.newCommunityPostCount > 0) {
    changes.push({
      type: "COMMUNITY",
      title: `${params.newCommunityPostCount} new post${params.newCommunityPostCount === 1 ? "" : "s"} in your communities`,
      explanation: "New discussion has appeared in the groups you've joined since your last visit.",
    });
  }

  return { hasPriorVisit: true, changes: changes.slice(0, MAX_CHANGES) };
}
