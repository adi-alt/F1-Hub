"use client";

import { catchError, type ErrorInfo } from "next/error";
import * as Sentry from "@sentry/nextjs";
import { Alert } from "./Alert";
import { Button } from "./Button";

// Distinct errors seen per region in this tab, so a region that keeps failing says so instead of
// offering the same Try again as if nothing were wrong (spec §9.3: a support hint after three).
// Anything can be thrown: objects are told apart by identity, anything else by value.
const failures = new Map<string, { objects: WeakSet<object>; values: Set<unknown>; count: number }>();

/** Counts `error` once for the region named `label`, however many times its fallback re-renders,
 * and returns how many distinct failures that region has had. */
export function recordRegionFailure(label: string, error: unknown): number {
  const entry = failures.get(label) ?? { objects: new WeakSet<object>(), values: new Set<unknown>(), count: 0 };
  const isObject = typeof error === "object" && error !== null;
  const seen = isObject ? entry.objects.has(error) : entry.values.has(error);
  if (!seen) {
    if (isObject) entry.objects.add(error);
    else entry.values.add(error);
    entry.count += 1;
    // Reported once per distinct failure, tagged with the region: a region that fails is exactly the
    // partial outage the page was built to survive, and nobody would otherwise hear about it.
    Sentry.captureException(error, { tags: { region: label } });
  }
  failures.set(label, entry);
  return entry.count;
}

/** What a failed region shows. The error itself is not displayed: in production a Server
 * Component error reaches the browser as a generic digest, and in development it can be internal. */
export function RegionErrorFallback({ label }: { label: string }, { error, retry }: Pick<ErrorInfo, "error" | "retry">) {
  const failed = recordRegionFailure(label, error);
  return (
    <Alert
      tone="danger"
      title={`Couldn't load ${label}`}
      action={
        <Button variant="secondary" size="sm" onClick={() => retry()}>
          Try again
        </Button>
      }
    >
      {failed >= 3 ? "This keeps failing. Try again in a few minutes, or reload the page." : "The rest of the page still works."}
    </Alert>
  );
}

/**
 * One region of a page that can fail on its own (spec §9.3; audit FEAT-06). If anything inside it
 * throws while rendering, Server Components included, only this region shows an inline error with
 * Try again, which re-fetches it; the rest of the page keeps working. Built on Next's catchError,
 * so redirect() and notFound() still pass through and the error clears on navigation. `label`
 * names the region in sentence case, as it reads after "Couldn't load": "the standings".
 */
export const RegionBoundary = catchError(RegionErrorFallback);
