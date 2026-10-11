import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "@/lib/observability/sentryOptions";

// Runs once when the server (Node or Edge) starts. A no-op until NEXT_PUBLIC_SENTRY_DSN is set.
export function register() {
  Sentry.init(sentryOptions());
}

// Every error a Server Component, route handler or server action throws, with the request it came from.
export const onRequestError = Sentry.captureRequestError;
