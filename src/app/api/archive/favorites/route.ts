import { NextResponse } from "next/server";
import { setArchiveFavorite } from "@/lib/firestore/users";
import { getSession } from "@/lib/session/getSession";

/** Toggles a track/driver into or out of the signed-in user's archive favorites. /archive itself
 * is already sign-in-gated (see archive/page.tsx's SignInGate), but this route checks the session
 * itself too — same defense-in-depth as /api/archive/laps. */
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
