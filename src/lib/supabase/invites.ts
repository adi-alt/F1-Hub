import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { queryWithRetry } from "@/lib/supabase/queryWithRetry";
import type { Role } from "@/lib/rbac";

/** Two weeks. Long enough that an invite sent on a Friday survives a holiday, short enough that
 * a forgotten one doesn't stay live indefinitely — an expired invite is a no-op at redemption,
 * so this is the window in which an admin's intent still counts. */
const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export type InviteRole = Exclude<Role, "user"> | null;

export type UserInvite = {
  id: string;
  email: string;
  role: InviteRole;
  invitedBy: string | null;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
};

/** Derived rather than stored: a row does not become "expired" by being written to, it becomes
 * expired by the clock moving. Storing it would mean a status that is wrong until something
 * happens to run an update over the table. */
export type InviteStatus = "pending" | "accepted" | "revoked" | "expired";

export function inviteStatus(invite: UserInvite, now = Date.now()): InviteStatus {
  if (invite.acceptedAt) return "accepted";
  if (invite.revokedAt) return "revoked";
  if (new Date(invite.expiresAt).getTime() < now) return "expired";
  return "pending";
}

type InviteRow = {
  id: string;
  email: string;
  role: "admin" | "moderator" | null;
  invited_by: string | null;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
};

function fromRow(row: InviteRow): UserInvite {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    invitedBy: row.invited_by,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    acceptedAt: row.accepted_at,
    revokedAt: row.revoked_at,
  };
}

const COLUMNS = "id, email, role, invited_by, created_at, expires_at, accepted_at, revoked_at";

/** The token is a bearer *convenience*, never a credential — see the migration's header comment.
 * Only its SHA-256 lands in the table, so the plaintext exists exactly twice: in the return value
 * below (long enough to build one email) and in that email. 32 random bytes is well past any
 * brute-force concern, and base64url keeps it safe to paste into a URL unescaped. */
function mintToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashToken(token) };
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export class InviteConflictError extends Error {
  constructor(public readonly email: string) {
    super(`${email} already has a pending invitation.`);
    this.name = "InviteConflictError";
  }
}

/** Creates one pending invite and hands back the plaintext token for the email.
 *
 * Relies on the partial unique index (see the migration) rather than a read-then-write check:
 * two admins inviting the same person at the same moment is precisely the race a pre-check
 * loses, and the database is the only place that can actually settle it. 23505 is Postgres'
 * unique_violation. */
export async function createInvite(email: string, role: InviteRole, invitedBy: string | null): Promise<{ invite: UserInvite; token: string }> {
  const { token, tokenHash } = mintToken();
  const { data, error } = await supabaseAdmin
    .from("user_invites")
    .insert({
      email: email.trim().toLowerCase(),
      role,
      token_hash: tokenHash,
      invited_by: invitedBy,
      expires_at: new Date(Date.now() + INVITE_TTL_MS).toISOString(),
    })
    .select(COLUMNS)
    .single();

  if (error?.code === "23505") throw new InviteConflictError(email);
  if (error) throw new Error(`createInvite(${email}): ${error.message}`);
  return { invite: fromRow(data as InviteRow), token };
}

/** Newest first, every status — the admin table renders status per row (and filters client-side),
 * so filtering here would just be a second, divergent source of the same truth. */
export async function listInvites(limit = 200): Promise<UserInvite[]> {
  const { data, error } = await queryWithRetry(() =>
    supabaseAdmin.from("user_invites").select(COLUMNS).order("created_at", { ascending: false }).limit(limit),
  );
  if (error) throw new Error(`listInvites: ${error.message}`);
  return ((data ?? []) as InviteRow[]).map(fromRow);
}

/** The redemption lookup, called once per completed signup. Deliberately matches on email only —
 * the caller must already have established that the session owns this address. */
export async function getPendingInviteForEmail(email: string): Promise<UserInvite | null> {
  const { data, error } = await queryWithRetry(() =>
    supabaseAdmin
      .from("user_invites")
      .select(COLUMNS)
      .ilike("email", email.trim().toLowerCase())
      .is("accepted_at", null)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle(),
  );
  if (error) throw new Error(`getPendingInviteForEmail: ${error.message}`);
  return data ? fromRow(data as InviteRow) : null;
}

/** Looks an invite up by the token from an email link, for the signup page's "you've been
 * invited" banner. Returns the invite only while it is genuinely still pending.
 *
 * The lookup is by hash, so it is a single indexed equality match and the plaintext token never
 * needs to be compared in the application. The timingSafeEqual below therefore guards nothing
 * that the database has not already decided — it is here so that adding a plaintext comparison
 * later can't quietly reintroduce a timing oracle. */
export async function getInviteByToken(token: string): Promise<UserInvite | null> {
  const tokenHash = hashToken(token);
  const { data, error } = await queryWithRetry(() =>
    supabaseAdmin.from("user_invites").select(`${COLUMNS}, token_hash`).eq("token_hash", tokenHash).maybeSingle(),
  );
  if (error) throw new Error(`getInviteByToken: ${error.message}`);
  if (!data) return null;

  const stored = Buffer.from((data as InviteRow & { token_hash: string }).token_hash, "hex");
  const offered = Buffer.from(tokenHash, "hex");
  if (stored.length !== offered.length || !timingSafeEqual(stored, offered)) return null;

  const invite = fromRow(data as InviteRow);
  return inviteStatus(invite) === "pending" ? invite : null;
}

/** Closes the invite out. Scoped to rows that are still pending so a double-submitted signup
 * can't reopen or re-stamp one that another request already settled. */
export async function markInviteAccepted(id: string, acceptedBy: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("user_invites")
    .update({ accepted_at: new Date().toISOString(), accepted_by: acceptedBy })
    .eq("id", id)
    .is("accepted_at", null)
    .is("revoked_at", null);
  if (error) throw new Error(`markInviteAccepted(${id}): ${error.message}`);
}

/** Revoking is a stamp, not a delete: the row stays as the record that this person was invited
 * and that the invitation was withdrawn. The partial unique index ignores revoked rows, so the
 * same address can be invited again straight afterwards. */
export async function revokeInvite(id: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("user_invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .is("accepted_at", null)
    .is("revoked_at", null);
  if (error) throw new Error(`revokeInvite(${id}): ${error.message}`);
}

/** Replaces a pending invite's token with a fresh one and restarts its expiry, for "resend".
 * Rotating rather than re-mailing the old token means a resend also repairs the case where the
 * first link expired, and leaves any forwarded copy of the old link inert. */
export async function refreshInviteToken(id: string): Promise<{ invite: UserInvite; token: string } | null> {
  const { token, tokenHash } = mintToken();
  const { data, error } = await supabaseAdmin
    .from("user_invites")
    .update({ token_hash: tokenHash, expires_at: new Date(Date.now() + INVITE_TTL_MS).toISOString() })
    .eq("id", id)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .select(COLUMNS)
    .maybeSingle();
  if (error) throw new Error(`refreshInviteToken(${id}): ${error.message}`);
  return data ? { invite: fromRow(data as InviteRow), token } : null;
}

/** Pending-only count for the Users page's stat tiles. `head: true` fetches no rows. */
export async function countPendingInvites(): Promise<number> {
  const { count, error } = await queryWithRetry(() =>
    supabaseAdmin
      .from("user_invites")
      .select("id", { count: "exact", head: true })
      .is("accepted_at", null)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString()),
  );
  if (error) throw new Error(`countPendingInvites: ${error.message}`);
  return count ?? 0;
}
