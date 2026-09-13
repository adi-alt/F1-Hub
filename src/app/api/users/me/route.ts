import { NextResponse } from "next/server";
import { getUserProfile, updateUserPreferences, type PreferencesPatch } from "@/lib/supabase/users";
import { getSession } from "@/lib/session/getSession";

const ARRAY_KEYS = new Set(["favoriteDrivers", "favoriteTeams", "favoriteTracks"]);
const BOOLEAN_KEYS = new Set(["notifyBeforeQualifying", "notifyOnResults"]);
const STRING_KEYS = new Set(["firstName"]);

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

export async function GET() {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const profile = await getUserProfile(session.uid);
  return NextResponse.json({ profile });
}

// Always the caller's own uid — there is no uid in the request body, so there's nothing to spoof.
// Only the fields below are writable; role and everything else stays admin-route-only. This is a
// whole-array *replace* for the favorite lists — /api/archive/favorites is the one-item-at-a-time
// toggle used everywhere favoriting actually happens now (Personalization, archive heart icons).
export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await request.json()) as Record<string, unknown>;
  const patch: PreferencesPatch = {};
  for (const key of Object.keys(body)) {
    if (ARRAY_KEYS.has(key) && isStringArray(body[key])) {
      (patch as Record<string, unknown>)[key] = body[key];
    } else if (BOOLEAN_KEYS.has(key) && typeof body[key] === "boolean") {
      (patch as Record<string, unknown>)[key] = body[key];
    } else if (STRING_KEYS.has(key) && typeof body[key] === "string") {
      (patch as Record<string, unknown>)[key] = body[key];
    }
  }

  // A body with no recognized/valid keys is just a no-op, not an error.
  if (Object.keys(patch).length > 0) await updateUserPreferences(session.uid, patch);
  return NextResponse.json({ ok: true });
}
