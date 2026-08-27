import type { RealtimeTable } from "./types";

export type SyncStrategy = "invalidate" | "refresh";

/**
 * The single, explicit mapping of "a change on this table happened — what does this app do about
 * it" (plan safeguard 10). No feature hook decides this on its own; `AppRealtimeSync.tsx` (for
 * `races`/`calendar`/`drivers`/`teams`/`profiles`) and `GroupRealtimeWatcher.tsx` (for
 * `group_race_scores`/`group_members`) are the only two places that read this table and actually
 * dispatch — everything else just registers a handler through `useRealtimeSubscription`.
 *
 * `invalidate`: the resource has a client-side TanStack Query cache entry; the handler calls
 * `queryClient.invalidateQueries(...)` for the right key (Favorites, Users — see Part C/D of the
 * plan). `refresh`: no safe/proportionate client-side representation exists — the handler calls
 * `router.refresh()`. This is `races`/`calendar`/`drivers`/`teams`/`group_*`'s *documented*
 * strategy, not a fallback: their consumers (`computeStandings`, `buildBattles`,
 * `computeChampionshipProgression`, group leaderboards) are server-only derived computations: an
 * event on `races` can't safely be "patched" into a client cache without duplicating that
 * business logic, so a full server re-render is the correct sync mechanism here, not a shortcut.
 */
export const SYNC_STRATEGY: Record<RealtimeTable, SyncStrategy> = {
  races: "refresh",
  calendar: "refresh",
  drivers: "refresh",
  teams: "refresh",
  profiles: "invalidate",
  group_race_scores: "refresh",
  group_members: "refresh",
};
