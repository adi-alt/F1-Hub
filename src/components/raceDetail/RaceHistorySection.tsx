"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { QuietTabs } from "@/app/season/_components/QuietTabs";
import { RaceSectionCard } from "./RaceSectionCard";
import { WinnersBarList } from "./WinnersBarList";
import { GrandPrixHistoryContent, hasGrandPrixHistory } from "./GrandPrixHistorySection";
import { CircuitRecordsContent, hasCircuitRecords } from "./CircuitRecordsSection";
import { computeTopWinners, computeTopWinningTeams, filterByRaceName, type CircuitYearRecord } from "@/lib/circuitIntelligence";
import type { AgeRecords } from "@/lib/circuitRecords";
import type { RaceDoc } from "@/lib/types/race";
import type { ArchiveRaceDoc } from "@/lib/supabase/archive";

type Tab = "winners" | "drivers" | "teams" | "records";

/**
 * One explorer with up to four tabs, not four back-to-back cards repeating the same "circuit
 * stats" shape: Winners (this exact Grand Prix's own year-by-year history), Drivers and Teams
 * (the same win tally as Winners, ranked instead of chronological - the same visual language
 * Track Intelligence's own driver list already uses), and Records (this circuit's genuine
 * all-time milestones - lap record, podiums, youngest/oldest - never affected by Track
 * Intelligence's own time-range filter). Drivers/Teams/Winners all share the same Grand-Prix-
 * scoped timeline (filterByRaceName) - never the circuit's combined history under a different
 * event's name; Records alone is deliberately circuit-wide, since an all-time physical-track
 * record isn't scoped to one event's own identity the way a win tally is.
 *
 * Shown for every race phase, not gated on completion - "who's won this race before" and "the
 * circuit's all-time records" are exactly as true and exactly as useful before a race weekend as
 * after one.
 *
 * Whichever tab has nothing real to show is simply not offered - never an empty tab a click reveals
 * nothing behind. The whole section disappears only when NONE of the four have anything at all.
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
  // Drivers/Teams are scoped to THIS Grand Prix specifically, the same identity Winners already
  // filters to (filterByRaceName) - never the circuit's combined history under a name change.
  const gpTimeline = filterByRaceName(timeline, raceName);
  const topDrivers = computeTopWinners(gpTimeline, 5);
  const topTeams = computeTopWinningTeams(gpTimeline, 5);

  const winnersAvailable = hasGrandPrixHistory(raceName, timeline);
  const recordsAvailable = hasCircuitRecords(timeline, liveRaces, archiveRaces, ageRecords);
  const availableTabs: { value: Tab; label: string }[] = [
    winnersAvailable ? { value: "winners" as const, label: "Winners" } : null,
    topDrivers.length > 0 ? { value: "drivers" as const, label: "Drivers" } : null,
    topTeams.length > 0 ? { value: "teams" as const, label: "Teams" } : null,
    recordsAvailable ? { value: "records" as const, label: "Records" } : null,
  ].filter((t): t is { value: Tab; label: string } => t !== null);

  const [tab, setTab] = useState<Tab | null>(availableTabs[0]?.value ?? null);
  if (availableTabs.length === 0) return null;
  const activeTab = tab && availableTabs.some((t) => t.value === tab) ? tab : availableTabs[0].value;

  const descriptionByTab: Record<Tab, string> = {
    winners: `${raceName}'s own past winners, year by year.`,
    drivers: `Most wins at ${raceName}, by driver.`,
    teams: `Most wins at ${raceName}, by constructor.`,
    records: `All-time milestones at ${circuitName}.`,
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.3, ease: "easeOut" }}>
      <RaceSectionCard
        title="Race History & Records"
        description={descriptionByTab[activeTab]}
        headerRight={availableTabs.length > 1 ? <QuietTabs options={availableTabs} value={activeTab} onChange={setTab} className="text-xs" /> : undefined}
      >
        {activeTab === "winners" && <GrandPrixHistoryContent raceName={raceName} timeline={timeline} />}
        {activeTab === "drivers" && <WinnersBarList entries={topDrivers.map((d) => ({ name: d.driver, count: d.wins }))} unit="win" />}
        {activeTab === "teams" && <WinnersBarList entries={topTeams.map((t) => ({ name: t.team, count: t.wins }))} unit="win" />}
        {activeTab === "records" && <CircuitRecordsContent timeline={timeline} liveRaces={liveRaces} archiveRaces={archiveRaces} ageRecords={ageRecords} />}
      </RaceSectionCard>
    </motion.div>
  );
}
