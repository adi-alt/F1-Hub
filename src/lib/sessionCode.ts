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
// - confirmed live. This file has no such import, safe from either side.
export function sessionCode(label: string): string {
  const l = label.toLowerCase();
  if (l.includes("practice")) return `P${l.match(/\d/)?.[0] ?? ""}`;
  if (l.includes("sprint") && (l.includes("qualif") || l.includes("shootout"))) return "SQ";
  if (l.includes("sprint")) return "SR";
  if (l.includes("qualif")) return "Q";
  if (l.includes("race")) return "R";
  return label.slice(0, 2).toUpperCase();
}
