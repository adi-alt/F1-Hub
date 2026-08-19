import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Role } from "@/lib/rbac";

// Same shape the old Firestore-backed UserProfile always had.
export type UserProfile = {
  uid: string;
  email: string | null;
  displayName: string | null;
  role?: "admin" | "moderator";
  createdAt: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  favoriteDrivers?: string[];
  favoriteTeams?: string[];
  favoriteTracks?: string[];
  notifyBeforeQualifying?: boolean;
  notifyOnResults?: boolean;
};

export type PreferencesPatch = Partial<
  Pick<
    UserProfile,
    "favoriteDrivers" | "favoriteTeams" | "favoriteTracks" | "notifyBeforeQualifying" | "notifyOnResults" | "firstName"
  >
>;

export type NewProfileInput = {
  firstName: string;
  lastName: string;
  username: string;
  favoriteDrivers?: string[];
  favoriteTeams?: string[];
  favoriteTracks?: string[];
};

// profiles table is snake_case (Postgres convention); the rest of the app still speaks the same
// camelCase UserProfile it always has — this is the one place that translation happens.
type ProfileRow = {
  id: string;
  email: string | null;
  display_name: string | null;
  role: "admin" | "moderator" | null;
  created_at: string;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  favorite_drivers: string[];
  favorite_teams: string[];
  favorite_tracks: string[];
  notify_before_qualifying: boolean;
  notify_on_results: boolean;
};

function fromRow(row: ProfileRow): UserProfile {
  return {
    uid: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role ?? undefined,
    createdAt: row.created_at,
    firstName: row.first_name ?? undefined,
    lastName: row.last_name ?? undefined,
    username: row.username ?? undefined,
    favoriteDrivers: row.favorite_drivers?.length ? row.favorite_drivers : undefined,
    favoriteTeams: row.favorite_teams?.length ? row.favorite_teams : undefined,
    favoriteTracks: row.favorite_tracks?.length ? row.favorite_tracks : undefined,
    notifyBeforeQualifying: row.notify_before_qualifying,
    notifyOnResults: row.notify_on_results,
  };
}

/** Creates profiles/{uid} once, at the end of the OTP-gated signup flow — same bootstrap-admin
 * rule as before (ADMIN_EMAILS), just pointed at Postgres. `uid` is the Supabase auth user's own
 * id, not a separately-generated one — profiles.id is a foreign key straight to auth.users(id). */
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

  const { error } = await supabaseAdmin.from("profiles").insert({
    id: uid,
    email,
    display_name: displayName,
    first_name: input.firstName,
    last_name: input.lastName,
    username: input.username,
    favorite_drivers: input.favoriteDrivers ?? [],
    favorite_teams: input.favoriteTeams ?? [],
    favorite_tracks: input.favoriteTracks ?? [],
    ...(isBootstrapAdmin ? { role: "admin" as const } : {}),
  });
  if (error) throw error;
}

/** Exact-match, case-insensitive via a lowercased mirror isn't worth the extra column at this
 * scale - usernames are short and this table isn't huge, so a direct query is fine. */
export async function isUsernameTaken(username: string): Promise<boolean> {
  const { count } = await supabaseAdmin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("username", username);
  return !!count && count > 0;
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

/** Cursor-paginated, not "fetch everyone" — same reasoning as the Firestore version: this table
 * is expected to grow into the thousands, and loading it all into memory doesn't hold up at that
 * scale. `cursor` is the last page's final row id; pass it back in to get the next page. */
export async function listUsersPage(
  cursor: string | null,
  pageSize = 50,
): Promise<{ users: UserProfile[]; nextCursor: string | null }> {
  let query = supabaseAdmin.from("profiles").select("*").order("created_at", { ascending: false }).limit(pageSize);
  if (cursor) {
    const { data: cursorRow } = await supabaseAdmin.from("profiles").select("created_at").eq("id", cursor).single();
    if (cursorRow) query = query.lt("created_at", cursorRow.created_at);
  }
  const { data } = await query;
  const rows = (data ?? []) as ProfileRow[];
  const nextCursor = rows.length === pageSize ? rows[rows.length - 1].id : null;
  return { users: rows.map(fromRow), nextCursor };
}

/** Exact-match lookup, deliberately not substring/prefix search — same v1-not-a-promise framing
 * as the Firestore version; a real search index isn't warranted at this stage. */
export async function getUserByEmail(email: string): Promise<UserProfile | null> {
  const { data } = await supabaseAdmin.from("profiles").select("*").eq("email", email).maybeSingle();
  return data ? fromRow(data as ProfileRow) : null;
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const { data } = await supabaseAdmin.from("profiles").select("*").eq("id", uid).maybeSingle();
  return data ? fromRow(data as ProfileRow) : null;
}

export async function setUserRole(uid: string, role: Exclude<Role, "user"> | null): Promise<void> {
  await supabaseAdmin.from("profiles").update({ role }).eq("id", uid);
}

/** The only way profiles/{uid} preference fields ever change — client never writes this row
 * directly (RLS only allows a user to touch their own row anyway, but the app still always goes
 * through the server, same as the Firestore rules version), every personalization/notification
 * toggle goes through this function via /api/users/me. */
export async function updateUserPreferences(uid: string, patch: PreferencesPatch): Promise<void> {
  const update: Record<string, unknown> = {};
  if (patch.favoriteDrivers !== undefined) update.favorite_drivers = patch.favoriteDrivers;
  if (patch.favoriteTeams !== undefined) update.favorite_teams = patch.favoriteTeams;
  if (patch.favoriteTracks !== undefined) update.favorite_tracks = patch.favoriteTracks;
  if (patch.notifyBeforeQualifying !== undefined) update.notify_before_qualifying = patch.notifyBeforeQualifying;
  if (patch.notifyOnResults !== undefined) update.notify_on_results = patch.notifyOnResults;
  if (patch.firstName !== undefined) update.first_name = patch.firstName;
  if (Object.keys(update).length === 0) return;
  await supabaseAdmin.from("profiles").update(update).eq("id", uid);
}

const FAVORITE_COLUMN: Record<"favoriteDrivers" | "favoriteTeams" | "favoriteTracks", string> = {
  favoriteDrivers: "favorite_drivers",
  favoriteTeams: "favorite_teams",
  favoriteTracks: "favorite_tracks",
};

/** Adds/removes one id from a favorites array — the one-at-a-time counterpart to
 * updateUserPreferences's whole-array replace above, used by /archive's heart icons. Firestore's
 * arrayUnion/arrayRemove were atomic; Postgres via PostgREST has no equivalent single-round-trip
 * op, so this reads then writes instead — a race only matters if the same user double-clicks the
 * same heart from two tabs at once, which is harmless either way (same final state either order).
 */
export async function setArchiveFavorite(
  uid: string,
  field: "favoriteDrivers" | "favoriteTeams" | "favoriteTracks",
  id: string,
  favorited: boolean,
): Promise<void> {
  const column = FAVORITE_COLUMN[field];
  const { data } = await supabaseAdmin.from("profiles").select(column).eq("id", uid).maybeSingle<Record<string, string[]>>();
  const current = data?.[column] ?? [];
  const next = favorited ? [...new Set([...current, id])] : current.filter((v) => v !== id);
  await supabaseAdmin.from("profiles").update({ [column]: next }).eq("id", uid);
}
