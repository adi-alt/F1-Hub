import { getTransporter } from "@/lib/otp";
import {
  InviteConflictError,
  countPendingInvites,
  createInvite,
  getInviteByToken,
  listInvites,
  refreshInviteToken,
  revokeInvite,
  type InviteRole,
  type UserInvite,
} from "@/lib/supabase/invites";
import { getUserByEmail } from "@/lib/supabase/users";
import { requirePermission } from "@/lib/session/requirePermission";
import { ServiceError } from "@/services/errors";
import { MAX_BULK_INVITES } from "../_utils/inviteLimits";

// Same shape groups.ts's own inviteByEmail validates against — one definition of "looks like an
// email" for both invite paths rather than two that can drift.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export { MAX_BULK_INVITES } from "../_utils/inviteLimits";

export type InviteInput = { email: string; role: InviteRole };

export type InviteOutcome =
  | { email: string; ok: true; role: InviteRole }
  | { email: string; ok: false; reason: string };

export type SendInvitesResult = { sent: number; failed: number; results: InviteOutcome[] };

/** Inviting is gated on canManageRoles (admin), not on canViewUsers, because an invite can name
 * the role the account lands on — it is a deferred role grant, and must be exactly as protected
 * as changing a role directly. A moderator can still see who has been invited. */
async function requireInviter(requesterUid: string | null | undefined) {
  return requirePermission(requesterUid, (p) => p.canManageRoles);
}

