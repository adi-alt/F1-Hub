import { NextResponse } from "next/server";
import { favoriteToggleSchema } from "@/lib/inputLimits";
import { ServiceError } from "@/services/errors";
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

  // Shape and id length (SEC-25, see inputLimits.ts); the list-length cap is setArchiveFavorite's.
  const parsed = favoriteToggleSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const { type, id, favorited } = parsed.data;

  const field = type === "track" ? "favoriteTracks" : type === "team" ? "favoriteTeams" : "favoriteDrivers";
  try {
    await setArchiveFavorite(session.uid, field, id, favorited);
  } catch (err) {
    if (err instanceof ServiceError) return NextResponse.json({ error: err.message }, { status: err.httpStatus });
    throw err;
  }
  return NextResponse.json({ ok: true });
}
