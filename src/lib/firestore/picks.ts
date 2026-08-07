import { adminDb } from "@/lib/firebase/admin";
import type { UserPick } from "@/lib/types/race";

/** Server-side read (Admin SDK) so pages can render a signed-in user's existing pick with no client fetch/flash. */
export async function getUserPick(uid: string, raceId: string): Promise<UserPick | null> {
  const snap = await adminDb.collection("users").doc(uid).collection("picks").doc(raceId).get();
  return snap.exists ? (snap.data() as UserPick) : null;
}
