"use client";

import { useState } from "react";
import { TabList, TabPanels, Tabs } from "@/components/ui/Tabs";
import { EYEBROW } from "@/components/ui/panel";
import { RaceSectionCard } from "./RaceSectionCard";
import { WinnersBarList } from "./WinnersBarList";
import { GrandPrixHistoryContent, hasGrandPrixHistory, type WinnerMediaByYear } from "./GrandPrixHistorySection";
import { CircuitRecordsContent, hasCircuitRecords } from "./CircuitRecordsSection";
import { TrackTrendsContent, hasTrackTrends } from "@/components/race/TrackIntelligence";
import { computeTopWinners, computeTopWinningTeams, filterByRaceName, type CircuitYearRecord } from "@/lib/circuitIntelligence";
import type { AgeRecords } from "@/lib/circuitRecords";
import { teamColor } from "@/lib/teamColors";
import type { RaceDoc } from "@/lib/types/race";
import type { ArchiveRaceDoc } from "@/lib/supabase/archive";

type Tab = "winners" | "most" | "trends" | "records";

/**
 * The race's history in one section with up to four tabs. Winners and Most wins follow the EVENT (eventTimeline:
 * every running of this Grand Prix by name, across every circuit it has used); Trends and Records follow the
 * physical track (timeline), since a lap record or a weather trend belongs to a circuit, not an event. A tab with
 * nothing real behind it is not offered; with none, the section is gone.
 */
export function RaceHistorySection({
  raceName,
  circuitName,
  timeline,
  eventTimeline = timeline,
  winnerMedia,
  liveRaces,
  archiveRaces,
  ageRecords,
}: {
  raceName: string;
  circuitName: string;
  timeline: CircuitYearRecord[];
  /** Every running of this Grand Prix by name, wherever it was held. Defaults to the circuit's own timeline. */
  eventTimeline?: CircuitYearRecord[];
  winnerMedia?: WinnerMediaByYear;
  liveRaces: RaceDoc[];
  archiveRaces: ArchiveRaceDoc[];
  ageRecords: AgeRecords;
}) {
  const gpTimeline = filterByRaceName(eventTimeline, raceName);
  const topDrivers = computeTopWinners(gpTimeline, 5);
  const topTeams = computeTopWinningTeams(gpTimeline, 5);
  // A driver's bar takes the colour of the team they last won this race with.
  const lastTeamOf = new Map<string, string>();
  for (const r of [...gpTimeline].reverse()) if (r.winnerDriver && r.winnerTeam) lastTeamOf.set(r.winnerDriver, r.winnerTeam);

  const availableTabs: { value: Tab; label: string }[] = [
    hasGrandPrixHistory(raceName, eventTimeline) ? { value: "winners" as const, label: "Winners" } : null,
    topDrivers.length > 1 ? { value: "most" as const, label: "Most wins" } : null,
    hasTrackTrends(liveRaces, archiveRaces) ? { value: "trends" as const, label: "Trends" } : null,
    hasCircuitRecords(timeline, liveRaces, archiveRaces, ageRecords) ? { value: "records" as const, label: "Track records" } : null,
  ].filter((t): t is { value: Tab; label: string } => t !== null);

  const [tab, setTab] = useState<Tab | null>(availableTabs[0]?.value ?? null);
  if (availableTabs.length === 0) return null;
  const activeTab = tab && availableTabs.some((t) => t.value === tab) ? tab : availableTabs[0].value;

  const descriptionByTab: Record<Tab, string> = {
    winners: `Every ${raceName} winner, most recent first.`,
    most: `The most successful drivers and teams at the ${raceName}.`,
    trends: `How races at ${circuitName} tend to go.`,
    records: `All-time records at ${circuitName}.`,
  };

  const content = (
    <>
      {activeTab === "winners" && <GrandPrixHistoryContent raceName={raceName} timeline={eventTimeline} venue={circuitName} media={winnerMedia} />}
      {activeTab === "most" && (
        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <h3 className={EYEBROW}>Drivers</h3>
            <div className="mt-3">
              <WinnersBarList entries={topDrivers.map((d) => ({ name: d.driver, count: d.wins, color: lastTeamOf.has(d.driver) ? teamColor(lastTeamOf.get(d.driver)!) : undefined }))} unit="win" />
            </div>
          </div>
          {topTeams.length > 0 && (
            <div>
              <h3 className={EYEBROW}>Teams</h3>
              <div className="mt-3">
                <WinnersBarList entries={topTeams.map((t) => ({ name: t.team, count: t.wins, color: teamColor(t.team) }))} unit="win" />
              </div>
            </div>
          )}
        </div>
      )}
      {activeTab === "trends" && <TrackTrendsContent liveRaces={liveRaces} archiveRaces={archiveRaces} circuitName={circuitName} />}
      {activeTab === "records" && <CircuitRecordsContent timeline={timeline} liveRaces={liveRaces} archiveRaces={archiveRaces} ageRecords={ageRecords} />}
    </>
  );
  // With one tab there's nothing to switch, so no strip and no panels.
  const tabbed = availableTabs.length > 1;

  return (
    <Tabs value={activeTab} onValueChange={setTab} items={availableTabs}>
      <RaceSectionCard id="history" title="Race history" description={descriptionByTab[activeTab]} headerRight={tabbed ? <TabList aria-label="Race history" /> : undefined}>
        {tabbed ? <TabPanels>{content}</TabPanels> : content}
      </RaceSectionCard>
    </Tabs>
  );
}
