import { adminDb } from "@/lib/firebase/admin";
import type { Role } from "@/lib/rbac";

// Real, promotable role stored on users/{uid}.role — not an env-var allowlist (that only
// bootstraps the *first* admin, see the users/{uid} creation logic in
// api/auth/session/route.ts). Firestore rules deny all client writes to this doc (see
// firestore.rules), so the only way `role` is ever set is server-side, here or via
// /api/admin/users/[uid]/role. Always a fresh Firestore read — the session's own cached
// `role` field exists only so the client UI can react instantly; every real permission
// decision goes through this function, never the cached value, so a demotion takes effect
// on the very next server check rather than waiting for a new sign-in.
export async function getUserRole(uid: string | null | undefined): Promise<Role> {
  if (!uid) return "user";
  const snap = await adminDb.collection("users").doc(uid).get();
  const role = snap.data()?.role;
  return role === "admin" || role === "moderator" ? role : "user";
}
