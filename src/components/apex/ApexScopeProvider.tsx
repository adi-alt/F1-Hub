"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type ApexPage =
  | "home"
  | "season"
  | "circuit"
  | "archive"
  | "community"
  | "user"
  | "models";

export type BaseApexContext = {
  page: ApexPage;
};

export type HomepageApexContext = BaseApexContext & {
  page: "home";
  snapshot: Record<string, unknown>; // Existing homepage intelligence snapshot
};

export type SeasonApexContext = BaseApexContext & {
  page: "season";
  season: number;
  selectedChampionship?: "drivers" | "constructors";
  selectedAnalysisTab?: string;
  selectedRaceId?: string;
  entityAId?: string;
  entityBId?: string;
  selectedDriverId?: string;
  selectedTeamId?: string;
};

export type GenericApexContext = BaseApexContext & {
  page: "circuit" | "archive" | "community" | "user" | "models";
  snapshot?: Record<string, unknown>;
};

export type ApexPageContext = HomepageApexContext | SeasonApexContext | GenericApexContext;

/**
 * What Apex can currently see.
 *
 * `context` is whatever the page chooses to hand over, and it is sent to /api/ai/ask-apex as
 * grounding. The server remains authoritative - the client sends safe UI state (IDs, selections)
 * in this context, not full factual statistics, preventing hallucination by malicious payload.
 */
export type ApexScope = {
  /** Stable identity for this scope - changing it resets the conversation. */
  key: string;
  /** What the user sees in the scope indicator: "Ferrari Tifosi", "Season 2026". */
  label: string;
  /** Second line: "Feed", "Standings". Optional. */
  sublabel?: string;
  /** The typed UI state context for the active page. */
  context: ApexPageContext;
  /** Page-appropriate starter questions. Real ones the snapshot can actually answer. */
  suggestions?: string[];
  /** Set when the scope is one community, so the server can verify membership. */
  communityId?: string;
  /** Whether this scope can be widened to "all communities" / "everything". */
  widenable?: boolean;
};

type ApexScopeContextValue = {
  scope: ApexScope | null;
  register: (scope: ApexScope | null) => void;
};

const ApexScopeContext = createContext<ApexScopeContextValue | null>(null);

export function ApexScopeProvider({ children }: { children: React.ReactNode }) {
  const [scope, setScope] = useState<ApexScope | null>(null);
  const register = useCallback((next: ApexScope | null) => setScope(next), []);
  const value = useMemo(() => ({ scope, register }), [scope, register]);
  return <ApexScopeContext.Provider value={value}>{children}</ApexScopeContext.Provider>;
}

export function useApexScope(): ApexScope | null {
  return useContext(ApexScopeContext)?.scope ?? null;
}

/**
 * A page declares its Apex context with this. Serialising the scope for the dependency comparison
 * rather than relying on object identity is deliberate: every page builds this object inline during
 * render, so an identity check would re-register (and reset the conversation) on every single
 * render.
 */
export function useRegisterApexScope(scope: ApexScope | null) {
  const context = useContext(ApexScopeContext);
  const register = context?.register;
  const serialized = scope ? JSON.stringify(scope) : null;

  useEffect(() => {
    if (!register) return;
    register(serialized ? (JSON.parse(serialized) as ApexScope) : null);
    // Clear on unmount, so navigating away from a community can't leave its context behind for the
    // next page - that would be exactly the "silently uses unrelated community information" case.
    return () => register(null);
  }, [register, serialized]);
}
