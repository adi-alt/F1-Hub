"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { QuietTabs } from "@/app/season/_components/QuietTabs";
import { RaceSectionCard } from "@/components/raceDetail/RaceSectionCard";
import { RaceSubSection } from "@/components/raceDetail/RaceSubSection";
import {
  buildCircuitTimeline,
  computeRaceTrends,
  computeTopWinners,
  computeTrackRecords,
  computeWeatherHistory,
  windowedTimeline,
  type WindowYears,
} from "@/lib/circuitIntelligence";
import type { ArchiveRaceDoc } from "@/lib/supabase/archive";
import type { RaceDoc } from "@/lib/types/race";

const WINDOW_OPTIONS: { value: string; label: string; years: WindowYears }[] = [
  { value: "1", label: "Last year", years: 1 },
  { value: "5", label: "Last 5 years", years: 5 },
  { value: "10", label: "Last 10 years", years: 10 },
  { value: "all", label: "All history", years: null },
];

function fmtSec(sec: number): string {
  return `${sec.toFixed(3)}s`;
}

// One label/value cell - the same restrained "flat pair, hairline divider" treatment
// RaceStorySection's own stat grid uses, kept as its own small local version rather than reusing
// that one directly - it's explicitly hardcoded to its own two call sites' exact four-tile shape
// (see its own comment), and forcing a third, differently-sized caller onto it would undo the
// reason it's hardcoded in the first place.
function StatCell({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-0.5 truncate text-sm font-semibold text-white">{value}</p>
      {sub && <p className="text-[11px] text-neutral-500">{sub}</p>}
    </div>
  );
}

function StatGrid({ cells }: { cells: { label: string; value: string; sub?: string }[] }) {
  return (
    <div className="grid grid-cols-2 gap-x-5 gap-y-3.5 sm:grid-cols-4 sm:gap-y-0">
      {cells.map((c) => (
        <StatCell key={c.label} {...c} />
      ))}
    </div>
  );
}

