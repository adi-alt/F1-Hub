export type FavoriteType = "driver" | "team" | "track";
export type FavoriteIds = { drivers: string[]; teams: string[]; tracks: string[] };

/** Refetches the signed-in viewer's own favorites from Postgres — the resync path (a missed
 * realtime event, a reconnect, an explicit invalidateQueries call) always goes through this, never
 * fabricates state client-side (plan safeguard 11). */
export async function fetchFavorites(): Promise<FavoriteIds> {
  const res = await fetch("/api/archive/favorites");
  if (!res.ok) throw new Error(`fetchFavorites: ${res.status}`);
  return res.json();
}

/** The write side — same POST route this app has always used for favoriting, unchanged. */
export async function postFavorite(type: FavoriteType, id: string, favorited: boolean): Promise<void> {
  const res = await fetch("/api/archive/favorites", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, id, favorited }),
  });
  if (!res.ok) throw new Error(`postFavorite: ${res.status}`);
}
