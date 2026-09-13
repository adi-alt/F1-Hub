import { NextResponse } from "next/server";
import { after } from "next/server";
import { deliverOtp } from "@/lib/otp";
import { startSignIn } from "@/services/auth.service";
import { ServiceError } from "@/services/errors";

// No idToken in the body anymore — the Supabase session lives in this request's cookies (set by
// the browser client after password sign-in, or by /auth/callback after an OAuth redirect), so
// startSignIn() can just ask "who does this request say is signed in" itself.
export async function POST() {
  try {
    const { email, code } = await startSignIn();
    // after() runs once this response has already gone out - the actual SMTP round trip (a
    // second or more) would otherwise be the entire reason the OTP screen took a moment to show
    // up, for no benefit: nothing about showing that screen depends on the email having sent yet.
    // code is null when a still-valid one was already sent a moment ago (cooldown) — not an
    // error, the user can still use that one.
    if (code) after(() => deliverOtp(email, code));
    return NextResponse.json({ ok: true, email });
  } catch (err) {
    if (err instanceof ServiceError) return NextResponse.json({ error: err.message }, { status: err.httpStatus });
    throw err;
  }
}
