import { NextResponse } from "next/server";
import { markOnboardingComplete } from "@/lib/supabase/users";
import { getSession } from "@/lib/session/getSession";

export async function POST() {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  await markOnboardingComplete(session.uid);
  return NextResponse.json({ ok: true });
}
