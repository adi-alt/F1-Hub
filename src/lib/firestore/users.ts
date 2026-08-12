import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import type { Role } from "@/lib/rbac";

export type UserProfile = {
  uid: string;
  email: string | null;
  displayName: string | null;
  role?: "admin" | "moderator";
  createdAt: string;
  favoriteDriver?: string;
  favoriteTeam?: string;
  notifyBeforeQualifying?: boolean;
  notifyOnResults?: boolean;
};

export type PreferencesPatch = Partial<
  Pick<UserProfile, "favoriteDriver" | "favoriteTeam" | "notifyBeforeQualifying" | "notifyOnResults">
>;

/** Creates users/{uid} on a brand-new sign-in — never overwrites an existing doc, so a later
 * profile/preference update here is never clobbered by a subsequent sign-in. The first admin is
 * granted here, once: if ADMIN_EMAILS (comma-separated) contains this email and no doc exists yet
 * for it, this is the moment it's created with role: "admin". Every admin after that is granted
 * via setUserRole from the admin dashboard, not this env var. */
export async function ensureUserDoc(uid: string, email: string | null, displayName: string | null): Promise<void> {
  const ref = adminDb.collection("users").doc(uid);
  const existing = await ref.get();
  if (existing.exists) return;

  const allowlist = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const isBootstrapAdmin = !!email && allowlist.includes(email.toLowerCase());

  const doc: UserProfile = {
    uid,
    email,
    displayName,
    createdAt: new Date().toISOString(),
    ...(isBootstrapAdmin ? { role: "admin" as const } : {}),
  };
  await ref.set(doc);
}

/** Cursor-paginated, not "fetch everyone" — this collection is expected to grow into the
 * thousands, and Nexus's reference implementation (load every user into memory, filter
 * client-side) is exactly the pattern that doesn't hold up at that scale. `cursor` is the last
 * page's final doc id; pass it back in to get the next page. */
export async function listUsersPage(
  cursor: string | null,
  pageSize = 50,
): Promise<{ users: UserProfile[]; nextCursor: string | null }> {
  let query = adminDb.collection("users").orderBy("createdAt", "desc").limit(pageSize);
  if (cursor) {
    const cursorDoc = await adminDb.collection("users").doc(cursor).get();
    if (cursorDoc.exists) query = query.startAfter(cursorDoc);
  }
  const snap = await query.get();
  const users = snap.docs.map((d) => d.data() as UserProfile);
  const nextCursor = snap.docs.length === pageSize ? snap.docs[snap.docs.length - 1].id : null;
  return { users, nextCursor };
}

/** Exact-match lookup, deliberately not substring/prefix search — Firestore has no native
 * text search, and standing up a real search index isn't warranted at this stage (see
 * pipeline/PROGRESS.md-style honesty: this is the v1, not a promise it never grows). */
export async function getUserByEmail(email: string): Promise<UserProfile | null> {
  const snap = await adminDb.collection("users").where("email", "==", email).limit(1).get();
  return snap.empty ? null : (snap.docs[0].data() as UserProfile);
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await adminDb.collection("users").doc(uid).get();
  return snap.exists ? (snap.data() as UserProfile) : null;
}

export async function setUserRole(uid: string, role: Exclude<Role, "user"> | null): Promise<void> {
  await adminDb
    .collection("users")
    .doc(uid)
    .update({ role: role ?? FieldValue.delete() });
}

/** The only way users/{uid} preference fields ever change — client never writes this doc
 * directly (see firestore.rules), so every personalization/notification toggle goes through
 * this function via /api/users/me. */
export async function updateUserPreferences(uid: string, patch: PreferencesPatch): Promise<void> {
  await adminDb.collection("users").doc(uid).update(patch);
}
