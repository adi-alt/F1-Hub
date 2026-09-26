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

// A genuine approximation, stated plainly rather than hidden: this app's data model has no
// session END time anywhere (calendar.sessions[] is a list of start times only - confirmed live),
// so "is a session live right now" can't be read off real data the way "has it started" can. These
// are real, typical FIA session lengths (with headroom, not the tightest possible bound) used only
// to decide whether the label says "Live" - nothing scored, paid out, or gated depends on this
// being exact, unlike the real timestamp comparisons the rest of this file does.
const APPROX_SESSION_DURATION_MS: Record<string, number> = {
  P1: 75 * 60_000,
  P2: 75 * 60_000,
  P3: 75 * 60_000,
  Q: 75 * 60_000,
  SQ: 75 * 60_000,
  SR: 45 * 60_000,
  R: 3 * 60 * 60_000,
};

/** The most recently STARTED session, if it's still plausibly within its own typical length - the
 * one state nextSession alone can't express (a session that's already begun isn't "next" anymore,
 * but a countdown that just silently jumps to the FOLLOWING session reads as if the current one
 * never happened). Null once genuinely nothing is likely still running. */
export function liveSession<T extends { label: string; date: string }>(sessions: T[], nowMs: number): T | null {
  const started = sessions.filter((s) => parseUtcDateTime(s.date).getTime() <= nowMs).sort((a, b) => parseUtcDateTime(b.date).getTime() - parseUtcDateTime(a.date).getTime());
  const mostRecent = started[0];
  if (!mostRecent) return null;
  const elapsedMs = nowMs - parseUtcDateTime(mostRecent.date).getTime();
  const duration = APPROX_SESSION_DURATION_MS[sessionCode(mostRecent.label)] ?? 90 * 60_000;
  return elapsedMs <= duration ? mostRecent : null;
}
