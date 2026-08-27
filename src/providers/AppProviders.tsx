"use client";

import type { ReactNode } from "react";
import { MotionConfig } from "framer-motion";
import { AuthProvider } from "@/providers/AuthProvider";
import { QueryProvider } from "@/providers/QueryProvider";

/** One place to add the next provider (a toast system, etc.) instead of nesting another one
 * directly into layout.tsx. reducedMotion="user" makes every framer-motion animation in the app
 * defer to the OS-level prefers-reduced-motion setting automatically, instead of each animated
 * component needing its own useReducedMotion() check. */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <AuthProvider>
        <MotionConfig reducedMotion="user">{children}</MotionConfig>
      </AuthProvider>
    </QueryProvider>
  );
}
