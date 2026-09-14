"use client";

import { useMemo, useState } from "react";
import { SeasonMap, nodeStatus } from "./SeasonMap";
import { CircuitFocusPanel } from "./CircuitFocusPanel";
import { CircuitInsights } from "./CircuitInsights";
import { CircuitApexScope } from "./ai/CircuitApexScope";
import type { CircuitExplorerEntry } from "../services/circuits.service";

/**
 * The Circuits homepage's one real client boundary - owns which round is currently selected (the
 * one piece of state SeasonMap, CircuitFocusPanel, and Ask Apex's own scope all need to agree on),
 * so clicking any round in the season map updates the focus panel below it AND what Ask Apex knows
 * about, together, deterministically. Ask Apex here is the exact same global component/scope
 * mechanism the circuit detail page already uses (CircuitApexScope) - not a second, homepage-
 * specific Ask Apex design; only which circuit it's scoped to changes with the selection.
 */
export function CircuitsExplorer({ entries, favoriteTracks, year }: { entries: CircuitExplorerEntry[]; favoriteTracks: string[]; year: number }) {
  const defaultRound = useMemo(() => {
    const current = entries.find((e) => nodeStatus(e.race) === "current");
    if (current) return current.race.round;
    // Season's over (every round completed) or hasn't started (every round upcoming) - the most
    // recently completed round, or failing that the very first one, is a more useful default
    // focus than an arbitrary pick.
    const lastCompleted = [...entries].reverse().find((e) => nodeStatus(e.race) === "completed");
    return (lastCompleted ?? entries[0])?.race.round ?? null;
  }, [entries]);

  const [selectedRound, setSelectedRound] = useState<number | null>(defaultRound);
  const selected = entries.find((e) => e.race.round === selectedRound) ?? entries.find((e) => e.race.round === defaultRound) ?? null;

  return (
    <div className="mt-6 flex flex-col gap-6">
      <SeasonMap entries={entries} favoriteTracks={favoriteTracks} selectedRound={selectedRound} onSelect={setSelectedRound} />

      {selected && (
        <>
          <CircuitFocusPanel entry={selected} year={year} />
          <CircuitInsights location={selected.race.circuit ?? selected.race.name} year={year} />
          <CircuitApexScope
            location={selected.race.circuit ?? selected.race.name}
            circuitName={selected.facts?.venueName ?? selected.race.circuit ?? selected.race.name}
            year={year}
            status={selected.race.state}
          />
        </>
      )}
    </div>
  );
}
