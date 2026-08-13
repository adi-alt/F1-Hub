import { NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";
import { sendOtp } from "@/lib/otp";

/**
 * Step 1 of sign-in/sign-up, for every provider alike (Google, GitHub, email/password): the
 * client has already completed the Firebase-side auth and holds a real ID token by the time it
 * calls this - this route verifies that token, then sends an OTP to the account's email. Whether
 * the account is new or returning isn't decided here; otp/verify branches on that once the code
 * comes back.
 */
export async function POST(request: Request) {
  const { idToken } = await request.json();
  if (typeof idToken !== "string" || !idToken) {
    return NextResponse.json({ error: "Missing idToken" }, { status: 400 });
  }

  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(idToken);
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }
  if (!decoded.email) {
    return NextResponse.json({ error: "This account has no email address to verify." }, { status: 400 });
  }

  // "cooldown" just means a still-valid code was already sent a moment ago (e.g. the client
  // retried /start) - not an error, the user can still use that one.
  await sendOtp(decoded.email);
  return NextResponse.json({ ok: true, email: decoded.email });
}
