"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export function QueryProvider({ children }: { children: ReactNode }) {
  // Created once per browser session via useState's lazy initializer, not once per module — a
  // module-level singleton would leak query cache across users if this ever ran on the server.
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // A real floor instead of the default staleTime: 0 (refetch on every mount/focus) —
            // most of what this app fetches client-side (pipeline runs, the user list, archive
            // laps) doesn't change second-to-second. Individual hooks still override this where
            // it's deliberately different (Infinity for genuinely static data, a short staleTime
            // for username-availability checks).
            staleTime: 5 * 60 * 1000,
            gcTime: 10 * 60 * 1000,
          },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
