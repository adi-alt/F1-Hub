import { getSession } from "@/lib/session/getSession";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * The signed-in user when they are a site admin, else null. Read from the profile on every call, not from the
 * session: the session's `role` is a copy taken at sign-in, so revoking an admin would otherwise take effect
 * only when their session ends. ADMIN_EMAILS is the same bootstrap allow-list createUserProfile and the
 * archive diagnostic use, checked against the profile's own email.
 */
export async function getSiteAdmin(): Promise<{ uid: string } | null> {
  const session = await getSession();
  if (!session.uid) return null;
  const { data, error } = await supabaseAdmin.from("profiles").select("role, email").eq("id", session.uid).maybeSingle();
  if (error || !data) return null;
  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const isAdmin = data.role === "admin" || (!!data.email && adminEmails.includes(String(data.email).toLowerCase()));
  return isAdmin ? { uid: session.uid } : null;
}
