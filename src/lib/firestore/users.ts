import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import type { Role } from "@/lib/rbac";

export type UserProfile = {
  uid: string;
  email: string | null;
  displayName: string | null;
  role?: "admin" | "moderator";
  createdAt: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  // One shared favorites concept, not two: personalization (signup form, PersonalizationForm) and
  // /archive's heart icons both read and write these same three arrays — there's no separate
  // "archive favorites" field. The two surfaces do push different identifier schemes into them
  // though, since this app never unified driver/team/track identity across current-season data
  // (FastF1 codes like "VER", free-text team/track names) and archive/Ergast data (driverId slugs
  // like "max_verstappen", circuitId slugs, constructor names) — see pipeline/README.md. That's
  // safe to mix in one array: the two schemes never collide syntactically, and each surface only
  // ever checks membership using its own kind of id, so there's no false-positive risk.
  favoriteDrivers?: string[];
  favoriteTeams?: string[];
  favoriteTracks?: string[];
  notifyBeforeQualifying?: boolean;
  notifyOnResults?: boolean;
};

export type PreferencesPatch = Partial<
  Pick<UserProfile, "favoriteDrivers" | "favoriteTeams" | "favoriteTracks" | "notifyBeforeQualifying" | "notifyOnResults">
>;

export type NewProfileInput = {
  firstName: string;
  lastName: string;
  username: string;
  favoriteDrivers?: string[];
  favoriteTeams?: string[];
  favoriteTracks?: string[];
};

/** Creates users/{uid} once, at the end of the OTP-gated signup flow — never called for a
 * returning user, so there's no "never overwrite an existing doc" guard to worry about here
 * (complete-signup's route already rejects the call if a profile exists). The first admin is
 * granted here, once: if ADMIN_EMAILS (comma-separated) contains this email, the new profile is
 * created with role: "admin" directly. Every admin after that is granted via setUserRole from
 * the admin dashboard, not this env var. */
export async function createUserProfile(
  uid: string,
  email: string | null,
  displayName: string | null,
  input: NewProfileInput,
): Promise<void> {
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
    firstName: input.firstName,
    lastName: input.lastName,
    username: input.username,
    ...(input.favoriteDrivers?.length ? { favoriteDrivers: input.favoriteDrivers } : {}),
    ...(input.favoriteTeams?.length ? { favoriteTeams: input.favoriteTeams } : {}),
    ...(input.favoriteTracks?.length ? { favoriteTracks: input.favoriteTracks } : {}),
    ...(isBootstrapAdmin ? { role: "admin" as const } : {}),
  };
  await adminDb.collection("users").doc(uid).set(doc);
}

/** Exact-match, case-insensitive via a lowercased mirror isn't worth the extra field at this
 * scale - usernames are short and this collection isn't huge, so a direct query is fine. */
export async function isUsernameTaken(username: string): Promise<boolean> {
  const snap = await adminDb.collection("users").where("username", "==", username).limit(1).get();
  return !snap.empty;
}

/** A handful of deterministic variations (numeric suffixes) rather than anything clever - good
 * enough for "someone else already picked this exact word" without a whole word-association
 * generator. Stops as soon as it has 3 available options. */
export async function suggestUsernames(base: string): Promise<string[]> {
  const clean = base.toLowerCase().replace(/[^a-z0-9_]/g, "") || "fan";
  const suggestions: string[] = [];
  for (let i = 0; suggestions.length < 3 && i < 20; i++) {
    const candidate = i === 0 ? clean : `${clean}${Math.floor(Math.random() * 9000) + 100}`;
    if (!(await isUsernameTaken(candidate))) suggestions.push(candidate);
  }
  return suggestions;
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

/** Adds/removes one id from a favorites array — the one-at-a-time counterpart to
 * updateUserPreferences's whole-array replace above, used by /archive's heart icons (click once,
 * toggle one entry) rather than the personalization form (edit the whole list, then Save). Same
 * "client can't write users/{uid} directly" reasoning. See /api/archive/favorites. */
export async function setArchiveFavorite(
  uid: string,
  field: "favoriteDrivers" | "favoriteTeams" | "favoriteTracks",
  id: string,
  favorited: boolean,
): Promise<void> {
  await adminDb
    .collection("users")
    .doc(uid)
    .update({ [field]: favorited ? FieldValue.arrayUnion(id) : FieldValue.arrayRemove(id) });
}
