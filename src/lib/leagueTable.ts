// The one place a community's league table is computed (audit R-43). getGroupLeaderboard (the
// leaderboard tab and the community rail's LeagueTable, which render the same rows) and the
// per-card rank on the Communities page both go through here, so they can't disagree.
//
// Rules: only CURRENT members count (a member who left or was removed drops off, even though their
// group_race_scores rows remain until the pipeline recomputes), and a member only collects scores
// for races held on or after the day they joined.

export type LeagueScore = { userId: string; raceId: string; score: number };
export type LeagueMember = { userId: string; joinedAt: string };
export type LeagueStanding = { userId: string; totalScore: number; racesScored: number; rank: number };

export function computeLeagueTable(scores: LeagueScore[], members: LeagueMember[], raceDates: Map<string, string | null>): LeagueStanding[] {
  const joinedDay = new Map(members.map((m) => [m.userId, m.joinedAt.slice(0, 10)]));
  const totals = new Map<string, { totalScore: number; racesScored: number }>();
  for (const row of scores) {
    const joined = joinedDay.get(row.userId);
    if (!joined) continue;
    const raceDate = raceDates.get(row.raceId);
    // An undated race can't be placed relative to the join, so it doesn't count.
    if (!raceDate || raceDate.slice(0, 10) < joined) continue;
    const entry = totals.get(row.userId) ?? { totalScore: 0, racesScored: 0 };
    entry.totalScore += row.score;
    entry.racesScored += 1;
    totals.set(row.userId, entry);
  }
  const sorted = [...totals.entries()].sort((a, b) => b[1].totalScore - a[1].totalScore);
  let rank = 0;
  let prevScore: number | null = null;
  return sorted.map(([userId, t], index) => {
    if (t.totalScore !== prevScore) rank = index + 1;
    prevScore = t.totalScore;
    return { userId, totalScore: t.totalScore, racesScored: t.racesScored, rank };
  });
}
