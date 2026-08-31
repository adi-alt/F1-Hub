"use client";

import { useState } from "react";
import { RacePodium, type PodiumEntry } from "@/components/raceDetail/RacePodium";
import { RaceResultsTable, type RaceResultRow } from "@/components/raceDetail/RaceResultsTable";
import { RaceStory, type RaceStoryFacts } from "@/components/raceDetail/RaceStory";
import { StatTiles, type StatTile } from "@/components/raceDetail/StatTiles";
import { useScrollToSection } from "@/hooks/useScrollToSection";
import { CircuitCard } from "./CircuitCard";
import { QualifyingBarChart } from "./QualifyingBarChart";
import { PitStopsTimeline } from "./PitStopsTimeline";
import { LapChart } from "./LapChart";
import type { ArchiveCircuit, ArchiveRaceDoc } from "@/lib/supabase/archive";

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

function SectionLabel({ children }: { children: string }) {
  return <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">{children}</p>;
}

/** Archive's race page as a flowing dashboard of always-visible sections instead of the old tab
 * shell - a section that genuinely has nothing backfilled yet (qualifying/pit-stops/laps) doesn't
 * render at all, rather than taking up space to say so ("Do not show a meaningless chart if
 * strategy data is incomplete" - the spec's own rule, extended past just Strategy to every
 * section here). Results always renders - final classification isn't optional for a classified
 * historical race. No Simulation section - archive has no simulation data for any historical
 * race, full stop. */
export function ArchiveRaceDashboard({ race, circuit }: { race: ArchiveRaceDoc; circuit: ArchiveCircuit | null }) {
  useScrollToSection();
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const podium: PodiumEntry[] = race.results
    .filter((r) => r.position <= 3)
    .sort((a, b) => a.position - b.position)
    .map((r) => ({ position: r.position as 1 | 2 | 3, driverName: r.driverName, team: r.constructor, gapOrTime: r.time ?? null, points: r.points }));

  const resultRows = race.results.filter((r) => r.position > 3).map(toResultRow);

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

  return (
    <div id="overview" className="space-y-10">
      <section className="glass-surface space-y-6 rounded-2xl p-5">
        {storyFacts && <RaceStory facts={storyFacts} />}
        <StatTiles tiles={statTiles} />
      </section>

      <section>
        {circuit ? (
          <CircuitCard circuit={circuit} weather={race.weather} />
        ) : (
          <>
            <SectionLabel>Circuit</SectionLabel>
            <p className="text-sm text-neutral-500">No circuit details backfilled for this race yet.</p>
          </>
        )}
      </section>

      <section id="results">
        <SectionLabel>Results</SectionLabel>
        <div className="space-y-6">
          <RacePodium entries={podium} />
          {resultRows.length > 0 && (
            <RaceResultsTable rows={resultRows} renderExpanded={renderExpanded} expandedKey={expandedKey} onToggleExpand={(k) => setExpandedKey((p) => (p === k ? null : k))} />
          )}
        </div>
      </section>

      {!!race.qualifying?.length && (
        <section id="qualifying">
          <SectionLabel>Qualifying</SectionLabel>
          <QualifyingBarChart qualifying={race.qualifying} />
        </section>
      )}

      {!!race.pitStops?.length && (
        <section id="strategy">
          <SectionLabel>Strategy</SectionLabel>
          <PitStopsTimeline pitStops={race.pitStops} results={race.results} />
        </section>
      )}

      {race.lapsBackfilled && (
        <section id="analysis">
          <SectionLabel>Race Progression</SectionLabel>
          <LapChart year={race.year} round={race.round} results={race.results} />
        </section>
      )}
    </div>
  );
}
