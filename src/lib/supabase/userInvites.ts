import { getTransporter } from "@/lib/otp";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { queryWithRetry } from "@/lib/supabase/queryWithRetry";
import { ServiceError } from "@/services/errors";

/** Its own module rather than a function inside users.ts, for the same reason
 * groupPredictionTypes.ts exists separately from groupPredictions.ts: this reaches otp.ts for the
 * shared SMTP transporter, which imports nodemailer - a Node-only package that crashes the client
 * bundle the instant anything client-side pulls it in. users.ts is imported (type-only, but still)
 * by the Users page's own client components, so the mailer stays out of it. */

/** Same cap and same validation shape the community-invite path already uses (groups.ts's
 * inviteByEmail) - one invite flow's rules shouldn't quietly differ from the other's. */
const MAX_INVITE_EMAILS = 10;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type InviteResult = {
  sent: string[];
  /** Addresses that already have an account - not an error, and deliberately not emailed again:
   * "come join F1 Hub" to someone who is already a member is noise, and it would also leak to the
   * inviter nothing they couldn't already see in this very table. */
  alreadyMembers: string[];
};

/**
 * Invites people to F1 Hub by email, from the admin Users page.
 *
 * Deliberately a real email and nothing else. F1 Hub's signup is open - there is no allowlist to
 * add someone to, and no pre-created account to hand a role to - so this does not write a
 * placeholder "invited" row, and the Users table does not grow a fake pending person who never
 * actually signed up. The invitee gets a genuine link, signs up through the normal OTP flow, and
 * appears in the table like anyone else; an admin then sets their role with the control that's
 * already in every row. Anything more than that would be inventing state this app doesn't have.
 *
 * Reuses getTransporter() - the same Resend SMTP relay that already sends OTP and community
 * invites, so there's one mail path in this codebase, not three.
 */
export async function inviteUsersByEmail(emails: string[], origin: string, inviterName: string | null): Promise<InviteResult> {
  const cleaned = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (cleaned.length === 0) throw new ServiceError("Add at least one email address.", 400);
  if (cleaned.length > MAX_INVITE_EMAILS) throw new ServiceError(`Invite up to ${MAX_INVITE_EMAILS} people at a time.`, 400);
  const invalid = cleaned.find((e) => !EMAIL_RE.test(e));
  if (invalid) throw new ServiceError(`"${invalid}" isn't a valid email address.`, 400);

  // One query for the whole batch, not one per address.
  const { data: existing, error } = await queryWithRetry(() => supabaseAdmin.from("profiles").select("email").in("email", cleaned));
  if (error) throw new Error(`inviteUsersByEmail: ${error.message}`);
  const taken = new Set(((existing ?? []) as { email: string | null }[]).map((r) => r.email?.toLowerCase()).filter(Boolean) as string[]);

  const toSend = cleaned.filter((e) => !taken.has(e));
  if (toSend.length === 0) return { sent: [], alreadyMembers: cleaned };

  // Same origin-from-the-request approach groups.ts's own invite uses - there is genuinely no
  // app-wide base-URL env var in this codebase, so the route handler passes in the real origin it
  // was called on rather than this reaching for one that doesn't exist.
  const link = `${origin}/`;
  const from = inviterName?.trim() || "An admin";
  const transporter = getTransporter();

  await Promise.all(
    toSend.map((to) =>
      transporter.sendMail({
        from: `"Apex F1 Hub" <${process.env.MAIL_FROM}>`,
        to,
        subject: `${from} invited you to Apex F1 Hub`,
        text: `${from} invited you to Apex F1 Hub - Formula 1 predictions, race analysis and community leagues. Get started: ${link}`,
        html: `<p>${from} invited you to <strong>Apex F1 Hub</strong> - Formula 1 predictions, race analysis and community leagues.</p><p><a href="${link}">Get started</a></p>`,
      }),
    ),
  );

  return { sent: toSend, alreadyMembers: cleaned.filter((e) => taken.has(e)) };
}
