"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
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

export function HomepageIntelligenceProvider({ children }: { children: React.ReactNode }) {
  const [intelligence, setIntelligence] = useState<HomepageIntelligence | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFallback, setIsFallback] = useState(false);
  const [fallbackReason, setFallbackReason] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

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
  }, []);

  return (
    <HomepageIntelligenceContext.Provider
      value={{
        intelligence,
        isLoading,
        isFallback,
        fallbackReason,
        error,
      }}
    >
      {children}
    </HomepageIntelligenceContext.Provider>
  );
}

export function useHomepageIntelligence() {
  return useContext(HomepageIntelligenceContext);
}
