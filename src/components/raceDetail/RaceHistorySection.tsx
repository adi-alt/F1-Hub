"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { QuietTabs } from "@/app/season/_components/QuietTabs";
import { RaceSectionCard } from "./RaceSectionCard";
import { GrandPrixHistoryContent, hasGrandPrixHistory } from "./GrandPrixHistorySection";
import { CircuitRecordsContent, hasCircuitRecords } from "./CircuitRecordsSection";
import type { CircuitYearRecord } from "@/lib/circuitIntelligence";
import type { AgeRecords } from "@/lib/circuitRecords";
import type { RaceDoc } from "@/lib/types/race";
import type { ArchiveRaceDoc } from "@/lib/supabase/archive";

type Tab = "winners" | "records";

/**
 * One explorer, not two back-to-back cards repeating the same "circuit stats" shape - Winners
 * (this exact Grand Prix's own history, GrandPrixHistoryContent) and Records (this circuit's
 * genuine all-time milestones, CircuitRecordsContent) are different questions about the same
 * venue, so they read as two tabs of one thing rather than two separate sections a reader has to
 * notice are related.
 *
 * Shown for every race phase, not gated on completion - "who's won this race before" and "the
 * circuit's all-time records" are exactly as true and exactly as useful before a race weekend as
 * after one.
 *
 * Whichever tab has nothing real to show is simply not offered - never an empty tab a click reveals
 * nothing behind. The whole section disappears only when NEITHER tab has anything at all.
 */
export function RaceHistorySection({
  raceName,
  circuitName,
  timeline,
  liveRaces,
  archiveRaces,
  ageRecords,
}: {
  raceName: string;
  circuitName: string;
  timeline: CircuitYearRecord[];
  liveRaces: RaceDoc[];
  archiveRaces: ArchiveRaceDoc[];
  ageRecords: AgeRecords;
}) {
  const winnersAvailable = hasGrandPrixHistory(raceName, timeline);
  const recordsAvailable = hasCircuitRecords(timeline, liveRaces, archiveRaces, ageRecords);
  const availableTabs: { value: Tab; label: string }[] = [
    winnersAvailable ? { value: "winners" as const, label: "Winners" } : null,
    recordsAvailable ? { value: "records" as const, label: "Records" } : null,
  ].filter((t): t is { value: Tab; label: string } => t !== null);

  const [tab, setTab] = useState<Tab | null>(availableTabs[0]?.value ?? null);
  if (availableTabs.length === 0) return null;
  const activeTab = tab && availableTabs.some((t) => t.value === tab) ? tab : availableTabs[0].value;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.3, ease: "easeOut" }}>
      <RaceSectionCard
        title="Race History & Records"
        description={activeTab === "winners" ? `${raceName}'s own past winners, year by year.` : `All-time milestones at ${circuitName}.`}
        headerRight={availableTabs.length > 1 ? <QuietTabs options={availableTabs} value={activeTab} onChange={setTab} className="text-xs" /> : undefined}
      >
        {activeTab === "winners" ? <GrandPrixHistoryContent raceName={raceName} timeline={timeline} /> : <CircuitRecordsContent timeline={timeline} liveRaces={liveRaces} archiveRaces={archiveRaces} ageRecords={ageRecords} />}
      </RaceSectionCard>
    </motion.div>
  );
}
