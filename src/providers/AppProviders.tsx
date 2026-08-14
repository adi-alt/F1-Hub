"use client";

import type { ReactNode } from "react";
import { AuthProvider } from "@/providers/AuthProvider";
import { QueryProvider } from "@/providers/QueryProvider";

/** One place to add the next provider (a toast system, etc.) instead of nesting another one
 * directly into layout.tsx. */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <AuthProvider>{children}</AuthProvider>
    </QueryProvider>
  );
}
