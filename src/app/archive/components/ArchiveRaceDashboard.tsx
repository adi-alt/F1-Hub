"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { QuietTabs } from "@/app/season/_components/QuietTabs";
import { EntityMultiSelect, type MultiSelectOption } from "@/app/season/_components/EntityMultiSelect";
import { RacePodium, type PodiumEntry } from "@/components/raceDetail/RacePodium";
import { RaceResultsTable, type RaceResultRow } from "@/components/raceDetail/RaceResultsTable";
import { RaceSectionCard } from "@/components/raceDetail/RaceSectionCard";
import { RaceStory, type RaceStoryFacts } from "@/components/raceDetail/RaceStory";
import { RaceSubSection } from "@/components/raceDetail/RaceSubSection";
import { StatTiles, type StatTile } from "@/components/raceDetail/StatTiles";
import { useScrollToSection } from "@/hooks/useScrollToSection";
import { CircuitCard } from "./CircuitCard";
import { QualifyingBarChart } from "./QualifyingBarChart";
import { PitStopsTimeline } from "./PitStopsTimeline";
import { useArchiveLaps } from "../_hooks/useArchiveLaps";
import { SimulationPanel } from "@/components/race/SimulationPanel";
import { PositionChangesPanel, type PositionChangeEntry } from "@/components/raceDetail/PositionChangesPanel";
import { LapChart, type LapChartResultEntry } from "@/components/raceDetail/LapChart";
import { filterDriverSet, type DriverSet } from "@/lib/driverSet";
import { teamColor } from "@/lib/teamColors";
import type { ArchiveCircuit, ArchiveRaceDoc } from "@/lib/supabase/archive";
import type { RaceSimulation } from "@/lib/types/race";

// Podium (3) + this many more visible by default - "Show all results" reveals the rest, so a
// 20+ car historical field doesn't turn Results into a wall-length scroll inside its own card.
const INITIAL_RESULT_ROWS = 7;

// "Finished" / "+N Lap(s)" classify as having completed the race; anything else (Retired,
// Accident, Engine, DNF, ...) doesn't - archive's status is free text, not a strict enum, same
// classification toResultRow's own secondaryLabel and season.service.ts's archiveFinishStatus
// already use.
function isRetired(status: string): boolean {
  return !(status === "Finished" || /^\+\d+ Lap/.test(status));
}

function toResultRow(r: ArchiveRaceDoc["results"][number]): RaceResultRow {
  const retired = isRetired(r.status);
  return {
    key: r.driverId,
    positionText: r.positionText,
    driverName: r.driverName,
    team: r.constructor,
    statusLabel: r.status,
    secondaryLabel: retired ? (r.laps != null ? `Lap ${r.laps}` : r.status) : (r.time ?? "–"),
    points: r.points,
    fastestLap: r.fastestLap?.rank === 1,
  };
}

/** Archive's race page as a flowing dashboard of always-visible, individually bounded sections
 * instead of the old tab shell - a section that genuinely has nothing backfilled yet (qualifying/
 * pit-stops/laps) doesn't render at all, rather than taking up space to say so. Qualifying,
 * Race Performance (grid -> finish) and Strategy live inside one "Race Analysis" module
 * (RaceSubSection), same grouping SeasonRaceDashboard uses for Practice/Qualifying/Strategy -
 * Archive has no practice data, so this side's Race Analysis is just the two columns. Results
 * always renders - final classification
 * isn't optional for a classified historical race. `simulation` comes from `races.simulation`
 * (the current-season table), fetched separately by the page and passed in here - confirmed live
 * it's populated for effectively every race back to 2018, a real dataset `archive_races` itself
 * has no equivalent of, not fabricated for races where it's genuinely absent. */
