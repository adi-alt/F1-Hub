"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import type { EntityType } from "../_service/season.pure";

export type { EntityType };
export type AnalysisTab = "battles" | "compare" | "progression" | "records";

/** A compare selection, tagged with the entity space its two ids live in. */
type CompareSelection = { type: EntityType; a: string; b: string };

/** Which standings row the page should scroll to and briefly mark, set by clicking a snapshot
 * item or a "what changed" row. A counter rides along so clicking the SAME entity twice still
 * re-triggers the effect - without it the second click is a no-op because the value didn't change. */
export type EntityFocus = { entityType: EntityType; entityId: string; nonce: number } | null;

type ExplorerState = {
  entityType: EntityType;
  setEntityType: (t: EntityType) => void;
  analysisTab: AnalysisTab;
  setAnalysisTab: (t: AnalysisTab) => void;
  /** Empty string when nothing is selected FOR THE ACTIVE ENTITY TYPE - see CompareSelection. */
  compareA: string;
  compareB: string;
  setCompareA: (id: string) => void;
  setCompareB: (id: string) => void;
  /** Switches entity type, jumps to the Compare tab, and pre-selects both sides in one call. */
  openCompare: (type: EntityType, aId: string, bId: string) => void;
  /** Round currently hovered/selected in the season calendar, or null — read by the progression
   * chart to draw a reference line. */
  highlightRound: number | null;
  setHighlightRound: (round: number | null) => void;

  /** Send the reader to a specific standings row and mark it. */
  focus: EntityFocus;
  focusEntity: (entityType: EntityType, entityId: string) => void;

  /** The open race window's round, read straight from the URL. */
  openRaceRound: number | null;
  openRace: (round: number) => void;
  closeRace: () => void;
};

const SeasonExplorerContext = createContext<ExplorerState | null>(null);

const RACE_PARAM = "race";

/**
 * The race window's open/closed state is THE URL, not component state.
 *
 * Reading it from `useSearchParams()` every render (rather than caching it in `useState` at mount)
 * is what makes browser back close the window and forward reopen it: both are just the query
 * string changing. Writing it with the native History API rather than `router.push` keeps that
 * free of a server round-trip - Next integrates pushState/replaceState with its own router, so
 * `useSearchParams()` sees the change immediately and the season page never re-fetches just
 * because someone opened a race.
 *
 * A hard refresh works for the same reason it works at all: the round was never anywhere but the
 * address bar.
 */
export function SeasonExplorerProvider({
  defaultCompare,
  children,
}: {
  /** A default pair per championship. Switching between the two tables then lands on a sensible
   * comparison instead of an empty picker - a driver-code selection genuinely doesn't apply in the
   * constructors' table, but "nothing selected" is the wrong answer to that. */
  defaultCompare: Record<EntityType, { a: string; b: string }>;
  children: ReactNode;
}) {
  const searchParams = useSearchParams();
  const [entityType, setEntityType] = useState<EntityType>("drivers");
  const [analysisTab, setAnalysisTab] = useState<AnalysisTab>("battles");
  // The compare selection carries the entity type it belongs to, rather than being two loose
  // strings. Driver codes mean nothing in the constructors' table, so a selection made in one
  // space must not be read as a selection in the other - and tagging it is what makes that safe
  // WITHOUT a reset-on-switch effect. A reset would have been actively wrong here: openCompare
  // sets the type and the pair in the same call, so a "type changed, clear the pair" rule would
  // wipe the very selection that triggered it.
  const [selection, setSelection] = useState<CompareSelection>({ type: "drivers", a: defaultCompare.drivers.a, b: defaultCompare.drivers.b });
  const active = selection.type === entityType;
  const compareA = active ? selection.a : defaultCompare[entityType].a;
  const compareB = active ? selection.b : defaultCompare[entityType].b;
  // Changing one side while the other is still showing its default must PROMOTE that default into
  // the selection, not discard it - otherwise picking A in a freshly-switched table silently
  // clears B.
  const setCompareA = useCallback(
    (id: string) => setSelection((prev) => ({ type: entityType, a: id, b: prev.type === entityType ? prev.b : defaultCompare[entityType].b })),
    [entityType, defaultCompare],
  );
  const setCompareB = useCallback(
    (id: string) => setSelection((prev) => ({ type: entityType, a: prev.type === entityType ? prev.a : defaultCompare[entityType].a, b: id })),
    [entityType, defaultCompare],
  );
  const [highlightRound, setHighlightRound] = useState<number | null>(null);
  const [focus, setFocus] = useState<EntityFocus>(null);

  const rawRace = searchParams.get(RACE_PARAM);
  const parsedRace = rawRace === null ? null : Number(rawRace);
  // A hand-edited or stale `?race=` value simply opens nothing, rather than rendering a window
  // for a round that doesn't exist.
  const openRaceRound = parsedRace !== null && Number.isInteger(parsedRace) && parsedRace > 0 ? parsedRace : null;

  const writeRaceParam = useCallback(
    (round: number | null) => {
      const params = new URLSearchParams(Array.from(searchParams.entries()));
      if (round === null) params.delete(RACE_PARAM);
      else params.set(RACE_PARAM, String(round));
      const query = params.toString();
      window.history.pushState(null, "", query ? `?${query}` : window.location.pathname);
    },
    [searchParams],
  );

  const openRace = useCallback((round: number) => writeRaceParam(round), [writeRaceParam]);
  const closeRace = useCallback(() => writeRaceParam(null), [writeRaceParam]);

  const focusEntity = useCallback((nextType: EntityType, entityId: string) => {
    setEntityType(nextType);
    setFocus((prev) => ({ entityType: nextType, entityId, nonce: (prev?.nonce ?? 0) + 1 }));
  }, []);

  const openCompare = useCallback((type: EntityType, aId: string, bId: string) => {
    setEntityType(type);
    setAnalysisTab("compare");
    setSelection({ type, a: aId, b: bId });
  }, []);

  const value = useMemo<ExplorerState>(
    () => ({
      entityType,
      setEntityType,
      analysisTab,
      setAnalysisTab,
      compareA,
      compareB,
      setCompareA,
      setCompareB,
      openCompare,
      highlightRound,
      setHighlightRound,
      focus,
      focusEntity,
      openRaceRound,
      openRace,
      closeRace,
    }),
    [entityType, analysisTab, compareA, compareB, setCompareA, setCompareB, openCompare, highlightRound, focus, focusEntity, openRaceRound, openRace, closeRace],
  );

  return <SeasonExplorerContext.Provider value={value}>{children}</SeasonExplorerContext.Provider>;
}

export function useSeasonExplorer(): ExplorerState {
  const ctx = useContext(SeasonExplorerContext);
  if (!ctx) throw new Error("useSeasonExplorer must be used within a SeasonExplorerProvider");
  return ctx;
}
