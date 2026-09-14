"use client";

import { useFavDriverIds, useFavTeamIds, useFavTrackIds, useToggleFavorite } from "@/queries/favorites/useFavorites";
import { FavoriteButton } from "./FavoriteButton";

/** The real, existing favourites system (query cache + optimistic mutation), not a second one -
 * reused directly for the entity detail pages' header toggle, the same as every other favourite
 * button in this app already does. */
export function ArchiveFavoriteToggle({ type, id }: { type: "driver" | "team" | "track"; id: string }) {
  const favDrivers = useFavDriverIds();
  const favTeams = useFavTeamIds();
  const favTracks = useFavTrackIds();
  const toggle = useToggleFavorite();

  const favorited = type === "driver" ? favDrivers.has(id) : type === "team" ? favTeams.has(id) : favTracks.has(id);

  return <FavoriteButton favorited={favorited} onToggle={() => toggle(type, id)} />;
}
