import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { favoritesKeys } from "./favoritesKeys";
import { fetchFavorites, postFavorite, type FavoriteIds, type FavoriteType } from "./favorites.client";

const EMPTY: FavoriteIds = { drivers: [], teams: [], tracks: [] };
const FIELD: Record<FavoriteType, keyof FavoriteIds> = { driver: "drivers", team: "teams", track: "tracks" };

/** The signed-in viewer's own favorite driver/team/track ids. staleTime: Infinity — realtime
 * (AppRealtimeSync's `profiles` listener, see syncPolicy.ts) is the actual freshness signal, not
 * a timer. Seeded synchronously by FavoritesHydrator on every page that already server-fetched
 * these (season, archive), so this never needs a cold client fetch on first paint; `queryFn` is
 * only the resync fallback — a reconnect, an invalidateQueries call after a realtime `profiles`
 * change, or a page that renders a favorite-aware component with no Hydrator mounted above it. */
export function useFavoritesQuery() {
  return useQuery({
    queryKey: favoritesKeys.all(),
    queryFn: fetchFavorites,
    staleTime: Infinity,
  });
}

function useFavoriteIds(): FavoriteIds {
  const { data } = useFavoritesQuery();
  return data ?? EMPTY;
}

// Selector-style hooks matching the shape every existing consumer already calls by name
// (ChampionshipStandings, SeasonCalendar, ProgressionPanel, ArchiveExplorer) — only the import
// path changed when these moved off the old Zustand store onto the query cache.
export function useFavDriverIds(): Set<string> {
  const { drivers } = useFavoriteIds();
  return useMemo(() => new Set(drivers), [drivers]);
}
export function useFavTeamIds(): Set<string> {
  const { teams } = useFavoriteIds();
  return useMemo(() => new Set(teams), [teams]);
}
export function useFavTrackIds(): Set<string> {
  const { tracks } = useFavoriteIds();
  return useMemo(() => new Set(tracks), [tracks]);
}

/** Optimistic toggle + rollback-on-failure — the TanStack-idiomatic version of what
 * useFavoritesStore.ts used to hand-roll as a Zustand action (`onMutate`/`onError` below is the
 * same optimistic-update-then-revert logic, just expressed the way this library expects it). */
export function useToggleFavorite() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({ type, id, favorited }: { type: FavoriteType; id: string; favorited: boolean }) =>
      postFavorite(type, id, favorited),
    onMutate: async ({ type, id, favorited }) => {
      await queryClient.cancelQueries({ queryKey: favoritesKeys.all() });
      const previous = queryClient.getQueryData<FavoriteIds>(favoritesKeys.all());
      queryClient.setQueryData<FavoriteIds>(favoritesKeys.all(), (old) => {
        const base = old ?? EMPTY;
        const field = FIELD[type];
        const set = new Set(base[field]);
        if (favorited) set.add(id);
        else set.delete(id);
        return { ...base, [field]: [...set] };
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(favoritesKeys.all(), context.previous);
    },
  });

  // Preserves the exact `toggle(type, id)` call signature every consumer already uses — reads
  // current cache state to decide add-vs-remove, same as the old store's toggle did.
  return (type: FavoriteType, id: string) => {
    const current = queryClient.getQueryData<FavoriteIds>(favoritesKeys.all()) ?? EMPTY;
    const willFavorite = !current[FIELD[type]].includes(id);
    mutation.mutate({ type, id, favorited: willFavorite });
  };
}
