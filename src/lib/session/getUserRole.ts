import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Role } from "@/lib/rbac";

// Real, promotable role stored on profiles.role — not an env-var allowlist (that only bootstraps
// the *first* admin, see createUserProfile in lib/supabase/users.ts). RLS denies all client
// writes to this column (see supabase/schema.sql), so the only way `role` is ever set is
// server-side, here or via /api/users/[uid]/role. Always a fresh read — the session's own cached
// `role` field exists only so the client UI can react instantly; every real permission decision
// goes through this function, never the cached value, so a demotion takes effect on the very next
// server check rather than waiting for a new sign-in.
export async function getUserRole(uid: string | null | undefined): Promise<Role> {
  if (!uid) return "user";
  const { data } = await supabaseAdmin.from("profiles").select("role").eq("id", uid).maybeSingle();
  const role = data?.role;
  return role === "admin" || role === "moderator" ? role : "user";
}
