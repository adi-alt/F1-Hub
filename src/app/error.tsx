"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * Catches a render/data error anywhere under the root layout — Header/nav still render around
 * this, since only the segment that actually threw gets replaced. Before this file existed, an
 * uncaught error anywhere had no boundary at all below Next's own default (a blank, unstyled
 * "Application error" page) — this is genuinely new coverage, not a redesign of something that
 * already worked.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // No error-tracking service wired up yet (see Vercel Analytics/Speed Insights, added
    // alongside this) — console.error is at least visible in Vercel's own function logs today.
    console.error(error);
  }, [error]);

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
