// The network half of favoriting — SeasonFavoritesContext.tsx owns the optimistic Set-state
// update/revert around it (the one shared store every favorite control on the season page reads/
// writes through); this is just the POST itself.
export function postFavorite(type: "driver" | "team", id: string, favorited: boolean): Promise<Response> {
  return fetch("/api/archive/favorites", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, id, favorited }),
  });
}
