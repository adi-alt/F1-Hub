import { NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";
import { getUserProfile } from "@/lib/firestore/users";
import { createSessionFor } from "@/lib/session/createSession";
import { verifyOtp } from "@/lib/otp";

/**
 * Step 2: checks the code against what /api/auth/start sent. On success, branches on whether
 * this uid already has a profile - existing users are logged in immediately; new ones get a
 * short-lived "verified" window (see lib/otp.ts) that complete-signup checks, so the personal-
 * info step can't be reached by skipping the code entirely.
 */
export async function POST(request: Request) {
  const { idToken, code } = await request.json();
  if (typeof idToken !== "string" || typeof code !== "string") {
    return NextResponse.json({ error: "Missing idToken or code" }, { status: 400 });
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

  const result = await verifyOtp(decoded.email, code);
  if (result !== "ok") {
    const messages: Record<string, string> = {
      expired: "That code expired. Request a new one.",
      wrong: "That code isn't right.",
      "too-many": "Too many attempts — request a new code.",
    };
    return NextResponse.json({ error: messages[result] ?? "Verification failed." }, { status: 400 });
  }

  const profile = await getUserProfile(decoded.uid);
  if (!profile) {
    return NextResponse.json({ status: "needs-profile" });
  }

  const role = await createSessionFor(decoded);
  return NextResponse.json({ status: "logged-in", role });
}
