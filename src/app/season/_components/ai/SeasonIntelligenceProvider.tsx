"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
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
// Asked for only once a section that shows it is on screen (SeasonIntelligenceTrigger): the page no longer opens
// with an AI summary, so a visit that never scrolls to the analysis makes no request at all.
const RequestContext = createContext<() => void>(() => {});

export function SeasonIntelligenceProvider({ children, season }: { children: React.ReactNode; season: number }) {
  const [state, setState] = useState<State>({ intelligence: null, source: null, loading: true, failed: false, season });
  const [requested, setRequested] = useState(false);

  // Reset to "loading" for a new season DURING RENDER (React's own documented "adjust state when
  // a prop changes" pattern), not at the top of the effect below. Doing it in the effect body
  // renders the previous season's narrative once under the new year before clearing it, and costs
  // an extra render every time - which is exactly what react-hooks/set-state-in-effect flags.
  const [prevSeason, setPrevSeason] = useState(season);
  if (prevSeason !== season) {
    setPrevSeason(season);
    setState({ intelligence: null, source: null, loading: true, failed: false, season });
  }

  useEffect(() => {
    if (!requested) return;
    const controller = new AbortController();

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
  }, [season, requested]);

  return (
    <RequestContext.Provider value={() => setRequested(true)}>
      <SeasonIntelligenceContext.Provider value={state}>{children}</SeasonIntelligenceContext.Provider>
    </RequestContext.Provider>
  );
}

/** Wraps a section that shows season intelligence: the request is made the first time it nears the viewport. */
export function SeasonIntelligenceTrigger({ children }: { children: ReactNode }) {
  const request = useContext(RequestContext);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return request();
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        request();
      },
      { rootMargin: "400px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [request]);
  return <div ref={ref}>{children}</div>;
}

export function useSeasonIntelligence(): State {
  return useContext(SeasonIntelligenceContext);
}
