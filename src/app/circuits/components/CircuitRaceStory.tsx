"use client";

import { useEffect, useMemo, useState } from "react";
import { RaceStoryline } from "@/components/raceDetail/RaceStoryline";
import { ReplaySection } from "@/components/raceDetail/ReplaySection";
import { computeStoryline } from "@/lib/raceMoments";
import { teamColor } from "@/lib/teamColors";
import type { CircuitLayout } from "@/lib/circuitLayout";
import type { RaceTrackStory } from "@/lib/raceTrackStory";
import type { ReplayEntry } from "@/lib/replayManifest";
import type { RaceLapEntry } from "@/lib/supabase/races";
import type { RaceResultEntry } from "@/lib/types/race";

type Mode = "story" | "replay";

/**
 * This season's race at the circuit, as a story on the circuit itself: the race's chapters (lights out, each lead
 * change, the biggest move, the flag) placed where they happened, and - when the race has one - the replay, played on
 * the same circuit. The replay is only downloaded when it's asked for. `#replay` in the address opens it.
 */
export function CircuitRaceStory({
  laps,
  results,
  trackStory,
  layout,
  replay,
}: {
  laps: RaceLapEntry[];
  results: RaceResultEntry[];
  trackStory: RaceTrackStory | null;
  layout: CircuitLayout | null;
  replay: ReplayEntry | null;
}) {
  const [mode, setMode] = useState<Mode>("story");
  const [selected, setSelected] = useState<number | null>(null);
  useEffect(() => {
    if (!replay) return;
    const open = () => window.location.hash === "#replay" && setMode("replay");
    const t = window.setTimeout(open, 0); // after hydration, never during it
    window.addEventListener("hashchange", open);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("hashchange", open);
    };
  }, [replay]);

  const nameFor = useMemo(() => {
    const names = new Map(results.map((r) => [r.driver, r.driverName]));
    return (code: string) => names.get(code) ?? code;
  }, [results]);
  const colors = useMemo(() => new Map(results.map((r) => [r.driver, teamColor(r.team)])), [results]);
  const chapters = useMemo(() => computeStoryline(laps, nameFor), [laps, nameFor]);
  const totalLaps = laps.length ? laps[laps.length - 1].lap : 1;

  return (
    <div>
      {replay && (
        <div role="tablist" aria-label="How to see this race" className="mb-5 flex gap-1.5">
          {(["story", "replay"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={`rounded-control border px-3 py-1.5 text-body-sm transition-colors duration-fast ${mode === m ? "border-white/40 bg-white/[0.06] text-primary" : "border-subtle text-secondary hover:text-primary"}`}
            >
              {m === "story" ? "The story" : "Watch the replay"}
            </button>
          ))}
        </div>
      )}
      {mode === "replay" && replay ? (
        <ReplaySection entry={replay} />
      ) : chapters.length > 0 ? (
        <RaceStoryline chapters={chapters} totalLaps={totalLaps} colorFor={(id) => colors.get(id) ?? "#bbb"} selected={selected} onSelect={setSelected} track={trackStory} layout={layout} nameFor={nameFor} />
      ) : (
        <p className="text-body-sm text-secondary">The lap-by-lap data for this race isn&apos;t in yet, so there&apos;s no story to tell.</p>
      )}
    </div>
  );
}
