"use client";

import { motion } from "framer-motion";
import { RaceSectionCard } from "./RaceSectionCard";
import { computeLapRecord, computeMostPodiums, type CircuitYearRecord } from "@/lib/circuitIntelligence";
import { formatLapTime } from "@/lib/format";
import type { AgeRecords } from "@/lib/circuitRecords";
import type { RaceDoc } from "@/lib/types/race";
import type { ArchiveRaceDoc } from "@/lib/supabase/archive";

type Tile = { label: string; value: string; sub?: string };

function Tile({ tile }: { tile: Tile }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wide text-neutral-500">{tile.label}</p>
      <p className="mt-0.5 truncate text-sm font-semibold text-white">{tile.value}</p>
      {tile.sub && <p className="text-[11px] text-neutral-500">{tile.sub}</p>}
    </div>
  );
}

/**
 * Genuine all-time records at this circuit - never affected by Track Intelligence's own 1/5/10/
 * all-history filter (that panel's own stats are deliberately windowed; these never are, by
 * definition of what a "record" means - see this component's own callers for why the two are kept
 * visually separate rather than merged into one card that would otherwise imply one of them
 * changes with a filter it doesn't actually respond to).
 *
 * Shown for every race phase - a record set at this circuit doesn't stop being true once a race
 * weekend starts or ends, so this renders identically whether the race above it is upcoming or
 * completed, unlike Track Intelligence which stays pre-race-only.
 *
 * Every record's exact scope is stated in its own label - "Lap record" is the fastest lap ever
 * driven in a RACE here, never the pole/qualifying time (a different session, a different number -
 * conflating them would be exactly the mislabeling this component exists to avoid). Ages are real,
 * computed from real birthdates against the real race date they won or took pole on (see
 * circuitRecords.ts) - omitted entirely, never estimated, wherever that data doesn't resolve.
 */
export function CircuitRecordsSection({
  circuitName,
  timeline,
  liveRaces,
  archiveRaces,
  ageRecords,
}: {
  circuitName: string;
  timeline: CircuitYearRecord[];
  liveRaces: RaceDoc[];
  archiveRaces: ArchiveRaceDoc[];
  ageRecords: AgeRecords;
}) {
  if (timeline.length === 0) return null;

  const lapRecord = computeLapRecord(timeline);
  const topPodiums = computeMostPodiums(liveRaces, archiveRaces, 1)[0] ?? null;

  const rawTiles: (Tile | null)[] = [
    lapRecord ? { label: "Lap record", value: formatLapTime(lapRecord.sec), sub: `${lapRecord.driver}, ${lapRecord.year}` } : null,
    topPodiums ? { label: "Most podiums", value: topPodiums.driver, sub: `${topPodiums.podiums}x` } : null,
    ageRecords.youngestWinner ? { label: "Youngest winner", value: ageRecords.youngestWinner.driver, sub: `${ageRecords.youngestWinner.age}, in ${ageRecords.youngestWinner.year}` } : null,
    ageRecords.oldestWinner ? { label: "Oldest winner", value: ageRecords.oldestWinner.driver, sub: `${ageRecords.oldestWinner.age}, in ${ageRecords.oldestWinner.year}` } : null,
    ageRecords.youngestPoleSitter ? { label: "Youngest pole-sitter", value: ageRecords.youngestPoleSitter.driver, sub: `${ageRecords.youngestPoleSitter.age}, in ${ageRecords.youngestPoleSitter.year}` } : null,
    ageRecords.oldestPoleSitter ? { label: "Oldest pole-sitter", value: ageRecords.oldestPoleSitter.driver, sub: `${ageRecords.oldestPoleSitter.age}, in ${ageRecords.oldestPoleSitter.year}` } : null,
  ];
  const tiles = rawTiles.filter((t): t is Tile => t !== null);

  if (tiles.length === 0) return null;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.3, ease: "easeOut" }}>
      <RaceSectionCard title="Circuit Records" description={`All-time milestones at ${circuitName} - not affected by the time filter below.`}>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {tiles.map((t) => (
            <Tile key={t.label} tile={t} />
          ))}
        </div>
      </RaceSectionCard>
    </motion.div>
  );
}
