// Query-param routing by design (a deliberate stylistic choice, not a technical requirement) —
// centralized here so the URL shape only needs to change in one place.
export function raceHref(year: number, slug: string): string {
  return `/races?year=${year}&slug=${encodeURIComponent(slug)}`;
}

export function seasonHref(year: number): string {
  return `/season?year=${year}`;
}

export function circuitHref(circuit: string): string {
  return `/circuits?circuit=${encodeURIComponent(circuit)}`;
}
