// The network half of favoriting, shared by every favorite control (StandingsTables.tsx,
// SeasonSidebarWidgets.tsx) — each caller still owns its own optimistic Set-state update/revert,
// since that differs slightly per component; this is just the POST itself.
export function postFavorite(type: "driver" | "team", id: string, favorited: boolean): Promise<Response> {
  return fetch("/api/archive/favorites", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, id, favorited }),
  });
}
