/** Shared by the invite form and the service that enforces it.
 *
 * Its own module rather than an export from invites.service.ts: that file imports nodemailer and
 * the Supabase service-role client, so a client component reaching in for one number would drag
 * the whole server-only surface into the browser bundle.
 *
 * Bulk is for onboarding a cohort, not for mailing a list. Fifty is comfortably more than any
 * real batch here and low enough that one request can't turn the SMTP relay into a spam cannon —
 * the same concern lib/otp.ts's per-address cooldown exists for.
 */
export const MAX_BULK_INVITES = 50;
