"use client";

import { useEffect, useRef } from "react";
import * as Sentry from "@sentry/nextjs";
import { ErrorScreen } from "@/components/ErrorScreen";
import { recordClientError } from "@/components/ReportProblem";

/**
 * Catches a render/data error anywhere under the root layout — Header/nav still render around
 * this, since only the segment that actually threw gets replaced. Before this file existed, an
 * uncaught error anywhere had no boundary at all below Next's own default (a blank, unstyled
 * "Application error" page) — this is genuinely new coverage, not a redesign of something that
 * already worked.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // One automatic retry, and only once per mounted boundary - a retry loop against a genuinely
  // broken page would hammer the server and flicker forever.
  const retried = useRef(false);

  useEffect(() => {
    // Reported to Sentry (a no-op until a DSN is configured) as well as the console, which stays visible
    // in Vercel's function logs.
    console.error(error);
    Sentry.captureException(error);
    recordClientError(error);
  }, [error]);

  // Only retry automatically if the browser actually went offline and came back online.
  // Never auto-retry on a blind timer: if a page has a persistent server or render error,
  // remounting this component after reset() creates an infinite 1.2-second reload loop that hammers
  // serverless functions and burns CPU quota.
  useEffect(() => {
    function attempt() {
      if (retried.current) return;
      if (document.visibilityState !== "visible") return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      retried.current = true;
      reset();
    }

    window.addEventListener("online", attempt);
    return () => {
      window.removeEventListener("online", attempt);
    };
  }, [reset]);

  return <ErrorScreen error={error} reset={reset} />;
}
