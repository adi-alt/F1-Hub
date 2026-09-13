"use client";

import { useRouter } from "next/navigation";

/** Shown above the tabs when one of Archive's three list fetches (circuits/drivers/teams) genuinely
 * failed server-side (see safeReadTracked, src/lib/safeRead.ts) - distinct from a real "nothing
 * indexed yet" empty state, which isn't an error and shouldn't look like one. router.refresh() is
 * the whole "retry": this is a Server Component tree, there's no client-side data to refetch, just
 * a fresh request for the same route. */
export function RetryBanner() {
  const router = useRouter();
  return (
    <div className="mb-3 flex shrink-0 items-center justify-between gap-3 rounded-lg border border-[var(--f1-red)]/30 bg-[var(--f1-red)]/10 px-4 py-2.5 text-sm text-neutral-300">
      <span>Some historical data couldn&apos;t be loaded.</span>
      <button
        type="button"
        onClick={() => router.refresh()}
        className="shrink-0 rounded-md border border-white/15 px-3 py-1 text-xs font-medium text-white transition hover:border-white/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--f1-red)]"
      >
        Try again
      </button>
    </div>
  );
}
