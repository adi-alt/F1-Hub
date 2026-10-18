import { NextResponse } from "next/server";
import { getSession } from "@/lib/session/getSession";
import { updateNotificationPrefs } from "@/lib/supabase/notifications";

/** Changes how the caller is notified: `{ "<kind>": { "site"?: boolean, "email"?: boolean } }`. Unknown kinds and
 * non-boolean values are refused. */
export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const merged = await updateNotificationPrefs(session.uid, await request.json().catch(() => null));
  if (!merged) return NextResponse.json({ error: "Nothing valid to change." }, { status: 400 });
  return NextResponse.json({ prefs: merged });
}
