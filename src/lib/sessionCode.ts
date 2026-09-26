// FastF1 (see pipeline/sync_calendar.py's own all_sessions()) writes whatever a weekend's sessions
// are actually called ("Practice 1", "Sprint Qualifying", "Sprint Shootout", "Race", …) rather than
// a fixed 5-slot enum, since the sprint format itself has changed session names across seasons.
// Reading a short code back out the same way — by substring, not an exhaustive lookup — means a
// future rename doesn't quietly fall through to an unlabeled cell.
//
// A standalone pure module, not defined inside season.service.ts (where this originally lived) -
// that file also imports server-only Supabase admin code (via archive.ts), so a client component
// (RaceWeekendPanel) importing `sessionCode` from there would pull that whole module graph into the
// browser bundle and crash on `SUPABASE_SECRET_KEY is not set` the instant it evaluated client-side
// - confirmed live. This file has no such import, safe from either side. parseUtcDateTime (below)
// is dependency-free too, so importing it here doesn't change that.
import { parseUtcDateTime } from "./countdown";

export function sessionCode(label: string): string {
  const l = label.toLowerCase();
  if (l.includes("practice")) return `P${l.match(/\d/)?.[0] ?? ""}`;
  if (l.includes("sprint") && (l.includes("qualif") || l.includes("shootout"))) return "SQ";
  if (l.includes("sprint")) return "SR";
  if (l.includes("qualif")) return "Q";
  if (l.includes("race")) return "R";
  return label.slice(0, 2).toUpperCase();
}

/** The next session whose start hasn't passed yet, earliest first - what a countdown should
 * actually count down to. A weekend's countdown pointed at the Race session alone regardless of
 * where the weekend actually was (three days out from FP1, it still said "lights out" for the
 * Grand Prix, not "Practice 1 starts in..."), which is real information this app already has
 * (every session's own real datetime) sitting unused.
 *
 * Parses through parseUtcDateTime, not a bare `new Date(s.date)` - these are the same naive,
 * no-timezone pipeline strings that function's own comment warns about, and this file is exactly
 * the "every consumer of one of these raw pipeline strings" it means. Same standalone-module
 * reasoning as `sessionCode` above (parseUtcDateTime is dependency-free too, so this stays safe
 * for a client component to import without pulling in anything server-only). */
export function nextSession<T extends { date: string }>(sessions: T[], nowMs: number): T | null {
  const upcoming = sessions.filter((s) => parseUtcDateTime(s.date).getTime() > nowMs).sort((a, b) => parseUtcDateTime(a.date).getTime() - parseUtcDateTime(b.date).getTime());
  return upcoming[0] ?? null;
}
