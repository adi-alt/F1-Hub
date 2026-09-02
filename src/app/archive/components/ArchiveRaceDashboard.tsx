"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { QuietTabs } from "@/app/season/_components/QuietTabs";
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
import { LapChart } from "./LapChart";
import { SimulationPanel } from "@/components/race/SimulationPanel";
import { PositionChangesPanel, type PositionChangeEntry } from "@/components/raceDetail/PositionChangesPanel";
import type { DriverSet } from "@/lib/driverSet";
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
  // The merged left column can show either the grid->finish rows or the existing gap-to-pole
  // chart - a separate, local toggle from driverSet above (this picks which visualization, not
  // how many drivers). Defaults to the compact rows view.
  const [qualifyingView, setQualifyingView] = useState<"performance" | "qualifying">("performance");

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
  // Same classified/grid/finish data as byMovement above, reshaped for the compact Race
  // Performance view instead of just the single biggest gainer/loser. driverCode is real (Ergast's
  // own 3-letter code) but optional on ArchiveResultEntry - falls back to the last name's own
  // first three letters (the same convention the real codes already follow) rather than leaving a
  // blank label for the rare row missing it.
  const allMovementEntries: PositionChangeEntry[] = classified
    .map((r) => ({
      code: r.driverCode ?? r.driverName.split(" ").pop()!.slice(0, 3).toUpperCase(),
      grid: r.grid!,
      finish: r.position,
      movement: r.grid! - r.position,
    }))
    .filter((e) => e.movement !== 0)
    .sort((a, b) => b.movement - a.movement);
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
  const hasSessionAnalysis = hasQualifying || hasStrategy || hasPositionChanges;
  // Qualifying and Position Changes share one column (a local toggle, not a separate column) -
  // side by side with Strategy only when Strategy also has real data.
  const raceAnalysisSideBySide = (hasQualifying || hasPositionChanges) && hasStrategy;
  const visibleMovementEntries = driverSet === "all" ? allMovementEntries : allMovementEntries.slice(0, driverSet === "top5" ? 5 : 10);
  // Nothing left to filter down to for a field of 5 or fewer. Governs Qualifying, Strategy, and
  // Position Changes together - one control for the whole section, not each panel's own.
  const driverSetFilter =
    Math.max(hasQualifying ? race.qualifying!.length : 0, hasStrategy ? race.pitStops!.length : 0, allMovementEntries.length) > 5 ? (
      <QuietTabs
        options={[
          { value: "top5" as const, label: "Top 5" },
          { value: "top10" as const, label: "Top 10" },
          { value: "all" as const, label: "All drivers" },
        ]}
        value={driverSet}
        onChange={setDriverSet}
        className="text-xs"
      />
    ) : undefined;

  return (
    <div id="overview" className="space-y-8">
      <section className="surface-inset rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/60 p-5 sm:p-6">
        {/* "Race Overview" lives inside the left column (not as a sibling above the grid) so that
            column's own top - not "Race Story"'s - is what items-start aligns the Circuit column
            against. The Circuit column is almost always shorter than the left column overall, and
            items-start (not the grid default, stretch) is what stops its own bordered box from
            growing to match and leaving a dead gap at its own bottom. */}
        <div className="grid items-start gap-6 lg:grid-cols-[1fr_20rem]">
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">Race Overview</p>
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
        <motion.div layout className="space-y-4">
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
        <RaceSectionCard title="Race Analysis" description="Grid position, finishing position and race strategy.">
          {/* Shared Top 5/10/All control, right-aligned above the 2-column area - governs
              Qualifying/Race Performance and Strategy together, so it lives at this level, not
              inside either panel's own header. */}
          {driverSetFilter && <div className="mb-6 flex justify-end">{driverSetFilter}</div>}
          {/* 1fr/1.15fr, not an even split - Strategy's tyre-stint bars need more horizontal room
              than Qualifying's driver-name + gap-chart layout to read well. minmax(0, ...), not a
              bare fr, so a wide chart can't force the column past its share (the classic CSS grid
              overflow trap for any fr track holding intrinsically-sized content). */}
          <div className={raceAnalysisSideBySide ? "grid items-start gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]" : undefined}>
            {(hasQualifying || hasPositionChanges) && (
              // Both sides now driver-set-filtered to the same count (sessionChartHeight, the
              // shared row-height formula both charts use) - "the taller of the two" is no longer
              // a fixed asymmetry, it only happens if one field genuinely has more real rows than
              // the other at the same Top 5/10/All setting. lg:border-r/pr for a visible divider
              // between the two side by side; a bottom border instead once they stack under lg:.
              // Only when Strategy also exists - nothing to divide from otherwise.
              <div id="qualifying" className={raceAnalysisSideBySide ? "min-w-0 border-b border-[var(--f1-line)] pb-8 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-10" : "min-w-0"}>
                {/* Qualifying and the new Grid -> Finish view share this one column via a local
                    toggle (not the shared driverSet above - this picks *which* chart, not how
                    many drivers) so the gap-to-pole chart stays available without needing its own
                    separate column. Falls back to whichever one actually has data when only one
                    of the two does. */}
                {hasQualifying && hasPositionChanges ? (
                  <RaceSubSection
                    label="Qualifying"
                    first
                    headerRight={
                      <QuietTabs
                        options={[
                          { value: "performance" as const, label: "Race Performance" },
                          { value: "qualifying" as const, label: "Qualifying" },
                        ]}
                        value={qualifyingView}
                        onChange={setQualifyingView}
                        className="text-xs"
                      />
                    }
                  >
                    {qualifyingView === "performance" ? <PositionChangesPanel entries={visibleMovementEntries} /> : <QualifyingBarChart qualifying={race.qualifying!} driverSet={driverSet} />}
                  </RaceSubSection>
                ) : hasQualifying ? (
                  <RaceSubSection label="Qualifying" first>
                    <QualifyingBarChart qualifying={race.qualifying!} driverSet={driverSet} />
                  </RaceSubSection>
                ) : (
                  <RaceSubSection label="Race Performance" first>
                    <PositionChangesPanel entries={visibleMovementEntries} />
                  </RaceSubSection>
                )}
              </div>
            )}
            {hasStrategy && (
              <div id="strategy" className="min-w-0">
                <RaceSubSection label="Strategy" first>
                  <PitStopsTimeline pitStops={race.pitStops!} results={race.results} driverSet={driverSet} />
                </RaceSubSection>
              </div>
            )}
          </div>
        </RaceSectionCard>
      )}

      {race.lapsBackfilled && (
        <RaceSectionCard id="analysis" title="Lap Chart" description="Track position, lap by lap.">
          <LapChart year={race.year} round={race.round} results={race.results} />
        </RaceSectionCard>
      )}

      {simulation && (
        <RaceSectionCard id="simulation" title="Simulation">
          <SimulationPanel simulation={simulation} />
        </RaceSectionCard>
      )}
    </div>
  );
}
