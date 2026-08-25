// Query-param routing by design (a deliberate stylistic choice, not a technical requirement) —
// centralized here so the URL shape only needs to change in one place.
// Keyed by round, not a slug: round is a stable field every race document already has, so this
// avoids any dependency on how (or whether) an event name gets turned into a URL-safe string.
// `section` scrolls to that id on the race page once it mounts (see ScrollToSection) — the
// query-param analog of a `#hash` anchor, kept consistent with this file's query-based routing.
export function raceHref(year: number, round: number, section?: string): string {
  const base = `/races?year=${year}&round=${round}`;
  return section ? `${base}&section=${section}` : base;
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

export function archiveCircuitHref(circuitId: string): string {
  return `/archive?circuit=${encodeURIComponent(circuitId)}`;
}

export function archiveDriverHref(driverId: string): string {
  return `/archive?driver=${encodeURIComponent(driverId)}`;
}

export function archiveTeamHref(teamId: string): string {
  return `/archive?team=${encodeURIComponent(teamId)}`;
}

// Not query-param routed, unlike the above — a group is a real resource with its own id-scoped
// page, same style as /profile or /models, not a filtered view over a shared collection.
export function groupHref(id: string): string {
  return `/groups/${id}`;
}
