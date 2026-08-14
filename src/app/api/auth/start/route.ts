import { NextResponse } from "next/server";
import { after } from "next/server";
import { deliverOtp } from "@/lib/otp";
import { startSignIn } from "@/services/auth.service";
import { ServiceError } from "@/services/errors";

export async function POST(request: Request) {
  const { idToken } = await request.json();
  if (typeof idToken !== "string" || !idToken) {
    return NextResponse.json({ error: "Missing idToken" }, { status: 400 });
  }

  try {
    const { email, code } = await startSignIn(idToken);
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
