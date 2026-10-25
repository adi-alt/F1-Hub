// The after-the-race lead module's three numbers (R-64): your pick's points, the average of every
// pick made for the race, and what the model's own call would have scored, all by scorePick so
// they match the leaderboards.
import { MAX_PICK_POINTS, scorePick } from "./pickScoring";
import type { RaceDoc, UserPick } from "./types/race";

export type RaceWeekendScores = {
  you: number | null;
  communityAverage: number | null;
  communityCount: number;
  model: number | null;
  max: number;
};

/** The model's call as a pick: its predicted podium and top five, and its pole favourite. */
export function modelPick(race: RaceDoc): (Partial<UserPick> & { predictedPodium: [string, string, string] }) | null {
  const order = [...(race.prediction?.finishOrder ?? [])].sort((a, b) => a.predictedPosition - b.predictedPosition).map((e) => e.driver);
  if (order.length < 3) return null;
  const pole = [...(race.polePrediction?.order ?? [])].sort((a, b) => a.predictedQualiPosition - b.predictedQualiPosition)[0]?.driver ?? null;
  return {
    predictedPodium: [order[0], order[1], order[2]],
    predictedTop5: order.length >= 5 ? (order.slice(0, 5) as UserPick["predictedTop5"]) : null,
    predictedPole: pole,
  };
}

export function raceWeekendScores(race: RaceDoc, picks: readonly UserPick[], yours: UserPick | null): RaceWeekendScores {
  const scored = picks.map((p) => scorePick(p, race)).filter((s) => s.scored);
  const model = modelPick(race);
  const modelScore = model ? scorePick(model, race) : null;
  const yourScore = yours ? scorePick(yours, race) : null;
  return {
    you: yourScore?.scored ? yourScore.earned : null,
    communityAverage: scored.length ? Math.round((scored.reduce((a, s) => a + s.earned, 0) / scored.length) * 10) / 10 : null,
    communityCount: scored.length,
    model: modelScore?.scored ? modelScore.earned : null,
    max: MAX_PICK_POINTS,
  };
}

/** Your podium and the model's, each with what it scored (race page's "Your pick"). Yours is null without a pick. */
export function podiumCalls(race: RaceDoc, yours: UserPick | null) {
  const call = (p: Partial<UserPick> & { predictedPodium: readonly string[] }) => {
    const s = scorePick(p, race);
    return s.scored ? { codes: p.predictedPodium, earned: s.earned, possible: s.possible } : null;
  };
  const model = modelPick(race);
  return { yourCall: yours ? call(yours) : null, modelCall: model ? call(model) : null };
}
