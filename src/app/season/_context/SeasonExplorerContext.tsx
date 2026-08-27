"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

export type EntityType = "drivers" | "constructors";
export type AnalysisTab = "battles" | "compare" | "progression" | "records";

type ExplorerState = {
  entityType: EntityType;
  setEntityType: (t: EntityType) => void;
  analysisTab: AnalysisTab;
  setAnalysisTab: (t: AnalysisTab) => void;
  compareA: string;
  compareB: string;
  setCompareA: (id: string) => void;
  setCompareB: (id: string) => void;
  /** The one function that ties the whole "click something, land in Compare with it already set
   * up" flow together (a battle, a standings row's "Compare" action) — switches entity type,
   * jumps to the Compare tab, and pre-selects both sides in one call instead of three. */
  openCompare: (type: EntityType, aId: string, bId: string) => void;
  /** Round currently hovered/selected in the season calendar, or null — read by the progression
   * chart to draw a reference line, so hovering a race there visibly ties into the chart above
   * instead of the two staying independent widgets. */
  highlightRound: number | null;
  setHighlightRound: (round: number | null) => void;
};

const SeasonExplorerContext = createContext<ExplorerState | null>(null);

export function SeasonExplorerProvider({
  defaultCompareA,
  defaultCompareB,
  children,
}: {
  defaultCompareA: string;
  defaultCompareB: string;
  children: ReactNode;
}) {
  const [entityType, setEntityType] = useState<EntityType>("drivers");
  const [analysisTab, setAnalysisTab] = useState<AnalysisTab>("battles");
  const [compareA, setCompareA] = useState(defaultCompareA);
  const [compareB, setCompareB] = useState(defaultCompareB);
  const [highlightRound, setHighlightRound] = useState<number | null>(null);

  function openCompare(type: EntityType, aId: string, bId: string) {
    setEntityType(type);
    setAnalysisTab("compare");
    setCompareA(aId);
    setCompareB(bId);
  }

  return (
    <SeasonExplorerContext.Provider
      value={{
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
      }}
    >
      {children}
    </SeasonExplorerContext.Provider>
  );
}

export function useSeasonExplorer(): ExplorerState {
  const ctx = useContext(SeasonExplorerContext);
  if (!ctx) throw new Error("useSeasonExplorer must be used within a SeasonExplorerProvider");
  return ctx;
}
