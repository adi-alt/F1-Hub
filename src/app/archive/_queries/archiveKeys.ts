/** Query key factory for archive's client-side TanStack Query usage — currently just per-race lap
 * data (the rest of archive is server-rendered, no client cache needed). */
export const archiveKeys = {
  all: ["archive"] as const,
  laps: (year: number, round: number) => [...archiveKeys.all, "laps", year, round] as const,
};
