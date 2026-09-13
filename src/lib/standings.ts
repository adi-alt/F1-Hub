import type { RaceDoc } from "@/lib/types/race";

export type DriverStanding = {
  driver: string;
  driverName: string;
  team: string;
  points: number;
  wins: number;
  podiums: number;
};

export type ConstructorStanding = {
  team: string;
  points: number;
  wins: number;
  podiums: number;
};

export type SeasonStandings = {
  drivers: DriverStanding[];
  constructors: ConstructorStanding[];
};

/** Derived from completed races only — championship points are cheap to sum, no need to cache. */
export function computeStandings(races: RaceDoc[]): SeasonStandings {
  const drivers = new Map<string, DriverStanding>();
  const constructors = new Map<string, ConstructorStanding>();

  for (const race of races) {
    if (race.status !== "completed") continue;
    for (const result of race.results ?? []) {
      const driver = drivers.get(result.driver) ?? {
        driver: result.driver,
        driverName: result.driverName,
        team: result.team,
        points: 0,
        wins: 0,
        podiums: 0,
      };
      driver.team = result.team; // keep the most recent team (mid-season driver swaps are rare but real)
      driver.points += result.points;
      if (result.finishPosition === 1) driver.wins += 1;
      if (result.finishPosition <= 3) driver.podiums += 1;
      drivers.set(result.driver, driver);

      const constructor = constructors.get(result.team) ?? { team: result.team, points: 0, wins: 0, podiums: 0 };
      constructor.points += result.points;
      if (result.finishPosition === 1) constructor.wins += 1;
      if (result.finishPosition <= 3) constructor.podiums += 1;
      constructors.set(result.team, constructor);
    }
  }

  return {
    drivers: [...drivers.values()].sort((a, b) => b.points - a.points || b.wins - a.wins),
    constructors: [...constructors.values()].sort((a, b) => b.points - a.points || b.wins - a.wins),
  };
}
