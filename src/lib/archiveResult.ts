/** Ergast's own three-way classification status: a finisher, or classified some laps down. Retirements and
 * disqualifications aren't, so they never count as a win or a podium. */
export function isClassified(status: string): boolean {
  return status === "Finished" || /^\+\d+ Lap/.test(status);
}
