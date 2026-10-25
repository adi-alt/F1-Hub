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

  // Most of what lands here is transient rather than a broken page: a request that went out while
  // the laptop was waking, the tab was hidden, or the network was still down. Leaving someone on
  // "Something went wrong" for that - when the very next attempt would succeed - is the wrong
  // outcome, so the boundary retries itself the moment the page is actually visible and online
  // again. A real failure simply errors a second time and then stays put, retry spent.
  useEffect(() => {
    function attempt() {
      if (retried.current) return;
      if (document.visibilityState !== "visible") return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      retried.current = true;
      reset();
    }

    // Covers the case where the page is already visible and online by the time this mounts, which
    // is what happens when the failed request was the only thing that was ever wrong.
    const id = setTimeout(attempt, 1200);
    document.addEventListener("visibilitychange", attempt);
    window.addEventListener("online", attempt);
    return () => {
      clearTimeout(id);
      document.removeEventListener("visibilitychange", attempt);
      window.removeEventListener("online", attempt);
    };
  }, [reset]);

  return <ErrorScreen error={error} reset={reset} />;
}
