"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { SharedSeasonIntelligence, IntelligenceSource } from "@/lib/ai/schemas/seasonIntelligence";

type State = {
  intelligence: SharedSeasonIntelligence | null;
  /** Whether the content on screen was written by the model or assembled deterministically.
   * The UI renders both identically - this exists so the APPLICATION never confuses them
   * (telemetry, cache decisions, and any future "regenerate" affordance all depend on it). */
  source: IntelligenceSource | null;
  loading: boolean;
  failed: boolean;
  season: number;
};

const SeasonIntelligenceContext = createContext<State>({
  intelligence: null,
  source: null,
  loading: true,
  failed: false,
  season: 0,
});

/**
 * Fetches the one shared season narrative.
 *
 * It sends a season year and nothing else. Everything the model reasons over is assembled
 * server-side from the same authoritative data the page renders - so the prompt and the page
 * cannot drift, and no client-supplied statistic ever reaches a prompt.
 *
 * Shared, not personal: favorites deliberately play no part in this request, so one generation and
 * one cache entry serve every reader of the same season. Personalization is a deterministic
 * overlay applied on top (see buildPersonalSeasonContext).
 */
export function SeasonIntelligenceProvider({ children, season }: { children: React.ReactNode; season: number }) {
  const [state, setState] = useState<State>({ intelligence: null, source: null, loading: true, failed: false, season });

  useEffect(() => {
    const controller = new AbortController();
    setState({ intelligence: null, source: null, loading: true, failed: false, season });

    (async () => {
      try {
        const res = await fetch("/api/ai/season-intelligence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ season }),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`season intelligence: ${res.status}`);
        const body = (await res.json()) as { content?: SharedSeasonIntelligence; source?: IntelligenceSource };
        if (!body?.content) throw new Error("season intelligence: empty envelope");
        setState({ intelligence: body.content, source: body.source ?? "fallback", loading: false, failed: false, season });
      } catch (err) {
        // An aborted request is this effect cleaning up after itself, not a failure - reporting it
        // as one would flash an error state on every navigation.
        if (controller.signal.aborted) return;
        console.error(err);
        setState({ intelligence: null, source: null, loading: false, failed: true, season });
      }
    })();

    return () => controller.abort();
  }, [season]);

  return <SeasonIntelligenceContext.Provider value={state}>{children}</SeasonIntelligenceContext.Provider>;
}

export function useSeasonIntelligence(): State {
  return useContext(SeasonIntelligenceContext);
}
