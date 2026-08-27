"use client";

import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { postFavorite } from "@/lib/favorites";

export type FavoriteType = "driver" | "team" | "track";

type FavoritesState = {
  favDriverIds: Set<string>;
  favTeamIds: Set<string>;
  favTrackIds: Set<string>;
  hydratedForUid: string | null;
  hydrate: (uid: string, ids: { drivers: string[]; teams: string[]; tracks: string[] }) => void;
  toggle: (type: FavoriteType, id: string) => void;
};

const SET_KEY = { driver: "favDriverIds", team: "favTeamIds", track: "favTrackIds" } as const;

function withToggled(set: Set<string>, id: string, favorited: boolean): Set<string> {
  const next = new Set(set);
  if (favorited) next.add(id);
  else next.delete(id);
  return next;
}

function patch(type: FavoriteType, value: Set<string>): Partial<FavoritesState> {
  return { [SET_KEY[type]]: value } as Partial<FavoritesState>;
}

/** One shared favorites store for the whole app — Season and Archive used to each implement
 * favoriting independently (two separate optimistic-Set-state copies, both POSTing through the
 * same postFavorite, neither aware of the other), so favoriting a driver on Archive never showed
 * up on Season's already-mounted UI in the same session. Both now read/write this instead.
 *
 * devtools only — no persist (favorites are always server-seeded per page load from `profiles`,
 * see FavoritesHydrator.tsx; persisting to localStorage would risk showing stale data before that
 * server value lands) and no immer (state here is three flat Sets, plain copy-on-write is simple
 * enough and immer isn't an installed dependency). */
export const useFavoritesStore = create<FavoritesState>()(
  devtools(
    (set, get) => ({
      favDriverIds: new Set<string>(),
      favTeamIds: new Set<string>(),
      favTrackIds: new Set<string>(),
      hydratedForUid: null,

      hydrate: (uid, ids) =>
        set(
          {
            hydratedForUid: uid,
            favDriverIds: new Set(ids.drivers),
            favTeamIds: new Set(ids.teams),
            favTrackIds: new Set(ids.tracks),
          },
          false,
          "favorites/hydrate",
        ),

      toggle: (type, id) => {
        const key = SET_KEY[type];
        const willFavorite = !get()[key].has(id);
        set(patch(type, withToggled(get()[key], id, willFavorite)), false, `favorites/toggle:${type}`);
        postFavorite(type, id, willFavorite).catch(() => {
          set(patch(type, withToggled(get()[key], id, !willFavorite)), false, `favorites/revert:${type}`);
        });
      },
    }),
    { name: "favorites-store", enabled: process.env.NODE_ENV === "development" },
  ),
);

// Fine-grained selectors — each returns the same Set reference until hydrate/toggle actually
// replaces it, so these are safe to use directly as useFavoritesStore(selector) without creating
// a new-object-every-render footgun. Toggling is an action, not derived state: call
// useFavoritesStore.getState().toggle(...) directly in a click handler (same convention
// useAuthDialogStore.getState().open() already uses in this codebase) rather than subscribing to it.
export const useFavDriverIds = () => useFavoritesStore((s) => s.favDriverIds);
export const useFavTeamIds = () => useFavoritesStore((s) => s.favTeamIds);
export const useFavTrackIds = () => useFavoritesStore((s) => s.favTrackIds);
