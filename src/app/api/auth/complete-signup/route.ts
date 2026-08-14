import { NextResponse } from "next/server";
import { completeSignup } from "@/services/auth.service";
import { ServiceError } from "@/services/errors";

export async function POST(request: Request) {
  const body = await request.json();
  const { idToken, firstName, lastName, username, favoriteDriver, favoriteTeam, favoriteTrack } = body;

  if (typeof idToken !== "string") return NextResponse.json({ error: "Missing idToken" }, { status: 400 });
  if (typeof firstName !== "string" || typeof lastName !== "string" || typeof username !== "string") {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }

  try {
    const result = await completeSignup(idToken, {
      firstName,
      lastName,
      username,
      favoriteDriver: typeof favoriteDriver === "string" ? favoriteDriver : undefined,
      favoriteTeam: typeof favoriteTeam === "string" ? favoriteTeam : undefined,
      favoriteTrack: typeof favoriteTrack === "string" ? favoriteTrack : undefined,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ServiceError) return NextResponse.json({ error: err.message }, { status: err.httpStatus });
    throw err;
  }
}
