"use client";

import { use, useEffect, useState } from "react";

export type Streamable<T> = T | Promise<T>;

export function isPromiseLike<T>(value: Streamable<T>): value is Promise<T> {
  return typeof value === "object" && value !== null && "then" in value && typeof (value as { then?: unknown }).then === "function";
}

/**
 * Unwraps a `T | Promise<T>` inside a `<Suspense>` boundary.
 * - If `value` is a Promise (streamed from a Server Component), React's `use()` suspends only the
 *   enclosing `<Suspense>` boundary and renders its skeleton fallback until the promise resolves.
 * - If `value` is already resolved (synchronous prop or test), returns it immediately.
 */
export function useStreamed<T>(value: Streamable<T>): T {
  return isPromiseLike(value) ? use(value) : value;
}

/**
 * Progressively resolves a `T | Promise<T>` without suspending the caller: returns `fallback` while
 * a promise is pending, then updates to the resolved value as soon as it arrives.
 */
export function useProgressive<T>(value: Streamable<T>, fallback: T): { data: T; loading: boolean } {
  const isAsync = isPromiseLike(value);
  const [state, setState] = useState<{ source: Streamable<T>; data: T; loading: boolean }>(() => ({
    source: value,
    data: isAsync ? fallback : value,
    loading: isAsync,
  }));

  useEffect(() => {
    if (!isPromiseLike(value)) return;
    let cancelled = false;
    value
      .then((resolved) => {
        if (!cancelled) setState({ source: value, data: resolved, loading: false });
      })
      .catch(() => {
        if (!cancelled) setState({ source: value, data: fallback, loading: false });
      });
    return () => {
      cancelled = true;
    };
  }, [value, fallback]);

  if (!isAsync) return { data: value, loading: false };
  return state.source === value ? { data: state.data, loading: state.loading } : { data: fallback, loading: true };
}
