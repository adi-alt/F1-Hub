export function formatLapTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = (seconds - minutes * 60).toFixed(3);
  return `${minutes}:${rest.padStart(6, "0")}`;
}

/** "great-britain" -> "Great Britain" */
export function raceTitle(slug: string): string {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** "Zandvoort" -> "ZAN" — a chart-axis-width-sized label derived straight from the one field
 * every race always has (RaceDoc.circuit), rather than a hand-maintained per-circuit code table. */
export function trackShortForm(circuit: string): string {
  return circuit.slice(0, 3).toUpperCase();
}

export function raceStatusLabel(race: {
  status: "upcoming" | "completed" | "scheduled";
  results?: { finishPosition: number; driverName: string }[];
  prediction?: unknown;
  polePrediction?: unknown;
  raceDate?: string;
}): string {
  if (race.status === "completed") {
    const winner = race.results?.find((r) => r.finishPosition === 1);
    return `Winner: ${winner?.driverName ?? "—"}`;
  }
  if (race.status === "scheduled") {
    return race.raceDate
      ? new Date(race.raceDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })
      : "Scheduled";
  }
  if (race.prediction) return "Predicted";
  if (race.polePrediction) return "Pole predicted";
  return "Upcoming";
}
