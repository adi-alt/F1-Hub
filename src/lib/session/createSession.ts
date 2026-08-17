import type { DecodedIdToken } from "firebase-admin/auth";
import { getSession } from "@/lib/session/getSession";
import { getUserRole } from "@/lib/session/getUserRole";

/** The one place the real iron-session cookie gets minted, used by both otp/verify (returning
 * user) and complete-signup (brand new one) - after this point Server Components can read who's
 * signed in without any further client round trip.
 *
 * `firstName`, when given, wins over the Firebase ID token's own `name` claim — that claim only
 * ever gets set by an OAuth provider (Google/GitHub), so it's null for every email/password
 * account, which is most of them. `firstName` is the profile's own field, collected at signup
 * and always present, so it's the reliable "what do we call this person" source. */
export async function createSessionFor(decoded: DecodedIdToken, firstName?: string | null) {
  const role = await getUserRole(decoded.uid);
  const session = await getSession();
  session.uid = decoded.uid;
  session.email = decoded.email ?? null;
  session.displayName = firstName ?? decoded.name ?? null;
  session.photoURL = decoded.picture ?? null;
  session.role = role;
  await session.save();
  return role;
}
