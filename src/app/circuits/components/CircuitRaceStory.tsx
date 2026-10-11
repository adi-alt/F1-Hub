"use client";

import { useMemo, useState } from "react";
import { RaceStoryline } from "@/components/raceDetail/RaceStoryline";
import { computeStoryline } from "@/lib/raceMoments";
import { teamColor } from "@/lib/teamColors";
import type { CircuitLayout } from "@/lib/circuitLayout";
import type { RaceTrackStory } from "@/lib/raceTrackStory";
import type { RaceLapEntry } from "@/lib/supabase/races";
import type { RaceResultEntry } from "@/lib/types/race";

/**
 * The circuit's latest race as a story on the circuit itself: its chapters (lights out, each lead change, the
 * biggest move, the flag) placed where they happened, the circuit beside the list of chapters. (The replay is its own
 * section on the page, above this one.)
 */
export function CircuitRaceStory({
  laps,
  results,
  trackStory,
  layout,
}: {
  laps: RaceLapEntry[];
  results: RaceResultEntry[];
  trackStory: RaceTrackStory | null;
  layout: CircuitLayout | null;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const nameFor = useMemo(() => {
    const names = new Map(results.map((r) => [r.driver, r.driverName]));
    return (code: string) => names.get(code) ?? code;
  }, [results]);
  const colors = useMemo(() => new Map(results.map((r) => [r.driver, teamColor(r.team)])), [results]);
  const chapters = useMemo(() => computeStoryline(laps, nameFor), [laps, nameFor]);
  const totalLaps = laps.length ? laps[laps.length - 1].lap : 1;

  if (chapters.length === 0) return <p className="text-body-sm text-secondary">The lap-by-lap data for this race isn&apos;t in yet, so there&apos;s no story to tell.</p>;
  return (
    <RaceStoryline heading={null} side chapters={chapters} totalLaps={totalLaps} colorFor={(id) => colors.get(id) ?? "#bbb"} selected={selected} onSelect={setSelected} track={trackStory} layout={layout} nameFor={nameFor} />
  );
}
