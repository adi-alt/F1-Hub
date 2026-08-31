/** Query key factory for archive's client-side TanStack Query usage - per-race lap data, plus the
 * driver/team lists (see useArchiveDrivers/useArchiveTeams - the two facets big enough, and
 * unnecessary enough on any visit that isn't "By driver"/"By team", to defer instead of eagerly
 * fetching server-side on every Archive load). Circuits/year-stats stay server-rendered/eager -
 * circuits because the active/historical reconciliation needs the full list regardless of which
 * tab is open, year-stats because the default "By year" tab needs it immediately. */
export const archiveKeys = {
  all: ["archive"] as const,
  laps: (year: number, round: number) => [...archiveKeys.all, "laps", year, round] as const,
  drivers: () => [...archiveKeys.all, "drivers"] as const,
  teams: () => [...archiveKeys.all, "teams"] as const,
};
