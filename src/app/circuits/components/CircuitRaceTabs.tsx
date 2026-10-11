"use client";

import { useId, useState } from "react";
import Link from "next/link";
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
  year,
  title,
  resultsHref,
  replay,
  laps,
  results,
  trackStory,
  layout,
}: {
  year: number;
  title: string;
  resultsHref: string;
  replay: ReplayEntry | null;
  laps: RaceLapEntry[];
  results: RaceResultEntry[];
  trackStory: RaceTrackStory | null;
  layout: CircuitLayout | null;
}) {
  const [tab, setTab] = useState<Tab>(replay ? "replay" : "story");
  const headingId = useId();
  const items = [...(replay ? [{ value: "replay" as const, label: "Replay" }] : []), { value: "story" as const, label: "How it was won" }];

  return (
    <section id="race" aria-labelledby={headingId} className="min-w-0 scroll-mt-24 rounded-card bg-surface-1 p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 id={headingId} className="text-title-lg text-primary">
            {title}
          </h2>
          <p className="text-body-sm text-secondary">The {year} race on this circuit, every car and every lead change.</p>
        </div>
        <Link href={resultsHref} className="shrink-0 text-body-sm font-medium text-secondary underline-offset-4 hover:text-primary hover:underline">
          Full results
        </Link>
      </div>
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
    </section>
  );
}
