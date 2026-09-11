"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { SharedSeasonIntelligence } from "@/lib/ai/schemas/seasonIntelligence";

type SeasonIntelligenceContextValue = {
  intelligence: SharedSeasonIntelligence | null;
  loading: boolean;
  error: Error | null;
  contextArgs: { season: number; completedRounds: number; contextJson: string; contextHash: string } | null;
};

const SeasonIntelligenceContext = createContext<SeasonIntelligenceContextValue>({
  intelligence: null,
  loading: true,
  error: null,
  contextArgs: null,
});

export function SeasonIntelligenceProvider({
  children,
  contextJson,
  season,
  completedRounds,
  validIds,
  contextHash,
}: {
  children: React.ReactNode;
  contextJson: string;
  season: number;
  completedRounds: number;
  validIds: string[];
  contextHash: string;
}) {
  const [state, setState] = useState<SeasonIntelligenceContextValue>({
    intelligence: null,
    loading: true,
    error: null,
    contextArgs: { season, completedRounds, contextJson, contextHash }
  });

  useEffect(() => {
    const fetchIntelligence = async () => {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const res = await fetch("/api/ai/season-intelligence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contextJson,
            season,
            completedRounds,
            validIds,
            contextHash,
          }),
        });

        if (!res.ok) throw new Error("Failed to fetch season intelligence");

        const data = await res.json();
        setState((prev) => ({ ...prev, intelligence: data, loading: false, error: null }));
      } catch (err) {
        setState((prev) => ({ ...prev, intelligence: null, loading: false, error: err instanceof Error ? err : new Error(String(err)) }));
      }
    };

    fetchIntelligence();
  }, [contextHash, season, completedRounds]);

  return (
    <SeasonIntelligenceContext.Provider value={state}>
      {children}
    </SeasonIntelligenceContext.Provider>
  );
}

export function useSeasonIntelligence() {
  return useContext(SeasonIntelligenceContext);
}
