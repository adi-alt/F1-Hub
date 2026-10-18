import { NextResponse } from "next/server";
import { getSession } from "@/lib/session/getSession";
import { listNotifications } from "@/lib/supabase/notifications";

/** The signed-in person's notification centre: a page of notifications (`?before=` the last one's time) and the
 * unread count. `?count=1` returns only the count, for the header's badge. */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Sign in to see notifications." }, { status: 401 });
  const url = new URL(request.url);
  const before = url.searchParams.get("before");
  const limit = url.searchParams.get("count") === "1" ? 0 : 20;
  try {
    const data = await listNotifications(session.uid, { before, limit: Math.max(limit, 1) });
    return NextResponse.json(limit === 0 ? { unread: data.unread } : data, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Couldn't load notifications." }, { status: 500 });
  }
}
