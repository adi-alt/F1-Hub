"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useAuth } from "@/providers/AuthProvider";

/**
 * Archive's own error boundary - catches what the root one (src/app/error.tsx) also catches, but
 * a route-level boundary is what actually reaches an error thrown during a CHILD component's own
 * render/hydration (a client component further down the tree, e.g. inside ArchiveExplorerWithFocus)
 * - the admin-only try/catch in archive/page.tsx only ever sees an error thrown from that specific
 * async Server Component's own synchronous body, before it returns its JSX tree. Different failure
 * class, different place to catch it.
 *
 * Same admin-only rule as that other diagnostic: every other signed-in user still gets exactly the
 * same generic message the root boundary already shows - this only ever adds detail for the one
 * account that can act on it. `error.message` here is NOT the same redaction case as a raw Server
 * Component render error (this route's own admin diagnostic exists for that) - a genuine client-
 * thrown error keeps its real message even in a production build, so this is worth having as a
 * second, distinct catch surface, not a duplicate of the first.
 *
 * Temporary, same as the page.tsx diagnostic - remove once the underlying bug is confirmed fixed.
 */
export default function ArchiveError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { role } = useAuth();
  const isAdmin = role === "admin";

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <div className="rounded-2xl border border-[var(--f1-line)] bg-[var(--f1-carbon)] p-10 text-center">
        <p className="text-lg font-semibold text-white">Something went wrong</p>
        <p className="mt-2 text-sm text-neutral-400">This page hit an unexpected error. It&apos;s been logged — try again, or head back home.</p>
        {isAdmin && (
          <div className="mt-6 rounded-xl border border-[var(--f1-red)]/40 bg-black/30 p-4 text-left">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--f1-red)]">Admin-only diagnostic (client boundary)</p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-white">{error.message || "(empty message - likely a redacted server render error; check the digest below against server logs)"}</p>
            {error.digest && <p className="mt-2 text-xs text-neutral-500">digest: {error.digest}</p>}
            {error.stack && <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap text-xs text-neutral-500">{error.stack}</pre>}
          </div>
        )}
        <div className="mt-6 flex justify-center gap-3">
          <button onClick={() => reset()} className="rounded-full bg-[var(--f1-red)] px-5 py-2 text-sm font-semibold text-white transition hover:brightness-110">
            Try again
          </button>
          <Link href="/" className="rounded-full border border-[var(--f1-line)] px-5 py-2 text-sm text-neutral-200 transition hover:border-white/30">
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}
