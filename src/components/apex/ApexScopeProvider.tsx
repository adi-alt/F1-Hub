"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

/**
 * What Apex can currently see.
 *
 * `snapshot` is whatever the page chooses to hand over, and it is sent to /api/ai/ask-apex as
 * grounding. The privacy model follows from that and is structural rather than a check bolted on:
 * a page can only put into the snapshot what the server already rendered for this user, and the
 * server only renders a community's content after requireMember. So a non-member's browser never
 * holds a private community's posts and therefore cannot put them in a snapshot. (The route adds a
 * second, explicit membership assertion on `communityId` anyway - see its own comment for why a
 * structural guarantee still deserves a belt.)
 */
export type ApexScope = {
  /** Stable identity for this scope - changing it resets the conversation, since the answers were
   * grounded in different facts. */
  key: string;
  /** What the user sees in the scope indicator: "Ferrari Tifosi", "Season 2026". */
  label: string;
  /** Second line: "Feed", "Standings". Optional. */
  sublabel?: string;
  /** The facts Apex answers from. Kept small - the route caps it hard. */
  snapshot: Record<string, unknown>;
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
