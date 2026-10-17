"use client";

import { useState } from "react";
import { TabList, TabPanels, Tabs } from "@/components/ui/Tabs";
import { ReplaySection } from "@/components/raceDetail/ReplaySection";
import { CircuitRaceStory } from "./CircuitRaceStory";
import type { CircuitLayout } from "@/lib/circuitLayout";
import type { RaceTrackStory } from "@/lib/raceTrackStory";
import type { ReplayEntry } from "@/lib/replayManifest";
import type { RaceLapEntry } from "@/lib/supabase/races";
import type { RaceResultEntry } from "@/lib/types/race";

type Tab = "replay" | "story";

/** The circuit's latest race in one place: the replay (a player, loaded when it comes into view) and the story of
 * how it was won, as tabs - rather than two stacked sections taking twice the room. */
export function CircuitRaceTabs({
  replay,
  laps,
  results,
  trackStory,
  layout,
}: {
  replay: ReplayEntry | null;
  laps: RaceLapEntry[];
  results: RaceResultEntry[];
  trackStory: RaceTrackStory | null;
  layout: CircuitLayout | null;
}) {
  const [tab, setTab] = useState<Tab>(replay ? "replay" : "story");
  const items = [...(replay ? [{ value: "replay" as const, label: "Replay" }] : []), { value: "story" as const, label: "How it was won" }];

  return (
    // The heading lives in the section around this (PanelSection, on the circuit page). Centred in its panel, so when
    // the panel is stretched to the eras beside it the story sits in the middle instead of above a blank block.
    <div className="flex flex-1 flex-col justify-center">
      <Tabs variant="segmented" value={tab} onValueChange={(v) => setTab(v as Tab)} items={items}>
        {items.length > 1 && <TabList aria-label="Replay or story" className="mb-4" />}
        <TabPanels>
          <div id="replay">
            {tab === "replay" && replay ? (
              <ReplaySection entry={replay} inline />
            ) : (
              <CircuitRaceStory laps={laps} results={results} trackStory={trackStory} layout={layout} />
            )}
          </div>
        </TabPanels>
      </Tabs>
    </div>
  );
}
