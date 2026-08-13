// Query-param routing by design (a deliberate stylistic choice, not a technical requirement) —
// centralized here so the URL shape only needs to change in one place.
// Keyed by round, not a slug: round is a stable field every race document already has, so this
// avoids any dependency on how (or whether) an event name gets turned into a URL-safe string.
export function raceHref(year: number, round: number): string {
  return `/races?year=${year}&round=${round}`;
}

export function raceSimulationHref(year: number, round: number): string {
  return `/races/simulation?year=${year}&round=${round}`;
}

export function seasonHref(year: number): string {
  return `/season?year=${year}`;
}

export function circuitHref(circuit: string): string {
  return `/circuits?circuit=${encodeURIComponent(circuit)}`;
}

export function archiveSeasonHref(year: number): string {
  return `/archive?year=${year}`;
}

export function archiveRaceHref(year: number, round: number): string {
  return `/archive?year=${year}&round=${round}`;
}
