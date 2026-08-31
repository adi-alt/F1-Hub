"use client";

import { RaceTabShell, type RaceTab } from "@/components/raceDetail/RaceTabShell";
import { RacePodium, type PodiumEntry } from "@/components/raceDetail/RacePodium";
import { RaceResultsTable, type RaceResultRow } from "@/components/raceDetail/RaceResultsTable";
import { useUrlParam } from "@/hooks/useUrlParam";
import { CircuitCard } from "./CircuitCard";
import { QualifyingBarChart } from "./QualifyingBarChart";
import { PitStopsTimeline } from "./PitStopsTimeline";
import { LapChart } from "./LapChart";
import type { ArchiveCircuit, ArchiveRaceDoc } from "@/lib/supabase/archive";
import { useState } from "react";

const TABS: RaceTab[] = [
  { key: "overview", label: "Overview" },
  { key: "results", label: "Results" },
  { key: "qualifying", label: "Qualifying" },
  { key: "strategy", label: "Strategy" },
  { key: "analysis", label: "Analysis" },
];

function toResultRow(r: ArchiveRaceDoc["results"][number]): RaceResultRow {
  const isRetired = !(r.status === "Finished" || /^\+\d+ Lap/.test(r.status));
  return {
    key: r.driverId,
    positionText: r.positionText,
    driverName: r.driverName,
    team: r.constructor,
    statusLabel: r.status,
    secondaryLabel: isRetired ? (r.laps != null ? `Lap ${r.laps}` : r.status) : (r.time ?? "–"),
    points: r.points,
    fastestLap: r.fastestLap?.rank === 1,
  };
}

/** Owns the race page's tab state (URL-persisted, same useUrlParam convention every other Archive
 * facet/filter already uses - a shared raceHref(..., "tab") link lands directly on the right tab)
 * and maps ArchiveRaceDoc's real fields down to the shared raceDetail primitives' plain shapes.
 * No Simulation tab - archive has no simulation data for any historical race, full stop (see the
 * plan's own data-reality note); showing one that always says "unavailable" would be worse than
 * not having it. */
export function ArchiveRaceTabs({ race, circuit }: { race: ArchiveRaceDoc; circuit: ArchiveCircuit | null }) {
  const [tab, setTab] = useUrlParam("tab", "overview");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const activeTab = TABS.some((t) => t.key === tab) ? tab : "overview";

  const podium: PodiumEntry[] = race.results
    .filter((r) => r.position <= 3)
    .sort((a, b) => a.position - b.position)
    .map((r) => ({ position: r.position as 1 | 2 | 3, driverName: r.driverName, team: r.constructor, gapOrTime: r.time ?? null, points: r.points }));

  const resultRows = race.results.filter((r) => r.position > 3).map(toResultRow);

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
    <RaceTabShell tabs={TABS} active={activeTab} onChange={setTab}>
      {activeTab === "overview" &&
        (circuit ? (
          <CircuitCard circuit={circuit} weather={race.weather} />
        ) : (
          <p className="text-sm text-neutral-500">No circuit details backfilled for this race yet.</p>
        ))}

      {activeTab === "results" && (
        <div className="space-y-6">
          <RacePodium entries={podium} />
          {resultRows.length > 0 && (
            <RaceResultsTable rows={resultRows} renderExpanded={renderExpanded} expandedKey={expandedKey} onToggleExpand={(k) => setExpandedKey((p) => (p === k ? null : k))} />
          )}
        </div>
      )}

      {activeTab === "qualifying" &&
        (race.qualifying?.length ? <QualifyingBarChart qualifying={race.qualifying} /> : <p className="text-sm text-neutral-500">No qualifying data backfilled for this race yet.</p>)}

      {activeTab === "strategy" &&
        (race.pitStops?.length ? (
          <PitStopsTimeline pitStops={race.pitStops} results={race.results} />
        ) : (
          <p className="text-sm text-neutral-500">No pit stop data backfilled for this race yet.</p>
        ))}

      {activeTab === "analysis" &&
        (race.lapsBackfilled ? (
          <LapChart year={race.year} round={race.round} results={race.results} />
        ) : (
          <p className="text-sm text-neutral-500">No lap-by-lap data backfilled for this race yet.</p>
        ))}
    </RaceTabShell>
  );
}
