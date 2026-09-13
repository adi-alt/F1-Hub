import { NextResponse } from "next/server";
import { getPointsBalance } from "@/lib/supabase/points";
import { getSession } from "@/lib/session/getSession";

/** Reads whatever session already exists (a normal persisted cookie, same as any other page
 * load) - no token involved, so this never re-triggers OTP. AuthProvider calls this on mount
 * purely to hydrate the client-side auth state used for reactive nav, since those cached values
 * only otherwise get set at the moment of an explicit sign-in.
 *
 * pointsBalance is the one field here that's a real DB read, not an echo of the session cookie -
 * unlike role/displayName it changes often (every prediction entry/payout), so it can't be cached
 * in the session the way those are. AuthProvider also re-calls this (not just on mount) whenever
 * the realtime `profiles:UPDATE` listener it already has open for favorites fires - see
 * AppRealtimeSync's own comment. */
export async function GET() {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ signedIn: false });
  // Defensive, not expected: a session with no matching profiles row shouldn't exist, but this
  // endpoint is on the critical path of every page's auth hydration - one missing profile must
  // not 500 the whole thing and strand a real user on a broken nav bar.
  const pointsBalance = await getPointsBalance(session.uid).catch(() => null);
  return NextResponse.json({
    signedIn: true,
    role: session.role ?? "user",
    displayName: session.displayName ?? null,
    uid: session.uid,
    email: session.email ?? null,
    photoURL: session.photoURL ?? null,
    pointsBalance,
  });
}
