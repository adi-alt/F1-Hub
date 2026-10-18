import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session/getSession";
import { markNotificationsRead } from "@/lib/supabase/notifications";

const body = z.object({ ids: z.array(z.string().uuid()).max(100).optional() });

/** Marks the given notifications (or all of them, with no ids) read. Only ever the caller's own. */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  await markNotificationsRead(session.uid, parsed.data.ids);
  return NextResponse.json({ ok: true });
}
