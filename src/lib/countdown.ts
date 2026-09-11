// Shared by RaceWeekendPanel (Race page) and the homepage's RaceHero — one countdown format, not
// two copies of the same day/hour/minute math.

/** Pipeline-authored session/race datetimes (calendar.sessions[].date, calendar.race_date) are
 * stored as naive "YYYY-MM-DDTHH:mm:ss" strings with NO timezone designator - real UTC wall-clock
 * times (FastF1's own convention: confirmed live, e.g. "2026-12-06T13:00:00"), but `new Date(...)`
 * on a string with no "Z"/offset parses it as LOCAL time in whatever environment does the parsing
 * (the JS spec's own rule for a date-time form lacking an explicit zone). That silently produces a
 * DIFFERENT instant server-side (a UTC deployment) vs. client-side (a real visitor's own
 * timezone) - and because the eventual display conversion is then a no-op in whichever zone did
 * the misparsing, every non-UTC visitor sees a countdown/"your time" that's wrong by exactly their
 * own UTC offset, looking like it ignores their real timezone rather than actually converting to
 * it. Every consumer of one of these raw pipeline strings should parse through this, not
 * `new Date(iso)` directly - already-zoned strings (ending in Z or +HH:MM, e.g.
 * weatherForecast.fetchedAt) pass through unchanged. */
export function parseUtcDateTime(iso: string): Date {
  const hasZone = /Z$|[+-]\d{2}:?\d{2}$/.test(iso);
  return new Date(hasZone ? iso : `${iso}Z`);
}

export function formatCountdown(targetMs: number, nowMs: number): string {
  const diff = targetMs - nowMs;
  if (diff <= 0) return "";
  const totalMinutes = Math.floor(diff / 60_000);
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/** Same idea as formatCountdown, always down to the second - for the one countdown on the site
 * meant to visibly tick while someone's looking at it (the homepage hero), not the coarser
 * once-a-minute display RaceWeekendPanel/PickPanel use elsewhere. */
export function formatCountdownLive(targetMs: number, nowMs: number): string {
  const diff = targetMs - nowMs;
  if (diff <= 0) return "";
  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m ${seconds}s`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  return `${minutes}m ${seconds}s`;
}
