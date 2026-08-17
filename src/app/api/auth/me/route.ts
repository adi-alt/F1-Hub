import { NextResponse } from "next/server";
import { getSession } from "@/lib/session/getSession";

/** Reads whatever session already exists (a normal persisted cookie, same as any other page
 * load) - no Firebase ID token involved, so this never re-triggers OTP. AuthProvider calls this
 * on mount purely to hydrate the client-side `role` used for reactive nav, since that cached
 * value only otherwise gets set at the moment of an explicit sign-in. */
export async function GET() {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ signedIn: false });
  return NextResponse.json({
    signedIn: true,
    role: session.role ?? "user",
    displayName: session.displayName ?? null,
  });
}
