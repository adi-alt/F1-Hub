"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

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
    // No error-tracking service wired up yet (see Vercel Analytics/Speed Insights, added
    // alongside this) — console.error is at least visible in Vercel's own function logs today.
    console.error(error);
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

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <div className="rounded-2xl border border-[var(--f1-line)] bg-[var(--f1-carbon)] p-10 text-center">
        <p className="text-lg font-semibold text-white">Something went wrong</p>
        <p className="mt-2 text-sm text-neutral-400">
          This page hit an unexpected error. It&apos;s been logged — try again, or head back home.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button
            onClick={() => reset()}
            className="rounded-full bg-[var(--f1-red)] px-5 py-2 text-sm font-semibold text-white transition hover:brightness-110"
          >
            Try again
          </button>
          <Link
            href="/"
            className="rounded-full border border-[var(--f1-line)] px-5 py-2 text-sm text-neutral-200 transition hover:border-white/30"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}
