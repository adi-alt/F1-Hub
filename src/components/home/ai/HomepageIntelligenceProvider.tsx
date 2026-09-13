"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { HomepageIntelligence } from "@/lib/ai/schemas/homepageIntelligence";

interface HomepageIntelligenceContextType {
  intelligence: HomepageIntelligence | null;
  isLoading: boolean;
  isFallback: boolean;
  fallbackReason?: string;
  error?: string | null;
}

const HomepageIntelligenceContext = createContext<HomepageIntelligenceContextType>({
  intelligence: null,
  isLoading: true,
  isFallback: false,
});

export function HomepageIntelligenceProvider({
  children,
  favoriteContextKey,
}: {
  children: React.ReactNode;
  /** `${favoriteDriverCode}:${favoriteTeamCode}` (or similar stable identity string) from
   * PersonalHome - the effect below refetches whenever this changes, so a favorite change is
   * reflected without a full remount. Deliberately NOT part of the memoized context value below
   * (that memoization was fixed earlier specifically to stop 12+ consumers re-rendering on
   * unrelated changes) - this only controls when to re-fetch, not what re-renders consumers. */
  favoriteContextKey: string;
}) {
  const [intelligence, setIntelligence] = useState<HomepageIntelligence | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFallback, setIsFallback] = useState(false);
  const [fallbackReason, setFallbackReason] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  // Reset on every favorite change, not just the first mount - without this, switching favorites
  // would leave stale content on screen with isLoading still false until the new response lands.
  // Adjusted during render (React's own "state derived from a prop change" pattern, already used
  // elsewhere in this codebase - see ProgressionPanel.tsx's entityType reset) rather than inside
  // the effect below, which would call setState synchronously in an effect body.
  const [prevFavoriteKey, setPrevFavoriteKey] = useState(favoriteContextKey);
  if (prevFavoriteKey !== favoriteContextKey) {
    setPrevFavoriteKey(favoriteContextKey);
    setIsLoading(true);
    setError(null);
  }

  useEffect(() => {
    let cancelled = false;

    async function fetchIntelligence() {
      try {
        const res = await fetch("/api/ai/homepage-intelligence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const json = await res.json();
        if (!cancelled && json.data) {
          setIntelligence(json.data);
          setIsFallback(Boolean(json.isFallback));
          setFallbackReason(json.fallbackReason);
        }
      } catch (err) {
        if (!cancelled) {
          setError(String(err));
          // Note: When the endpoint fails, it still returns deterministic fallback.
          // If network completely drops, error is set and consumers render deterministic fallbacks.
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    fetchIntelligence();

    return () => {
      cancelled = true;
    };
  }, [favoriteContextKey]);

  // Memoized: an inline object here was a new reference on every render regardless of whether
  // `intelligence`/`isLoading`/etc. actually changed - confirmed (2026-09-10 perf audit) to force
  // all 12+ consumer components to re-render whenever this Provider re-rendered for any reason
  // (e.g. a parent re-render from an unrelated AuthProvider state change), not just the one real
  // transition each of these values goes through per page load.
  const value = useMemo(
    () => ({ intelligence, isLoading, isFallback, fallbackReason, error }),
    [intelligence, isLoading, isFallback, fallbackReason, error],
  );

  return <HomepageIntelligenceContext.Provider value={value}>{children}</HomepageIntelligenceContext.Provider>;
}

export function useHomepageIntelligence() {
  return useContext(HomepageIntelligenceContext);
}
