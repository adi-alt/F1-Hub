import type { DecodedIdToken } from "firebase-admin/auth";
import { getSession } from "@/lib/session/getSession";
import { getUserRole } from "@/lib/session/getUserRole";

/** The one place the real iron-session cookie gets minted, used by both otp/verify (returning
 * user) and complete-signup (brand new one) - after this point Server Components can read who's
 * signed in without any further client round trip. */
export async function createSessionFor(decoded: DecodedIdToken) {
  const role = await getUserRole(decoded.uid);
  const session = await getSession();
  session.uid = decoded.uid;
  session.email = decoded.email ?? null;
  session.displayName = decoded.name ?? null;
  session.photoURL = decoded.picture ?? null;
  session.role = role;
  await session.save();
  return role;
}