function normalize(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Creates and mails one invitation per entry, reporting per-address outcomes rather than failing
 * the whole batch on the first bad row — a 40-address CSV with one typo and one already-invited
 * colleague should deliver the other 38, and say precisely what happened to the two.
 */
export async function sendInvites(
  requesterUid: string | null | undefined,
  entries: InviteInput[],
  origin: string,
): Promise<SendInvitesResult> {
  await requireInviter(requesterUid);

  if (entries.length === 0) throw new ServiceError("Add at least one email address.", 400);
  if (entries.length > MAX_BULK_INVITES) {
    throw new ServiceError(`Invite up to ${MAX_BULK_INVITES} people at a time.`, 400);
  }

  // Last entry wins on a duplicate address within one batch: a CSV listing someone twice with
  // two different roles is a mistake either way, and silently issuing two invites for one
  // mailbox (only one of which the unique index would accept) is the worse of the two readings.
  const deduped = new Map<string, InviteInput>();
  for (const entry of entries) deduped.set(normalize(entry.email), { email: normalize(entry.email), role: entry.role });

  const results: InviteOutcome[] = [];
  for (const entry of deduped.values()) {
    results.push(await inviteOne(entry, requesterUid ?? null, origin));
  }

  const sent = results.filter((r) => r.ok).length;
  return { sent, failed: results.length - sent, results };
}

async function inviteOne(entry: InviteInput, invitedBy: string | null, origin: string): Promise<InviteOutcome> {
  const { email, role } = entry;
  if (!EMAIL_RE.test(email)) return { email, ok: false, reason: "Not a valid email address" };

  try {
    // Checked before minting a row so re-inviting an existing member reports something true and
    // useful instead of leaving a permanently unredeemable invite behind them — redemption only
    // ever runs during signup, so an account that already exists would never consume it.
    if (await getUserByEmail(email)) return { email, ok: false, reason: "Already has an account" };

    const { token } = await createInvite(email, role, invitedBy);
    await deliverInviteEmail(email, role, token, origin);
    return { email, ok: true, role };
  } catch (err) {
    if (err instanceof InviteConflictError) return { email, ok: false, reason: "Already invited" };
    // One address failing to send must not take the batch down with it; the reason is reported
    // back to the admin, and logged for whoever is watching delivery.
    console.error(`[invites] failed for ${email}:`, err);
    return { email, ok: false, reason: err instanceof Error ? err.message : "Could not send invitation" };
  }
}

export async function getInvites(requesterUid: string | null | undefined): Promise<UserInvite[]> {
  // Read is the weaker permission on purpose — a moderator can already see the user list, and
  // "who has been invited but hasn't joined yet" is the same class of information.
  await requirePermission(requesterUid, (p) => p.canViewUsers);
  return listInvites();
}

export async function getPendingInviteCount(requesterUid: string | null | undefined): Promise<number> {
  await requirePermission(requesterUid, (p) => p.canViewUsers);
  return countPendingInvites();
}

export async function revoke(requesterUid: string | null | undefined, id: string): Promise<void> {
  await requireInviter(requesterUid);
  await revokeInvite(id);
}

/** Rotates the token, restarts the clock, and re-sends. A resend on an invite that is no longer
 * pending (already accepted, already revoked) finds nothing to update and says so rather than
 * mailing a link that could never work. */
export async function resend(requesterUid: string | null | undefined, id: string, origin: string): Promise<void> {
  await requireInviter(requesterUid);
  const refreshed = await refreshInviteToken(id);
  if (!refreshed) throw new ServiceError("That invitation is no longer pending.", 409);
  await deliverInviteEmail(refreshed.invite.email, refreshed.invite.role, refreshed.token, origin);
}

/** Public, unauthenticated: the signup page calls this with the token from an invite link to show
 * "you've been invited" and pre-fill the address. Returns only the email and role — never the
 * inviter, the id, or anything else about the account — because anyone holding the link can
 * reach it. */
export async function peekInvite(token: string): Promise<{ email: string; role: InviteRole } | null> {
  const invite = await getInviteByToken(token);
  return invite ? { email: invite.email, role: invite.role } : null;
}

function roleDescription(role: InviteRole): string {
  if (role === "admin") return "You'll join as an <strong>admin</strong>, with full access to user management and the prediction pipeline.";
  if (role === "moderator") return "You'll join as a <strong>moderator</strong>, able to review users and moderate picks.";
  return "You'll join as a member, with predictions, communities and the full race archive.";
}

// Table-based layout with inline styles throughout, matching lib/otp.ts's own email - the only
// markup that survives Gmail/Outlook stripping <style> blocks and ignoring flex/grid.
function buildInviteEmailHtml(email: string, role: InviteRole, link: string): string {
  const year = new Date().getFullYear();
  return `
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a0c;padding:40px 16px;font-family:Arial,Helvetica,sans-serif;">
  <tr><td align="center">
    <table width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#17171a;border:1px solid #2c2c31;border-radius:16px;overflow:hidden;">
      <tr><td style="background-color:#e10600;height:5px;font-size:0;line-height:0;">&nbsp;</td></tr>
      <tr>
        <td style="padding:32px 32px 0 32px;">
          <table cellpadding="0" cellspacing="0"><tr>
            <td style="width:6px;height:20px;background-color:#e10600;border-radius:3px;"></td>
            <td style="padding-left:10px;font-size:18px;font-weight:700;color:#f2f2f3;letter-spacing:0.5px;">F1 HUB</td>
          </tr></table>
        </td>
      </tr>
      <tr>
        <td style="padding:28px 32px 6px 32px;font-size:22px;font-weight:700;color:#f2f2f3;">
          You&rsquo;re invited to F1 Hub
        </td>
      </tr>
      <tr>
        <td style="padding:0 32px 22px 32px;font-size:14px;line-height:1.6;color:#9a9aa2;">
          An admin invited <span style="color:#f2f2f3;">${email}</span> to join F1 Hub &mdash; race predictions, championship analysis and a full archive of the sport.
          ${roleDescription(role)}
        </td>
      </tr>
      <tr>
        <td style="padding:0 32px 26px 32px;">
          <table cellpadding="0" cellspacing="0"><tr>
            <td style="background-color:#e10600;border-radius:8px;">
              <a href="${link}" style="display:inline-block;padding:13px 26px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">Accept invitation</a>
            </td>
          </tr></table>
        </td>
      </tr>
      <tr>
        <td style="padding:0 32px 26px 32px;font-size:12px;line-height:1.6;color:#63636c;">
          We&rsquo;ll email you a one-time code to confirm it&rsquo;s really you, so this link alone can&rsquo;t be used by anyone else. It expires in 14 days.
        </td>
      </tr>
      <tr>
        <td style="padding:0 32px 24px 32px;font-size:12px;line-height:1.6;color:#63636c;border-top:1px solid #2c2c31;padding-top:20px;">
          Not expecting this? You can safely ignore this email &mdash; no account was created for you.
        </td>
      </tr>
      <tr><td style="padding:0 32px 28px 32px;font-size:11px;color:#45454c;">&copy; ${year} F1 Hub. All rights reserved.</td></tr>
    </table>
  </td></tr>
</table>`.trim();
}

async function deliverInviteEmail(email: string, role: InviteRole, token: string, origin: string): Promise<void> {
  // No app-wide base-URL env var exists in this codebase (same finding groups.ts's inviteByEmail
  // documents) — the route handler derives the origin from the incoming request and passes it in.
  const link = `${origin}/?invite=${encodeURIComponent(token)}`;
  await getTransporter().sendMail({
    from: `"Apex F1 Hub" <${process.env.MAIL_FROM}>`,
    to: email,
    subject: "You're invited to join F1 Hub",
    text: `An admin invited you to join F1 Hub. Accept your invitation: ${link}\n\nWe'll email you a one-time code to confirm it's really you. This link expires in 14 days.`,
    html: buildInviteEmailHtml(email, role, link),
  });
}

export type { UserInvite, InviteRole };
