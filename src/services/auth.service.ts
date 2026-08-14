import type { DecodedIdToken } from "firebase-admin/auth";
import { adminAuth } from "@/lib/firebase/admin";
import { createUserProfile, getUserProfile, isUsernameTaken } from "@/lib/firestore/users";
import { createSessionFor } from "@/lib/session/createSession";
import { clearOtp, isOtpVerified, prepareOtp, verifyOtp } from "@/lib/otp";
import type { Role } from "@/lib/rbac";
import { ServiceError } from "./errors";

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

async function verifyToken(idToken: string): Promise<DecodedIdToken & { email: string }> {
  let decoded: DecodedIdToken;
  try {
    decoded = await adminAuth.verifyIdToken(idToken);
  } catch {
    throw new ServiceError("Invalid token", 401);
  }
  if (!decoded.email) throw new ServiceError("This account has no email address to verify.", 400);
  return decoded as DecodedIdToken & { email: string };
}

/** Step 1 of sign-in/sign-up, every provider alike: verifies the client's Firebase ID token and
 * preps an OTP. Whether the account is new or returning isn't decided here — verifyOtpAndLogin
 * branches on that once the code comes back. Returns the code so the route can schedule the
 * actual email send via next/server's after() — that deferral is a request-lifecycle concern,
 * not business logic, so it stays in the route rather than this layer. */
export async function startSignIn(idToken: string): Promise<{ email: string; code: string | null }> {
  const decoded = await verifyToken(idToken);
  const prepared = await prepareOtp(decoded.email);
  return { email: decoded.email, code: prepared === "cooldown" ? null : prepared.code };
}

export type OtpLoginResult = { status: "logged-in"; role: Role } | { status: "needs-profile" };

/** Step 2: checks the code against what startSignIn sent. On success, branches on whether this
 * uid already has a profile - existing users are logged in immediately; new ones get a
 * short-lived "verified" window (see lib/otp.ts) that completeSignup checks, so the personal-info
 * step can't be reached by skipping the code entirely. */
export async function verifyOtpAndLogin(idToken: string, code: string): Promise<OtpLoginResult> {
  const decoded = await verifyToken(idToken);

  const result = await verifyOtp(decoded.email, code);
  if (result !== "ok") {
    const messages: Record<string, string> = {
      expired: "That code expired. Request a new one.",
      wrong: "That code isn't right.",
      "too-many": "Too many attempts — request a new code.",
    };
    throw new ServiceError(messages[result] ?? "Verification failed.", 400);
  }

  const profile = await getUserProfile(decoded.uid);
  if (!profile) return { status: "needs-profile" };

  const role = await createSessionFor(decoded);
  return { status: "logged-in", role };
}

export type CompleteSignupInput = {
  firstName: string;
  lastName: string;
  username: string;
  favoriteDriver?: string;
  favoriteTeam?: string;
  favoriteTrack?: string;
};

/** Step 3, new accounts only: requires verifyOtpAndLogin's code check to have actually passed for
 * this email recently (see lib/otp.ts's verified window) rather than trusting the client's word
 * for it - calling this straight after startSignIn, skipping the code, is rejected the same as a
 * wrong code would be. */
export async function completeSignup(
  idToken: string,
  input: CompleteSignupInput,
): Promise<{ status: "logged-in"; role: Role }> {
  if (!input.firstName.trim()) throw new ServiceError("First name is required.", 400);
  if (!input.lastName.trim()) throw new ServiceError("Last name is required.", 400);
  if (!USERNAME_RE.test(input.username)) {
    throw new ServiceError("Username must be 3-20 characters: letters, numbers, or underscores.", 400);
  }

  const decoded = await verifyToken(idToken);

  if (!(await isOtpVerified(decoded.email))) {
    throw new ServiceError("Verify your email code first.", 403);
  }

  const existing = await getUserProfile(decoded.uid);
  if (existing) throw new ServiceError("This account already has a profile.", 409);

  if (await isUsernameTaken(input.username)) {
    throw new ServiceError("That username is already taken.", 409);
  }

  await createUserProfile(decoded.uid, decoded.email, decoded.name ?? null, {
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    username: input.username,
    favoriteDriver: input.favoriteDriver,
    favoriteTeam: input.favoriteTeam,
    favoriteTrack: input.favoriteTrack,
  });
  await clearOtp(decoded.email);

  const role = await createSessionFor(decoded);
  return { status: "logged-in", role };
}
