import { adminDb } from "@/lib/firebase/admin";

// Real, promotable role stored on users/{uid}.role — not an env-var allowlist (that only
// bootstraps the *first* admin now, see the users/{uid} creation logic in
// api/auth/session/route.ts). Firestore rules deny all client writes to this doc (see
// firestore.rules), so the only way `role` is ever set is server-side, here or via
// /api/admin/users/[uid]/role.
export async function isAdmin(uid: string | null | undefined): Promise<boolean> {
  if (!uid) return false;
  const snap = await adminDb.collection("users").doc(uid).get();
  return snap.data()?.role === "admin";
}
