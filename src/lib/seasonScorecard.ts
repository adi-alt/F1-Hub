// The profile's season scorecard (roadmap R-63): per race, your pick against the model's, the
// community's consensus and the actual winner, with the points each scored. Every figure comes from
// scorePick, the same rules pipeline/compute_group_scores.py scores the community leaderboards with,
// so the totals here are the totals there (and the profile overview's "points earned").
import { scorePick } from "./pickScoring";
import { modelWinnerFor } from "./predictionPerformance";
import { modelPick } from "./raceWeekendScores";
import type { RaceDoc, UserPick } from "./types/race";

export type ScorecardRow = {
  raceId: string;
  round: number;
  raceName: string;
  status: "scored" | "pending";
  yourWinner: string | null;
  modelWinner: string | null;
  /** The most-picked winner among everyone's picks, and its share of them (0-1). */
  consensusWinner: string | null;
  consensusShare: number | null;
  actualWinner: string | null;
  /** Null until the race is scored, or when there was no pick. */
  yourPoints: number | null;
  modelPoints: number | null;
  communityAverage: number | null;
};

export type SeasonScorecard = {
  rows: ScorecardRow[];
  totals: { yourPoints: number; racesScored: number; picks: number; winnersRight: number; modelPoints: number; beatModel: number };
};

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Rows for every race you picked, plus every completed race (so a missed one shows as a gap), by round. */
export function buildSeasonScorecard(races: readonly RaceDoc[], yourPicks: readonly UserPick[], allPicks: readonly UserPick[]): SeasonScorecard {
  const yours = new Map(yourPicks.map((p) => [p.raceId, p]));
  const byRace = new Map<string, UserPick[]>();
  for (const p of allPicks) byRace.set(p.raceId, [...(byRace.get(p.raceId) ?? []), p]);

  const totals = { yourPoints: 0, racesScored: 0, picks: yourPicks.length, winnersRight: 0, modelPoints: 0, beatModel: 0 };
  const rows: ScorecardRow[] = [];
  for (const race of [...races].sort((a, b) => a.round - b.round)) {
    const pick = yours.get(race.id) ?? null;
    const completed = race.status === "completed" && !!race.results?.length;
    if (!pick && !completed) continue;

    const picks = byRace.get(race.id) ?? [];
    const counts = new Map<string, number>();
    for (const p of picks) if (p.predictedWinner) counts.set(p.predictedWinner, (counts.get(p.predictedWinner) ?? 0) + 1);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];

    const actualWinner = race.results?.find((r) => r.finishPosition === 1)?.driver ?? null;
    const yourScore = pick ? scorePick(pick, race) : null;
    const model = modelPick(race);
    const modelScore = model ? scorePick(model, race) : null;
    const community = picks.map((p) => scorePick(p, race)).filter((s) => s.scored);
    const yourPoints = yourScore?.scored ? yourScore.earned : null;
    const modelPoints = modelScore?.scored ? modelScore.earned : null;

    if (yourPoints !== null) {
      totals.yourPoints += yourPoints;
      totals.racesScored += 1;
      if (pick && actualWinner === pick.predictedWinner) totals.winnersRight += 1;
      if (modelPoints !== null) {
        totals.modelPoints += modelPoints;
        if (yourPoints > modelPoints) totals.beatModel += 1;
      }
    }
    rows.push({
      raceId: race.id,
      round: race.round,
      raceName: race.name,
      status: completed ? "scored" : "pending",
      yourWinner: pick?.predictedWinner ?? null,
      // The race model's call, the one its points are for; the simulation's favourite only when there is none.
      modelWinner: model?.predictedPodium[0] ?? modelWinnerFor(race),
      consensusWinner: top?.[0] ?? null,
      consensusShare: top && picks.length ? top[1] / picks.length : null,
      actualWinner,
      yourPoints,
      modelPoints,
      communityAverage: community.length ? round1(community.reduce((a, s) => a + s.earned, 0) / community.length) : null,
    });
  }
  return { rows, totals };
}
