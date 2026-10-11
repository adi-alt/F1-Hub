import { NextResponse } from "next/server";
import { getUserProfile, updateUserPreferences } from "@/lib/supabase/users";
import { getSession } from "@/lib/session/getSession";
import { preferencesPatchSchema } from "@/lib/inputLimits";

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

  // Unknown keys are dropped; a known key with the wrong type or over its size cap is refused
  // (SEC-25, see inputLimits.ts).
  const parsed = preferencesPatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Some of those values are invalid or too long." }, { status: 400 });

  // A body with no recognized keys is just a no-op, not an error.
  if (Object.keys(parsed.data).length > 0) await updateUserPreferences(session.uid, parsed.data);
  return NextResponse.json({ ok: true });
}
