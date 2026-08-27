"use client";

import type { ReactNode } from "react";
import { MotionConfig } from "framer-motion";
import { AuthProvider } from "@/providers/AuthProvider";
import { QueryProvider } from "@/providers/QueryProvider";
import { AppRealtimeSync } from "@/components/AppRealtimeSync";

/** One place to add the next provider (a toast system, etc.) instead of nesting another one
 * directly into layout.tsx. reducedMotion="user" makes every framer-motion animation in the app
 * defer to the OS-level prefers-reduced-motion setting automatically, instead of each animated
 * component needing its own useReducedMotion() check.
 *
 * AppRealtimeSync is mounted once, here, for the whole app — inside both QueryProvider (it needs
 * useQueryClient) and AuthProvider (it needs useAuth) — instead of every page mounting its own
 * realtime watcher. See that component's docstring. */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <AuthProvider>
        <AppRealtimeSync />
        <MotionConfig reducedMotion="user">{children}</MotionConfig>
      </AuthProvider>
    </QueryProvider>
  );
}
