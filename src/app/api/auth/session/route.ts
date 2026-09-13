import { NextResponse } from "next/server";
import { getSession } from "@/lib/session/getSession";

// The actual sign-in flow now goes through /api/auth/start -> otp/verify (or complete-signup),
// which is where the real session gets minted (see lib/session/createSession.ts) - this route is
// just the sign-out half of the old pair now.
export async function DELETE() {
  const session = await getSession();
  session.destroy();
  return NextResponse.json({ ok: true });
}
