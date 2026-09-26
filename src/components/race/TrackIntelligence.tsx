"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { QuietTabs } from "@/app/season/_components/QuietTabs";
import { RaceSectionCard } from "@/components/raceDetail/RaceSectionCard";
import { RaceSubSection } from "@/components/raceDetail/RaceSubSection";
import {
  buildCircuitTimeline,
  computeRaceTrends,
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

/** Whether TrackTrendsContent would render anything real, at its OWN default window - the same
 * emptiness check RaceHistorySection's other tabs expose, so the Trends tab isn't offered at all
 * when this circuit has no real timeline. A tab that's offered can still read differently once
 * someone changes the window inside it (a 1-year slice can come up empty even when "all history"
 * isn't) - that's an honest, different state from "this tab shouldn't exist," handled inside the
 * content itself, not here. */
export function hasTrackTrends(liveRaces: RaceDoc[], archiveRaces: ArchiveRaceDoc[]): boolean {
  return buildCircuitTimeline(liveRaces, archiveRaces).length > 0;
}

/** Real trends and records at this exact physical track, windowed by a real time-range filter -
 * deliberately NOT the same fact as CircuitRecordsContent's own all-time records (that panel is
 * never affected by this filter; these two only coincide when "All history" happens to be
 * selected, which is expected, not a duplicate - a time-filterable analysis and a permanent
 * record are different questions that happen to share an answer in that one filter state). Also
 * not the same as the Drivers/Teams tabs, which are scoped to THIS Grand Prix's own identity;
 * this is the circuit's combined history across whatever it's been called.
 *
 * A bare content component (own window-range control, no outer RaceSectionCard) - hosted by
 * RaceHistorySection's own Trends tab, previously a standalone "Track Intelligence" section that
 * sat directly above/below a section showing much of the same shape of information.
 */
export function TrackTrendsContent({ liveRaces, archiveRaces, circuitName }: { liveRaces: RaceDoc[]; archiveRaces: ArchiveRaceDoc[]; circuitName: string }) {
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
  const trends = computeRaceTrends(windowed);
  const weather = computeWeatherHistory(windowed);

  // `drivers.join(...)` reads as one name for the (overwhelmingly common) untied case, and as
  // "A / B" for a genuine tie - never silently drops a second record holder.
  const namesOf = (drivers: string[]) => drivers.join(" / ");
  const recordCells = [
    records.mostWins ? { label: "Most wins", value: namesOf(records.mostWins.drivers), sub: `${records.mostWins.count}x` } : null,
    records.mostPoles ? { label: "Most poles", value: namesOf(records.mostPoles.drivers), sub: `${records.mostPoles.count}x` } : null,
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
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-neutral-500">Windowed by time range - never the same fact as the Records tab, which is always all-time.</p>
        <QuietTabs options={WINDOW_OPTIONS.map((o) => ({ value: o.value, label: o.label }))} value={window} onChange={setWindow} className="shrink-0 text-xs" />
      </div>
      {recordCells.length > 0 && (
        <div className="mt-4">
          <RaceSubSection label="Track Records" first>
            <StatGrid cells={recordCells} />
          </RaceSubSection>
        </div>
      )}
      {trendCells.length > 0 && (
        <div className={recordCells.length > 0 ? "mt-6 border-t border-[var(--f1-line)] pt-6" : "mt-4"}>
          <RaceSubSection label="Race Trends" first>
            <StatGrid cells={trendCells} />
          </RaceSubSection>
        </div>
      )}
      {weatherCells.length > 0 && (
        <div className={recordCells.length > 0 || trendCells.length > 0 ? "mt-6 border-t border-[var(--f1-line)] pt-6" : "mt-4"}>
          <RaceSubSection label="Weather History" first>
            <StatGrid cells={weatherCells} />
          </RaceSubSection>
        </div>
      )}
      {recordCells.length === 0 && trendCells.length === 0 && weatherCells.length === 0 && (
        <p className="mt-4 text-sm text-neutral-500">Not enough data in this time range - try a wider one.</p>
      )}
      {/* Sample size and window, said plainly - a "most wins" or "pole -> win" stat computed
          from a 1-year window (one race) reads very differently from the same stat over 20
          years, and the selector above already lets it be either. */}
      {windowed.length > 0 && (
        <p className="mt-4 text-[11px] text-neutral-600">
          Based on {windowed.length} {windowed.length === 1 ? "race" : "races"}{" "}
          {matchedWindow?.years ? `over the last ${matchedWindow.years} season${matchedWindow.years === 1 ? "" : "s"}` : "across all available history"} at {circuitName}.
        </p>
      )}
    </div>
  );
}

/** The standalone section, for the one caller that still genuinely wants Track Intelligence on
 * its own: the Circuits page (CircuitDetailPage.tsx), which has no "this Grand Prix" concept to
 * host a Winners/Drivers/Teams tab set next to it the way a race page's own RaceHistorySection
 * does. That race page uses TrackTrendsContent directly instead (as its own Trends tab) - this
 * wrapper is only for a caller with nothing else to combine it with.
 *
 * Renders nothing at all for a circuit this app has no real history for yet - a genuinely new
 * venue, or one whose archive match failed - same as the bare content it wraps. */
export function TrackIntelligence({ liveRaces, archiveRaces, circuitName }: { liveRaces: RaceDoc[]; archiveRaces: ArchiveRaceDoc[]; circuitName: string }) {
  if (!hasTrackTrends(liveRaces, archiveRaces)) return null;
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.3, ease: "easeOut" }}>
      <RaceSectionCard title="Track Intelligence" description={`Historical trends and records at ${circuitName}.`}>
        <TrackTrendsContent liveRaces={liveRaces} archiveRaces={archiveRaces} circuitName={circuitName} />
      </RaceSectionCard>
    </motion.div>
  );
}
