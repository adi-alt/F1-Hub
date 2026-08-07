import type { RaceDoc, RaceResultEntry } from "@/lib/types/race";

export type RaceHighlights = {
  poleSitter: string;
  podium: RaceResultEntry[];
  fastestLap: { driver: string; timeSec: number } | null;
  biggestGainer: { driver: string; positionsGained: number } | null;
  biggestLoser: { driver: string; positionsLost: number } | null;
  dnfs: RaceResultEntry[];
};

/** Derived purely from a completed race's stored results — no recomputation needed elsewhere. */
export function computeHighlights(race: RaceDoc): RaceHighlights | null {
  if (race.status !== "completed" || !race.results || !race.poleSitter) return null;
  const results = race.results;

  const podium = [...results].sort((a, b) => a.finishPosition - b.finishPosition).slice(0, 3);

  const withFastestLap = results.filter((r) => r.fastestLapSec !== null);
  const fastestLap = withFastestLap.length
    ? withFastestLap.reduce((best, r) => (r.fastestLapSec! < best.fastestLapSec! ? r : best))
    : null;

  const classified = results.filter((r) => r.status !== "dnf");
  const byMovement = classified
    .map((r) => ({ driver: r.driver, movement: r.grid - r.finishPosition })) // positive = gained places
    .sort((a, b) => b.movement - a.movement);

  const gainer = byMovement[0];
  const loser = byMovement.at(-1);

  return {
    poleSitter: race.poleSitter,
    podium,
    fastestLap: fastestLap ? { driver: fastestLap.driver, timeSec: fastestLap.fastestLapSec! } : null,
    biggestGainer: gainer && gainer.movement > 0 ? { driver: gainer.driver, positionsGained: gainer.movement } : null,
    biggestLoser: loser && loser.movement < 0 ? { driver: loser.driver, positionsLost: -loser.movement } : null,
    dnfs: results.filter((r) => r.status === "dnf"),
  };
}
