"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { RaceSectionCard } from "@/components/raceDetail/RaceSectionCard";
import { AnalysisCoverage } from "@/components/ai/AnalysisCoverage";
import { IntelligenceLoadingState } from "@/components/ai/IntelligenceLoadingState";
import type { CachedRaceEntry } from "@/lib/ai/cache";
import type { ContextSource, PersonalRaceInsight, SharedRaceIntelligence } from "@/lib/ai/schemas/raceIntelligence";
import { Hero } from "./Hero";
import { WhatMattered } from "./WhatMattered";
import { YourPerspective } from "./YourPerspective";

interface RaceIntelligenceResponse {
  shared: CachedRaceEntry<SharedRaceIntelligence> | null;
  personal: CachedRaceEntry<PersonalRaceInsight | null> | null;
  dataCoverage: Record<ContextSource, boolean>;
  evidenceFactCounts: Record<ContextSource, number>;
  personalFacts: { driver: string | null; team: string | null } | null;
}

/** Composes the three-level hierarchy (What Happened -> What Mattered -> Your Perspective) plus
 * the "Behind This Analysis" coverage panel underneath. Caller (SeasonRaceDashboard /
 * ArchiveRaceDashboard) gates this on `isCompleted` and supplies `preCoverage` - whatever coverage
 * is honestly knowable client-side before generation resolves, so the loading checklist has
 * something real to show on first paint instead of a blank spinner. */
export function RaceIntelligenceSection({
  raceId,
  preCoverage,
  archiveYear,
  archiveRound,
}: {
  raceId: string;
  preCoverage: Partial<Record<ContextSource, boolean>>;
  // Archive races live in a separate table, looked up by year+round - see route.ts's own source
  // dispatch comment for why this can't just be another raceId. Flat primitives (not a nested
  // object) so the fetch effect's dependency array stays exact, not a fresh-identity-every-render
  // object forcing either a stale closure or a needless refetch.
  archiveYear?: number;
  archiveRound?: number;
}) {
  const [data, setData] = useState<RaceIntelligenceResponse | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const params = new URLSearchParams({ raceId });
    if (archiveYear !== undefined && archiveRound !== undefined) {
      params.set("source", "archive");
      params.set("year", String(archiveYear));
      params.set("round", String(archiveRound));
    }

    fetch(`/api/ai/race-intelligence?${params.toString()}`, { method: "POST" })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json: RaceIntelligenceResponse) => {
        if (!cancelled) setData(json);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });

    return () => {
      cancelled = true;
    };
  }, [raceId, archiveYear, archiveRound]);

  // A real network/server failure with no cached fallback to fall back on - genuinely nothing
  // honest to show, so the section quietly doesn't render rather than showing an error card for
  // what's an additive, non-essential layer on top of the always-present RaceStory section above.
  if (error) return null;

  const shared = data?.shared;
  const isAi = shared?.generationMode === "ai";
  const heading = data ? (isAi ? "F1 HUB Race Intelligence" : "F1 HUB Race Summary") : "F1 HUB Race Intelligence";

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.3, ease: "easeOut" }}>
      <RaceSectionCard title={heading} description={isAi ? "AI-generated analysis of what mattered in this race." : "A deterministic summary of what mattered in this race."}>
        {/* Crossfade instead of an instant swap - the loading checklist and the loaded content are
         * structurally very different sizes, so replacing one with the other outright reads as a
         * "bump" even though RaceSectionCard's own layout animation smooths the height change. A
         * short opacity fade (no slide/scale - subtle, not "animated dashboard") makes the content
         * change itself feel intentional rather than abrupt. */}
        <AnimatePresence mode="wait" initial={false}>
          {!data ? (
            <motion.div key="loading" exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
              <IntelligenceLoadingState coverage={preCoverage} />
            </motion.div>
          ) : shared ? (
            <motion.div key="loaded" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }} className="space-y-5">
              <Hero headline={shared.content.headline} executiveSummary={shared.content.executiveSummary} />
              <WhatMattered
                keyFactors={shared.content.keyFactors}
                strategyInsight={shared.content.strategyInsight}
                racePaceInsight={shared.content.racePaceInsight}
                championshipImpact={shared.content.championshipImpact}
              />
              {data.personal?.content && data.personalFacts && <YourPerspective personal={data.personal.content} personalFacts={data.personalFacts} />}
              <AnalysisCoverage coverage={data.dataCoverage} factCounts={data.evidenceFactCounts} mode="behind" />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </RaceSectionCard>
    </motion.div>
  );
}
