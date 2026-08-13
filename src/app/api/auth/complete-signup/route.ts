import { NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";
import { createUserProfile, getUserProfile, isUsernameTaken } from "@/lib/firestore/users";
import { createSessionFor } from "@/lib/session/createSession";
import { isOtpVerified, clearOtp } from "@/lib/otp";

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

/** Step 3, new accounts only: requires otp/verify to have actually passed for this email
 * recently (see lib/otp.ts's verified window) rather than trusting the client's word for it -
 * calling this straight after /start, skipping the code, is rejected the same as a wrong code
 * would be. */
export async function POST(request: Request) {
  const body = await request.json();
  const { idToken, firstName, lastName, username, favoriteDriver, favoriteTeam, favoriteTrack } = body;

  if (typeof idToken !== "string") return NextResponse.json({ error: "Missing idToken" }, { status: 400 });
  if (typeof firstName !== "string" || !firstName.trim()) {
    return NextResponse.json({ error: "First name is required." }, { status: 400 });
  }
  if (typeof lastName !== "string" || !lastName.trim()) {
    return NextResponse.json({ error: "Last name is required." }, { status: 400 });
  }
  if (typeof username !== "string" || !USERNAME_RE.test(username)) {
    return NextResponse.json(
      { error: "Username must be 3-20 characters: letters, numbers, or underscores." },
      { status: 400 },
    );
  }

  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(idToken);
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }
  if (!decoded.email) return NextResponse.json({ error: "This account has no email address." }, { status: 400 });

  if (!(await isOtpVerified(decoded.email))) {
    return NextResponse.json({ error: "Verify your email code first." }, { status: 403 });
  }

  const existing = await getUserProfile(decoded.uid);
  if (existing) return NextResponse.json({ error: "This account already has a profile." }, { status: 409 });

  if (await isUsernameTaken(username)) {
    return NextResponse.json({ error: "That username is already taken." }, { status: 409 });
  }

  await createUserProfile(decoded.uid, decoded.email, decoded.name ?? null, {
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    username,
    favoriteDriver: typeof favoriteDriver === "string" ? favoriteDriver : undefined,
    favoriteTeam: typeof favoriteTeam === "string" ? favoriteTeam : undefined,
    favoriteTrack: typeof favoriteTrack === "string" ? favoriteTrack : undefined,
  });
  await clearOtp(decoded.email);

  const role = await createSessionFor(decoded);
  return NextResponse.json({ status: "logged-in", role });
}
