// Split out of lib/supabase/archive.ts (which pulls in supabaseAdmin) so code reachable from a
// "use client" file - even code with no "use client" of its own, since anything directly imported
// and rendered inside a client component's own body still gets bundled for the browser - can use
// the real archive year range without dragging a Supabase admin client into client JS. archive.ts
// re-exports these two so its own existing importers see no change.
export const ARCHIVE_EARLIEST_YEAR = 1950;
/** The newest season in the archive: every season before the live one (`currentSeason` is
 * getCurrentSeason(), from the calendar). Not the wall clock (audit R-22): on 1 January the finished
 * season is still the live one, served from the live tables, so the archive doesn't list it as an
 * empty archive season before it has been promoted there. */
export function archiveLatestYear(currentSeason: number): number {
  return currentSeason - 1;
}