export function ArchiveRaceDashboard({ race, circuit, simulation }: { race: ArchiveRaceDoc; circuit: ArchiveCircuit | null; simulation: RaceSimulation | null }) {
  useScrollToSection();
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [showAllResults, setShowAllResults] = useState(false);
  // Shared between Qualifying and Strategy - one control, not each picking its own. Each side
  // keeps its own natural ordering (Qualifying by grid/gap-to-pole, Strategy by finishing
  // position - its existing convention) sliced to this same count, rather than forcing identical
  // driver identities across two genuinely different rankings onto one side or the other.
  const [driverSet, setDriverSet] = useState<DriverSet>("top5");
  // Only meaningful while driverSet === "custom" - kept even when switching away so re-selecting
  // Custom later doesn't lose the previous picks.
  const [customDriverIds, setCustomDriverIds] = useState<string[]>([]);
  const { data: laps, isLoading: lapsLoading, isError: lapsError } = useArchiveLaps(race.year, race.round);

  const podium: PodiumEntry[] = race.results
    .filter((r) => r.position <= 3)
    .sort((a, b) => a.position - b.position)
    .map((r) => ({ position: r.position as 1 | 2 | 3, driverName: r.driverName, team: r.constructor, gapOrTime: r.time ?? null, points: r.points }));

  const allResultRows = race.results.filter((r) => r.position > 3).map(toResultRow);
  const resultRows = showAllResults ? allResultRows : allResultRows.slice(0, INITIAL_RESULT_ROWS);

  // Same facts computeHighlights derives for the current season, mapped from ArchiveResultEntry/
  // ArchiveQualifyingEntry instead - no new data, just the archive-side equivalent of the same
  // computation (see season.service.ts's own comment on this exact "adapt at the call site"
  // pattern for why this isn't a shared function forced across two incompatible field names).
  const winner = race.results.find((r) => r.position === 1);
  const poleSitterName = race.qualifying?.find((q) => q.position === 1)?.driverName ?? race.results.find((r) => r.grid === 1)?.driverName ?? null;
  const fastestLapEntry = race.results.find((r) => r.fastestLap?.rank === 1);
  const classified = race.results.filter((r) => !isRetired(r.status) && r.grid !== null);
  const byMovement = classified.map((r) => ({ driverName: r.driverName, movement: r.grid! - r.position })).sort((a, b) => b.movement - a.movement);
  const gainer = byMovement[0];
  const loser = byMovement.at(-1);
  // Same classified/grid/finish data as byMovement above, reshaped for the full Race Performance
  // comparison instead of just the single biggest gainer/loser - every classified driver, not only
  // the ones who actually moved (a driver who held station is still a real, worth-showing "no
  // change" row, not something to hide). driverCode is real (Ergast's own 3-letter code) but
  // optional on ArchiveResultEntry - falls back to the last name's own first three letters (the
  // same convention the real codes already follow) rather than leaving a blank label for the rare
  // row missing it. driverId is the real Ergast id (not the display code) - what the shared Custom
  // driver picker actually filters against, matching Qualifying/Strategy's own identifier.
  const allMovementEntries: PositionChangeEntry[] = classified
    .map((r) => ({
      code: r.driverCode ?? r.driverName.split(" ").pop()!.slice(0, 3).toUpperCase(),
      driverId: r.driverId,
      grid: r.grid!,
      finish: r.position,
      movement: r.grid! - r.position,
    }))
    .sort((a, b) => b.movement - a.movement || a.finish - b.finish);
  // The whole field's own real range, not just whoever's currently visible - Race Performance's
  // position-flow track uses one fixed P1..P{fieldSize} scale so switching Top 5 -> All never
  // rescales the axis underneath rows already on screen.
  const fieldSize = Math.max(1, ...classified.map((r) => Math.max(r.grid!, r.position)));
  const dnfCount = race.results.filter((r) => isRetired(r.status)).length;
  const winningMargin = race.results.find((r) => r.position === 2)?.time ?? null;

  const storyFacts: RaceStoryFacts | null = winner
    ? {
        winnerName: winner.driverName,
        poleSitterName,
        fastestLap: fastestLapEntry ? { driverName: fastestLapEntry.driverName, timeLabel: fastestLapEntry.fastestLap!.time } : null,
        biggestGainer: gainer && gainer.movement > 0 ? { driverName: gainer.driverName, positionsGained: gainer.movement } : null,
        biggestLoser: loser && loser.movement < 0 ? { driverName: loser.driverName, positionsLost: -loser.movement } : null,
        dnfCount,
      }
    : null;
  const statTiles: StatTile[] = [
    { label: "Pole position", value: poleSitterName ?? "–" },
    { label: "Fastest lap", value: fastestLapEntry?.driverName ?? "–", sub: fastestLapEntry?.fastestLap?.time },
    { label: "Winning margin", value: winningMargin ?? "–" },
    { label: "DNFs", value: String(dnfCount) },
  ];

  function renderExpanded(driverId: string) {
    const quali = race.qualifying?.find((q) => q.driverId === driverId);
    const stops = race.pitStops?.filter((p) => p.driverId === driverId) ?? [];
    return (
      <div className="grid gap-3 border-t border-white/10 px-3 py-2.5 text-sm sm:grid-cols-2">
        <div>
          <p className="mb-1 text-xs uppercase tracking-wide text-neutral-500">Qualifying</p>
          {quali ? (
            <p className="text-neutral-300">
              P{quali.position} – {quali.q3 ?? quali.q2 ?? quali.q1 ?? "no time"}
            </p>
          ) : (
            <p className="text-neutral-500">Not available for this race.</p>
          )}
        </div>
        <div>
          <p className="mb-1 text-xs uppercase tracking-wide text-neutral-500">Pit stops {stops.length > 0 && `(${stops.length})`}</p>
          {stops.length > 0 ? (
            <ul className="space-y-0.5 text-neutral-300">
              {stops
                .sort((a, b) => a.stop - b.stop)
                .map((s) => (
                  <li key={s.stop}>
                    Lap {s.lap} – {s.durationSec !== null ? `${s.durationSec.toFixed(3)}s` : "–"}
                  </li>
                ))}
            </ul>
          ) : (
            <p className="text-neutral-500">None recorded.</p>
          )}
        </div>
      </div>
    );
  }

  const hasQualifying = !!race.qualifying?.length;
  const hasStrategy = !!race.pitStops?.length;
  const hasPositionChanges = allMovementEntries.length > 0;
  const hasLapChart = race.lapsBackfilled;
  const hasSessionAnalysis = hasQualifying || hasStrategy || hasPositionChanges || hasLapChart;
  // Real ArchiveResultEntry rows already have driverId/driverName/position - LapChart's own prop
  // type is exactly that shape (defined there, not here) so this needs no field renaming, just a
  // type-level assertion that the wider ArchiveResultEntry satisfies it.
  const lapChartResults: LapChartResultEntry[] = race.results;
  const visibleMovementEntries = filterDriverSet(allMovementEntries, driverSet, (e) => e.driverId, customDriverIds);
  // The full roster (not just classified/finishers) - Custom should still be able to pick a driver
  // who retired, same as every other picker on this page.
  const customSelectOptions: MultiSelectOption[] = race.results.map((r) => ({ code: r.driverId, label: r.driverName, color: teamColor(r.constructor) }));
  // Nothing left to filter down to for a field of 5 or fewer. Governs Qualifying, Strategy, Lap
  // Progression, and Race Performance together - one control for the whole section, not each
  // panel's own.
  const driverSetFilter =
    Math.max(hasQualifying ? race.qualifying!.length : 0, hasStrategy ? race.pitStops!.length : 0, allMovementEntries.length) > 5 ? (
      <div className="flex flex-wrap items-center gap-3">
        <QuietTabs
          options={[
            { value: "top5" as const, label: "Top 5" },
            { value: "top10" as const, label: "Top 10" },
            { value: "all" as const, label: "All drivers" },
            { value: "custom" as const, label: "Custom" },
          ]}
          value={driverSet}
          onChange={setDriverSet}
          className="text-xs"
        />
        {driverSet === "custom" && (
          <EntityMultiSelect options={customSelectOptions} selected={customDriverIds} onChange={setCustomDriverIds} placeholder="Select drivers" triggerClassName="h-8 py-1 text-xs" />
        )}
      </div>
    ) : undefined;

  return (
    <div id="overview" className="space-y-6">
      <section className="surface-inset rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/60 p-4 sm:p-5">
        {/* No separate "Race Overview" eyebrow above this - RaceStory already renders its own
            "Race story" label, and a second heading above it just said the same thing twice.
            Left column (not a sibling above the grid) so that column's own top - not "Race
            Story"'s - is what items-start aligns the Circuit column against. The Circuit column
            is almost always shorter than the left column overall, and items-start (not the grid
            default, stretch) is what stops its own bordered box from growing to match and
            leaving a dead gap at its own bottom. */}
        <div className="grid items-start gap-5 lg:grid-cols-[1fr_20rem]">
          <div className="space-y-3">
            {storyFacts && <RaceStory facts={storyFacts} />}
            <StatTiles tiles={statTiles} />
          </div>
          {circuit ? (
            <CircuitCard circuit={circuit} weather={race.weather} />
          ) : (
            <div className="surface-inset rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/60 p-4 text-sm text-neutral-500">
              No circuit details backfilled for this race yet.
            </div>
          )}
        </div>
      </section>

      <RaceSectionCard id="results" title="Results">
        <motion.div layout className="space-y-3">
          <RacePodium entries={podium} />
          {resultRows.length > 0 && (
            <RaceResultsTable rows={resultRows} renderExpanded={renderExpanded} expandedKey={expandedKey} onToggleExpand={(k) => setExpandedKey((p) => (p === k ? null : k))} />
          )}
          {allResultRows.length > INITIAL_RESULT_ROWS && (
            <button
              type="button"
              onClick={() => setShowAllResults((v) => !v)}
              className="mx-auto block text-sm text-neutral-400 transition hover:text-white"
            >
              {showAllResults ? "Show fewer results ↑" : `Show all results (+${allResultRows.length - INITIAL_RESULT_ROWS}) ↓`}
            </button>
          )}
        </motion.div>
      </RaceSectionCard>

      {hasSessionAnalysis && (
        <motion.div initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.3, ease: "easeOut" }}>
          <RaceSectionCard
            title="Race Analysis"
            description="Grid position, qualifying pace, race strategy, lap progression and finishing performance."
            headerRight={driverSetFilter}
          >
            {/* Qualifying and Strategy share a row - they're the two panels that genuinely
                benefit from sitting side by side at a comparable width. Lap Progression needs
                real horizontal room to read a whole field's trajectories, and Race Performance
                reads best as one full-width comparison strip - forcing either into a second
                column here is exactly the cramped, dead-space-heavy layout this redesign
                replaces, so both get their own full-width row below instead. */}
            <div className={hasQualifying && hasStrategy ? "grid items-start gap-x-8 gap-y-6 lg:grid-cols-2" : undefined}>
              {hasQualifying && (
                <div id="qualifying" className={hasStrategy ? "min-w-0 border-b border-[var(--f1-line)] pb-6 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-8" : "min-w-0"}>
                  <RaceSubSection label="Qualifying" description="Gap to pole position across classified drivers." first>
                    <QualifyingBarChart qualifying={race.qualifying!} driverSet={driverSet} customIds={customDriverIds} />
                  </RaceSubSection>
                </div>
              )}
              {hasStrategy && (
                <div id="strategy" className="min-w-0">
                  <RaceSubSection label="Strategy" description="Tyre compounds and stint lengths across the race." first>
                    <PitStopsTimeline pitStops={race.pitStops!} results={race.results} driverSet={driverSet} customIds={customDriverIds} />
                  </RaceSubSection>
                </div>
              )}
            </div>
            {hasLapChart && (
              <div id="analysis" className={hasQualifying || hasStrategy ? "mt-6 border-t border-[var(--f1-line)] pt-6" : ""}>
                <RaceSubSection label="Lap Progression" description="Race position changes lap by lap." first>
                  <LapChart laps={laps} isLoading={lapsLoading} isError={lapsError} results={lapChartResults} driverSet={driverSet} customIds={customDriverIds} />
                </RaceSubSection>
              </div>
            )}
            {hasPositionChanges && (
              <div id="race-performance" className={hasQualifying || hasStrategy || hasLapChart ? "mt-6 border-t border-[var(--f1-line)] pt-6" : ""}>
                <RaceSubSection label="Race Performance" description="Starting grid position compared with finishing position." first>
                  <PositionChangesPanel entries={visibleMovementEntries} fieldSize={fieldSize} />
                </RaceSubSection>
              </div>
            )}
          </RaceSectionCard>
        </motion.div>
      )}

      {simulation && (
        <motion.div initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.3, ease: "easeOut" }}>
          <RaceSectionCard
            id="simulation"
            title="Simulation"
            description="Monte Carlo projection based on grid position, race pace and DNF probability."
            headerRight={<span className="text-xs text-neutral-500">Based on 10,000 simulations</span>}
          >
            <SimulationPanel simulation={simulation} />
          </RaceSectionCard>
        </motion.div>
      )}
    </div>
  );
}
