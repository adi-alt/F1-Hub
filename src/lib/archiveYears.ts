// Split out of lib/supabase/archive.ts (which pulls in supabaseAdmin) so code reachable from a
// "use client" file - even code with no "use client" of its own, since anything directly imported
// and rendered inside a client component's own body still gets bundled for the browser - can use
// the real archive year range without dragging a Supabase admin client into client JS. archive.ts
// re-exports these two so its own existing importers see no change.
export const ARCHIVE_EARLIEST_YEAR = 1950;
export const ARCHIVE_LATEST_YEAR = new Date().getFullYear() - 1;
