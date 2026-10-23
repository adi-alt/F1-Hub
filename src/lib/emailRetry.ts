// Backoff for notification emails that failed to send (audit R-51). The hourly /api/cron/emails job retries a
// failed email after 1h, 2h, 4h then 8h; after MAX_EMAIL_ATTEMPTS sends it stops, leaving the failure recorded.

export const MAX_EMAIL_ATTEMPTS = 5;

/** When to try again after `attempts` failed sends, or null once the attempts are used up. */
export function nextEmailAttempt(attempts: number, now: Date): Date | null {
  if (attempts >= MAX_EMAIL_ATTEMPTS) return null;
  const hours = 2 ** Math.max(0, attempts - 1);
  return new Date(now.getTime() + hours * 60 * 60 * 1000);
}

/** A failure as stored in notifications.email_last_error: one line, bounded. */
export function emailErrorText(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  return text.replace(/\s+/g, " ").trim().slice(0, 1000) || "Unknown error";
}
