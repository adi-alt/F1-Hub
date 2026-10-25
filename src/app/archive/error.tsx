"use client";

import { ErrorScreen } from "@/components/ErrorScreen";
import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
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
    Sentry.captureException(error);
  }, [error]);

  return (
    <ErrorScreen error={error} reset={reset}>
      {isAdmin && (
        <div className="mt-6 rounded-card border border-white/[0.08] bg-black/30 p-4 text-left">
          <p className="text-caption font-semibold uppercase tracking-[0.14em] text-tertiary">Admin-only diagnostic (client boundary)</p>
          <p className="mt-2 whitespace-pre-wrap text-body-sm text-primary">{error.message || "(empty message - likely a redacted server render error; check the digest below against server logs)"}</p>
          {error.digest && <p className="mt-2 text-caption text-tertiary">digest: {error.digest}</p>}
          {error.stack && <pre className="scrollbar-subtle mt-3 max-h-64 overflow-auto whitespace-pre-wrap text-caption text-tertiary">{error.stack}</pre>}
        </div>
      )}
    </ErrorScreen>
  );
}
