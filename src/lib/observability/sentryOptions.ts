import type { ErrorEvent } from "@sentry/nextjs";

/**
 * Shared Sentry settings (audit R-13). Sentry stays completely off until a DSN is configured:
 * NEXT_PUBLIC_SENTRY_DSN for the browser and the server, in Vercel's environment variables. The DSN
 * is a public identifier by design (it ships in the browser bundle), so it is not a secret.
 *
 * No tracing and no session replay: this is error tracking only, which keeps the volume (and any
 * personal data) down. Events are tagged with the deploy (release = the git commit) and the
 * environment (production, preview, development), so a regression points at the commit that caused it.
 */
export function sentryOptions() {
  return {
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || undefined,
    enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
    release: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
    environment: process.env.VERCEL_ENV ?? process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend: scrubEvent,
  };
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/** Drops what an error report has no business carrying: cookies and auth headers on the request, the
 * user object, and email addresses that ended up inside messages (an OTP sign-in error can echo one). */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.request) {
    delete event.request.cookies;
    if (event.request.headers) {
      for (const name of Object.keys(event.request.headers)) {
        if (/^(cookie|authorization|x-cron-secret|apikey)$/i.test(name)) delete event.request.headers[name];
      }
    }
  }
  delete event.user;
  if (event.message) event.message = event.message.replace(EMAIL, "<email>");
  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = exception.value.replace(EMAIL, "<email>");
  }
  return event;
}
