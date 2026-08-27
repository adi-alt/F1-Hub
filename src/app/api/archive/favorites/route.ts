import { NextResponse } from "next/server";
import { getUserProfile, setArchiveFavorite } from "@/lib/supabase/users";
import { getSession } from "@/lib/session/getSession";

/** The read side of favorites — used by useFavoritesQuery's `queryFn` for a genuine resync
 * (reconnect, an explicit invalidateQueries call after a realtime `profiles` change), not the
 * normal path (pages seed the query cache directly from their own server-side
 * getUserProfile/session-scoped fetch via FavoritesHydrator; this route exists so that seed can
 * be refreshed from the client without a full page reload). */
export async function GET() {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const profile = await getUserProfile(session.uid);
  return NextResponse.json({
    drivers: profile?.favoriteDrivers ?? [],
    teams: profile?.favoriteTeams ?? [],
    tracks: profile?.favoriteTracks ?? [],
  });
}

/** Toggles a track/driver/team into or out of the signed-in user's archive favorites. /archive
 * itself is already sign-in-gated (see archive/page.tsx's SignInGate), but this route checks the
 * session itself too — same defense-in-depth as /api/archive/laps. */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await request.json()) as { type?: string; id?: string; favorited?: boolean };
  if (
    (body.type !== "track" && body.type !== "driver" && body.type !== "team") ||
    typeof body.id !== "string" ||
    typeof body.favorited !== "boolean"
  ) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const field =
    body.type === "track" ? "favoriteTracks" : body.type === "team" ? "favoriteTeams" : "favoriteDrivers";
  await setArchiveFavorite(session.uid, field, body.id, body.favorited);
  return NextResponse.json({ ok: true });
}
