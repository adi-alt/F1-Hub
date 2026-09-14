"use client";

import { useState } from "react";
import Link from "next/link";
import { CurrentSeasonPerformance } from "./CurrentSeasonPerformance";
import { CircuitApexTake } from "./ai/CircuitApexTake";
import { TrackMap } from "@/components/circuit/TrackMap";
import { ClassificationTable } from "@/components/circuit/ClassificationTable";
import { GridToFinishChart } from "@/components/circuit/GridToFinishChart";
import { raceHref } from "@/lib/routes";
import type { CircuitFacts } from "@/lib/circuitFacts";
import type { RaceSummary } from "@/app/season/_service/season.pure";
import type { RaceDoc } from "@/lib/types/race";
import type { RaceLapEntry } from "@/lib/supabase/races";
import type { CurrentDriver, CurrentTeam } from "@/lib/supabase/media";

/**
 * The Track Experience section - left column (this season's performance + the track map), right
 * column (classification, grid->finish, Apex intelligence). One client component, not a server
 * page wiring three independent client islands together, specifically so the track map's own
 * driver dots, the classification table's rows, and the grid->finish curve can all share ONE
 * hover/selection state: hovering any one of them highlights the same driver everywhere else, the
 * way a real linked-views dashboard does. Everything here is already-resolved server data passed
 * straight through as props - nothing in this file fetches anything itself.
 */
export function TrackExperienceGrid({
  location,
  year,
  facts,
  currentSeasonRace,
  raceForSimulation,
  raceLaps,
  avgFieldMovement,
  currentDrivers,
  currentTeams,
}: {
  location: string;
  year: number;
  facts: CircuitFacts | null;
  currentSeasonRace: RaceSummary | null;
  raceForSimulation: RaceDoc | null;
  raceLaps: RaceLapEntry[];
  avgFieldMovement: number | null;
  currentDrivers: CurrentDriver[];
  currentTeams: CurrentTeam[];
}) {
  const [hoverDriver, setHoverDriver] = useState<string | null>(null);
  const [selectedDriver, setSelectedDriver] = useState<string | null>(null);

  return (
    <div className="mb-8">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
          {raceForSimulation ? `Track experience — ${raceForSimulation.year}` : "Track layout"}
        </p>
        {/* The one deliberate link out of this circuit-across-time page into the event-specific
            Race page - "this track's most recent classified race" for full results, laps,
            strategy and incidents, which the Circuit page itself never duplicates. Styled as a
            real CTA since it's the one path off this page into the event itself. */}
        {raceForSimulation && (
          <Link
            href={raceHref(raceForSimulation.year, raceForSimulation.round, raceForSimulation.name)}
            className="shrink-0 rounded-lg bg-[var(--f1-red)] px-3 py-1.5 text-[11px] font-semibold text-white transition hover:brightness-110"
          >
            Full race analysis →
          </Link>
        )}
      </div>
      <div aria-hidden className="mt-2 h-px w-full bg-gradient-to-r from-white/[0.09] to-transparent" />
      <div className="mt-4 grid grid-cols-1 items-stretch gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        {/* Left: this season's own real result at this circuit (when it's run, Track Character
            included), then the track map and its own playback controls/legend/driver readout -
            the map is flex-1 at lg+ so it fills whatever's left after the performance card,
            matching the right column's real height instead of leaving dead space under a fixed-
            aspect map. */}
        <div className="flex min-w-0 flex-col gap-8 lg:h-full">
          {currentSeasonRace?.state === "completed" && (
            <CurrentSeasonPerformance race={currentSeasonRace} year={year} facts={facts} avgFieldMovement={avgFieldMovement} />
          )}
          <TrackMap
            className="lg:min-h-0 lg:flex-1"
            seed={location}
            turns={facts?.turns ?? 14}
            trackType={facts?.trackType ?? "permanent"}
            results={raceForSimulation?.results ?? null}
            tireStints={raceForSimulation?.tireStints ?? null}
            raceLaps={raceForSimulation ? raceLaps : null}
            raceLabel={raceForSimulation ? `${raceForSimulation.year} race` : null}
            hoverDriver={hoverDriver}
            onHoverDriver={setHoverDriver}
            selectedDriver={selectedDriver}
            onSelectedDriver={setSelectedDriver}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          {raceForSimulation?.results && (
            <>
              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500">{raceForSimulation.year} classification</p>
                <ClassificationTable
                  results={raceForSimulation.results}
                  currentDrivers={currentDrivers}
                  currentTeams={currentTeams}
                  hoverDriver={hoverDriver}
                  onHoverDriver={setHoverDriver}
                  selectedDriver={selectedDriver}
                  onSelectedDriver={setSelectedDriver}
                />
              </div>
              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500">Grid → finish</p>
                <GridToFinishChart
                  results={raceForSimulation.results}
                  tireStints={raceForSimulation.tireStints ?? []}
                  hoverDriver={hoverDriver}
                  onHoverDriver={setHoverDriver}
                />
              </div>
            </>
          )}
          {/* Apex's own editorial read lives here, not as a separate full-width section below the
              whole grid - this is real space the right column already has, and a tabbed block
              fits it far better than a long vertical stack of four text sections ever did. Not
              gated on raceForSimulation - Apex can still have something real to say
              (unscheduled/next state) for a circuit with no completed live-schema race at all. */}
          <CircuitApexTake location={location} year={year} status={currentSeasonRace?.state ?? "unscheduled"} />
        </div>
      </div>
    </div>
  );
}
