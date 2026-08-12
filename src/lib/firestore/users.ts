import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";

export type UserProfile = {
  uid: string;
  email: string | null;
  displayName: string | null;
  role?: "admin";
  createdAt: string;
};

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

export async function listUsers(): Promise<UserProfile[]> {
  const snap = await adminDb.collection("users").get();
  return snap.docs.map((d) => d.data() as UserProfile);
}

export async function setUserRole(uid: string, role: "admin" | null): Promise<void> {
  await adminDb
    .collection("users")
    .doc(uid)
    .update({ role: role ?? FieldValue.delete() });
}