// Rank + name + proportional bar + real count - the same visual language SimulationPanel's own
// ProbabilityBars uses for win/podium probability, just for a raw win count instead of a percentage
// (that component's own label formatting - `.toFixed(0)%` - is specific to probabilities, not
// reusable as-is for a count).
function WinnersBarList({ entries }: { entries: { driver: string; wins: number }[] }) {
  const max = Math.max(...entries.map((e) => e.wins), 1);
  return (
    <div>
      {entries.map((e, i) => (
        <motion.div
          key={e.driver}
          initial={{ opacity: 0, x: -6 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.2, delay: i * 0.03 }}
          className="flex items-center gap-2.5 py-[3px]"
        >
          <span className="w-4 shrink-0 text-right font-mono text-[11px] text-neutral-600">{i + 1}</span>
          {/* Full driver names here (winnerDriver, unlike Simulation's own 3-letter codes) - a
              fixed w-40 rather than ProbabilityBars' w-12, wide enough for "Michael Schumacher"
              (confirmed live at w-32 it still clipped to "Schumac…") - truncate stays as the
              graceful fallback for the rare longer name, not chased further than this. */}
          <span className="w-40 shrink-0 truncate text-sm font-medium text-white">{e.driver}</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
            <motion.div
              className="h-full w-full origin-left rounded-full"
              initial={{ scaleX: 0 }}
              whileInView={{ scaleX: e.wins / max }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              style={{ background: "var(--f1-red)" }}
            />
          </div>
          <span className="w-20 shrink-0 text-right text-xs text-neutral-500">
            {e.wins} {e.wins === 1 ? "win" : "wins"}
          </span>
        </motion.div>
      ))}
    </div>
  );
}

/** What makes an upcoming race's page feel like a real page instead of a wall of "not yet
 * available" messages - real history at this exact physical track, merged from both real sources
 * (archive_races for anything pre-2018 or otherwise not yet in `races`, the live `races` schema for
 * 2018+ - see circuitIntelligence.ts's own comment on why the merge exists at all). Shown for every
 * non-completed race stage (not just pre-FP1) - it doesn't compete with Practice/Qualifying/
 * Simulation for the same information, it's the one section that's already fully populated the
 * whole time those are still unlocking, so it stays put rather than getting swapped out.
 *
 * Renders nothing at all (not an empty card) for a circuit this app has no real history for yet -
 * a genuinely new venue, or one whose archive match failed (findArchiveCircuitByLocation returned
 * null) and also has no completed live-season race yet. */
export function TrackIntelligence({ liveRaces, archiveRaces, circuitName }: { liveRaces: RaceDoc[]; archiveRaces: ArchiveRaceDoc[]; circuitName: string }) {
  const [window, setWindow] = useState<string>("5");
  const timeline = useMemo(() => buildCircuitTimeline(liveRaces, archiveRaces), [liveRaces, archiveRaces]);
  if (timeline.length === 0) return null;

  // Not `?.years ?? 5` - "All history"'s own real value IS `null`, and `??` treats that exactly
  // like "no match found," silently forcing every "All history" click back onto a 5-year window.
  // Caught live: clicking it changed the active tab's underline but never the numbers underneath.
  const matchedWindow = WINDOW_OPTIONS.find((o) => o.value === window);
  const selectedYears = matchedWindow ? matchedWindow.years : 5;
  const windowed = windowedTimeline(timeline, selectedYears);
  const records = computeTrackRecords(windowed);
  const topWinners = computeTopWinners(windowed);
  const trends = computeRaceTrends(windowed);
  const weather = computeWeatherHistory(windowed);

  const recordCells = [
    records.mostWins ? { label: "Most wins", value: records.mostWins.driver, sub: `${records.mostWins.count}x` } : null,
    records.mostPoles ? { label: "Most poles", value: records.mostPoles.driver, sub: `${records.mostPoles.count}x` } : null,
    records.closestMargin ? { label: "Closest finish", value: fmtSec(records.closestMargin.sec), sub: String(records.closestMargin.year) } : null,
    records.largestMargin ? { label: "Largest margin", value: fmtSec(records.largestMargin.sec), sub: String(records.largestMargin.year) } : null,
  ].filter((c): c is { label: string; value: string; sub: string } => c !== null);

  const trendCells = [
    trends.poleToWinPct !== null ? { label: "Pole → win", value: `${trends.poleToWinPct.toFixed(0)}%` } : null,
    trends.avgWinningMarginSec !== null ? { label: "Avg winning margin", value: fmtSec(trends.avgWinningMarginSec) } : null,
    trends.avgFieldMovement !== null ? { label: "Avg grid → finish shift", value: trends.avgFieldMovement.toFixed(1) } : null,
  ].filter((c): c is { label: string; value: string } => c !== null);

  const weatherCells = [
    weather.dryPct !== null ? { label: "Dry races", value: `${weather.dryPct.toFixed(0)}%`, sub: `${weather.sampleSize} seasons` } : null,
    weather.avgTempC !== null ? { label: "Avg air temp", value: `${weather.avgTempC.toFixed(0)}°C` } : null,
  ].filter((c): c is { label: string; value: string; sub?: string } => c !== null);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.3, ease: "easeOut" }}>
      <RaceSectionCard
        title="Track Intelligence"
        description={`Historical trends and records at ${circuitName}.`}
        headerRight={<QuietTabs options={WINDOW_OPTIONS.map((o) => ({ value: o.value, label: o.label }))} value={window} onChange={setWindow} className="text-xs" />}
      >
        {recordCells.length > 0 && (
          <RaceSubSection label="Track Records" first>
            <StatGrid cells={recordCells} />
          </RaceSubSection>
        )}
        {topWinners.length > 0 && (
          <div className={recordCells.length > 0 ? "mt-6 border-t border-[var(--f1-line)] pt-6" : ""}>
            <RaceSubSection label="Historical Performance" description="Most race wins at this circuit." first>
              <WinnersBarList entries={topWinners} />
            </RaceSubSection>
          </div>
        )}
        {trendCells.length > 0 && (
          <div className={recordCells.length > 0 || topWinners.length > 0 ? "mt-6 border-t border-[var(--f1-line)] pt-6" : ""}>
            <RaceSubSection label="Race Trends" first>
              <StatGrid cells={trendCells} />
            </RaceSubSection>
          </div>
        )}
        {weatherCells.length > 0 && (
          <div className={recordCells.length > 0 || topWinners.length > 0 || trendCells.length > 0 ? "mt-6 border-t border-[var(--f1-line)] pt-6" : ""}>
            <RaceSubSection label="Weather History" first>
              <StatGrid cells={weatherCells} />
            </RaceSubSection>
          </div>
        )}
      </RaceSectionCard>
    </motion.div>
  );
}
