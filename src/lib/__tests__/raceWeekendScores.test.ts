import { it } from "node:test";
import assert from "node:assert/strict";
import { MAX_PICK_POINTS } from "../pickScoring";
import { raceWeekendScores } from "../raceWeekendScores";
import type { RaceDoc, RaceResultEntry, UserPick } from "../types/race";

const r = (finishPosition: number, driver: string): RaceResultEntry =>
  ({ driver, driverName: driver, team: "", grid: null, finishPosition, finishGapSec: null, status: "finished", fastestLapSec: null, points: 0 }) as RaceResultEntry;
const race = {
  id: "2026_r18",
  status: "completed",
  results: [r(1, "ANT"), r(2, "RUS"), r(3, "LEC")],
  prediction: { finishOrder: [{ driver: "RUS", predictedPosition: 2 }, { driver: "ANT", predictedPosition: 1 }, { driver: "LEC", predictedPosition: 3 }] },
} as unknown as RaceDoc;
const pick = (podium: [string, string, string]) => ({ raceId: race.id, predictedPodium: podium, predictedWinner: podium[0], submittedAt: "" }) as UserPick;

it("puts your points beside the community's average and the model's", () => {
  const mine = pick(["ANT", "RUS", "LEC"]);
  const s = raceWeekendScores(race, [mine, pick(["NOR", "PIA", "VER"])], mine);
  assert.deepEqual(s, { you: 9, communityAverage: 4.5, communityCount: 2, model: 9, max: MAX_PICK_POINTS });
});

it("has no points of yours when you didn't pick", () => {
  assert.equal(raceWeekendScores(race, [], null).you, null);
  assert.equal(raceWeekendScores(race, [], null).communityAverage, null);
});
