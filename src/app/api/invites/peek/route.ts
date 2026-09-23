import { NextResponse } from "next/server";
import { peekInvite } from "@/app/users/services/invites.service";

/** Public and unauthenticated by necessity — this is what the signup dialog calls to turn an
 * `?invite=` token into "you've been invited as X", before anyone is signed in.
 *
 * Returns only the address and role the invite names, and only while it is still pending; an
 * unknown, expired, revoked or already-accepted token is answered with the same `{ invite: null }`
 * as a made-up one, so this can't be used to probe which tokens exist. It grants nothing on its
 * own: the role is applied at signup against an OTP-verified address, never against this token.
 */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) return NextResponse.json({ invite: null });
  return NextResponse.json({ invite: await peekInvite(token) });
}
