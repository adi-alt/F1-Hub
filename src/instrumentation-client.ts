import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "@/lib/observability/sentryOptions";

// Browser errors. A no-op until NEXT_PUBLIC_SENTRY_DSN is set.
Sentry.init(sentryOptions());

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
