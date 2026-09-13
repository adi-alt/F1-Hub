import type { User } from "@supabase/supabase-js";
import { getSupabaseUser } from "@/lib/supabase/server";
import { createUserProfile, getUserProfile, isUsernameTaken } from "@/lib/supabase/users";
import { createSessionFor } from "@/lib/session/createSession";
import { clearOtp, isOtpVerified, prepareOtp, verifyOtp } from "@/lib/otp";
import type { Role } from "@/lib/rbac";
import { ServiceError } from "./errors";

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

/** The session lives in cookies now (see lib/supabase/server.ts) — there's no idToken for a
 * client to pass, so every step here just asks "who does this request's cookie say is signed
 * in", the same question adminAuth.verifyIdToken(idToken) used to answer. */
async function requireSupabaseUser(): Promise<User & { email: string }> {
  const user = await getSupabaseUser();
  if (!user) throw new ServiceError("Not signed in", 401);
  if (!user.email) throw new ServiceError("This account has no email address to verify.", 400);
  return user as User & { email: string };
}

/** Step 1 of sign-in/sign-up, every provider alike: confirms a Supabase session already exists
 * (set by the browser client for password sign-in, or by /auth/callback for OAuth) and preps an
 * OTP. Whether the account is new or returning isn't decided here — verifyOtpAndLogin branches on
 * that once the code comes back. Returns the code so the caller can schedule the actual email
 * send via next/server's after() — that deferral is a request-lifecycle concern, not business
 * logic, so it stays at the route/callback level rather than here. */
export async function startSignIn(): Promise<{ email: string; code: string | null }> {
  const user = await requireSupabaseUser();
  const prepared = await prepareOtp(user.email);
  return { email: user.email, code: prepared === "cooldown" ? null : prepared.code };
}

export type OtpLoginResult =
  | { status: "logged-in"; role: Role; displayName: string | null; uid: string; email: string; photoURL: string | null }
  | { status: "needs-profile" };

/** Step 2: checks the code against what startSignIn sent. On success, branches on whether this
 * uid already has a profile - existing users are logged in immediately; new ones get a
 * short-lived "verified" window (see lib/otp.ts) that completeSignup checks, so the personal-info
 * step can't be reached by skipping the code entirely. */
export async function verifyOtpAndLogin(code: string): Promise<OtpLoginResult> {
  const user = await requireSupabaseUser();

  const result = await verifyOtp(user.email, code);
  if (result !== "ok") {
    const messages: Record<string, string> = {
      expired: "That code expired. Request a new one.",
      wrong: "That code isn't right.",
      "too-many": "Too many attempts — request a new code.",
    };
    throw new ServiceError(messages[result] ?? "Verification failed.", 400);
  }

  const profile = await getUserProfile(user.id);
  if (!profile) return { status: "needs-profile" };

  const role = await createSessionFor(user, profile.firstName ?? null);
  const photoURL = (user.user_metadata?.avatar_url as string | undefined) ?? null;
  return { status: "logged-in", role, displayName: profile.firstName ?? null, uid: user.id, email: user.email, photoURL };
}

export type CompleteSignupInput = {
  firstName: string;
  lastName: string;
  username: string;
  favoriteDrivers?: string[];
  favoriteTeams?: string[];
  favoriteTracks?: string[];
};

/** Step 3, new accounts only: requires verifyOtpAndLogin's code check to have actually passed for
 * this email recently (see lib/otp.ts's verified window) rather than trusting the client's word
 * for it - calling this straight after startSignIn, skipping the code, is rejected the same as a
 * wrong code would be. */
export async function completeSignup(
  input: CompleteSignupInput,
): Promise<{ status: "logged-in"; role: Role; displayName: string | null; uid: string; email: string; photoURL: string | null }> {
  if (!input.firstName.trim()) throw new ServiceError("First name is required.", 400);
  if (!input.lastName.trim()) throw new ServiceError("Last name is required.", 400);
  if (!USERNAME_RE.test(input.username)) {
    throw new ServiceError("Username must be 3-20 characters: letters, numbers, or underscores.", 400);
  }

  const user = await requireSupabaseUser();

  if (!(await isOtpVerified(user.email))) {
    throw new ServiceError("Verify your email code first.", 403);
  }

  const existing = await getUserProfile(user.id);
  if (existing) throw new ServiceError("This account already has a profile.", 409);

  if (await isUsernameTaken(input.username)) {
    throw new ServiceError("That username is already taken.", 409);
  }

  // OAuth providers put a display name in user_metadata (key varies: Google/GitHub both commonly
  // use full_name, GitHub sometimes only user_name) - email/password accounts have none of this,
  // same "null for most accounts" situation Firebase's own `name` claim was in.
  const providerName = (user.user_metadata?.full_name ?? user.user_metadata?.name ?? null) as string | null;

  await createUserProfile(user.id, user.email, providerName, {
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    username: input.username,
    favoriteDrivers: input.favoriteDrivers,
    favoriteTeams: input.favoriteTeams,
    favoriteTracks: input.favoriteTracks,
  });
  await clearOtp(user.email);

  const firstName = input.firstName.trim();
  const role = await createSessionFor(user, firstName);
  const photoURL = (user.user_metadata?.avatar_url as string | undefined) ?? null;
  return { status: "logged-in", role, displayName: firstName, uid: user.id, email: user.email, photoURL };
}
