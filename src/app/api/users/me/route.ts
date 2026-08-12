import { NextResponse } from "next/server";
import { getUserProfile, updateUserPreferences, type PreferencesPatch } from "@/lib/firestore/users";
import { getSession } from "@/lib/session/getSession";

const ALLOWED_KEYS = new Set(["favoriteDriver", "favoriteTeam", "notifyBeforeQualifying", "notifyOnResults"]);

export async function GET() {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const profile = await getUserProfile(session.uid);
  return NextResponse.json({ profile });
}

// Always the caller's own uid — there is no uid in the request body, so there's nothing to spoof.
// Only the four preference fields are writable; role and everything else stays admin-route-only.
export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await request.json()) as Record<string, unknown>;
  const patch: PreferencesPatch = {};
  for (const key of Object.keys(body)) {
    if (ALLOWED_KEYS.has(key)) (patch as Record<string, unknown>)[key] = body[key];
  }

  await updateUserPreferences(session.uid, patch);
  return NextResponse.json({ ok: true });
}
