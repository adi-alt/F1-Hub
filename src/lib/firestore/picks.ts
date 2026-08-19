import { adminDb } from "@/lib/firebase/admin";
import type { UserPick } from "@/lib/types/race";

/** Server-side read (Admin SDK) so pages can render a signed-in user's existing pick with no client fetch/flash. */
export async function getUserPick(uid: string, raceId: string): Promise<UserPick | null> {
  const snap = await adminDb.collection("users").doc(uid).collection("picks").doc(raceId).get();
  return snap.exists ? (snap.data() as UserPick) : null;
}

/** The write side of the same doc. Used to go straight from the client via the Firestore SDK
 * (allowed by firestore.rules for a signed-in user's own uid) - now routed through /api/picks
 * instead, since sign-in no longer touches Firebase Auth at all, so there's no `request.auth` for
 * those rules to check anymore. Everything server-side still goes through the Admin SDK either
 * way, same as every other write in this app. */
export async function saveUserPick(uid: string, pick: UserPick): Promise<void> {
  await adminDb.collection("users").doc(uid).collection("picks").doc(pick.raceId).set(pick);
}
