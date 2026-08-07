import type { RaceDoc } from "@/lib/types/race";

export type PredictionAccuracy = {
  positionMAE: number;
  podiumHits: number;
  predictedWinner: string;
  actualWinner: string;
};

/** Compares a race's locked-in pre-race prediction against its actual result. */
export function comparePrediction(race: RaceDoc): PredictionAccuracy | null {
  if (race.status !== "completed" || !race.results || !race.prediction) return null;

  const actualByDriver = new Map(race.results.map((r) => [r.driver, r.finishPosition]));
  const predicted = race.prediction.finishOrder;

  const errors = predicted
    .map((p) => {
      const actual = actualByDriver.get(p.driver);
      return actual === undefined ? null : Math.abs(actual - p.predictedPosition);
    })
    .filter((error): error is number => error !== null);
  const positionMAE = errors.length ? errors.reduce((sum, v) => sum + v, 0) / errors.length : 0;

  const predictedPodium = new Set(predicted.filter((p) => p.predictedPosition <= 3).map((p) => p.driver));
  const actualPodium = new Set(race.results.filter((r) => r.finishPosition <= 3).map((r) => r.driver));
  const podiumHits = [...predictedPodium].filter((driver) => actualPodium.has(driver)).length;

  return {
    positionMAE,
    podiumHits,
    predictedWinner: predicted.find((p) => p.predictedPosition === 1)?.driver ?? "",
    actualWinner: race.results.find((r) => r.finishPosition === 1)?.driver ?? "",
  };
}

export type PolePredictionAccuracy = {
  predictedPole: string;
  actualPole: string;
  hit: boolean;
};

/** Compares the frozen prior-form pole prediction against who actually took pole. */
export function comparePolePrediction(race: RaceDoc): PolePredictionAccuracy | null {
  if (race.status !== "completed" || !race.poleSitter || !race.polePrediction?.order.length) return null;
  const predictedPole = race.polePrediction.order[0].driver;
  return { predictedPole, actualPole: race.poleSitter, hit: predictedPole === race.poleSitter };
}
