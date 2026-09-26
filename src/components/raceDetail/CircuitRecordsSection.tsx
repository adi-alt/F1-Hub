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

function buildTiles(timeline: CircuitYearRecord[], liveRaces: RaceDoc[], archiveRaces: ArchiveRaceDoc[], ageRecords: AgeRecords): Tile[] {
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
  return rawTiles.filter((t): t is Tile => t !== null);
}

/**
 * Genuine all-time records at this circuit - never affected by Track Intelligence's own 1/5/10/
 * all-history filter (that panel's own stats are deliberately windowed; these never are, by
 * definition of what a "record" means).
 *
 * A bare content component, not its own section - RaceHistorySection hosts this and
 * GrandPrixHistoryContent under one shared card and a Winners/Records tab, so this doesn't sit as
 * a third near-identical "circuit stats" card back to back with the other two.
 *
 * Every record's exact scope is stated in its own label - "Lap record" is the fastest lap ever
 * driven in a RACE here, never the pole/qualifying time (a different session, a different number -
 * conflating them would be exactly the mislabeling this component exists to avoid). Ages are real,
 * computed from real birthdates against the real race date they won or took pole on (see
 * circuitRecords.ts) - omitted entirely, never estimated, wherever that data doesn't resolve.
 */
export function CircuitRecordsContent({
  timeline,
  liveRaces,
  archiveRaces,
  ageRecords,
}: {
  timeline: CircuitYearRecord[];
  liveRaces: RaceDoc[];
  archiveRaces: ArchiveRaceDoc[];
  ageRecords: AgeRecords;
}) {
  const tiles = buildTiles(timeline, liveRaces, archiveRaces, ageRecords);
  if (tiles.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
      {tiles.map((t) => (
        <Tile key={t.label} tile={t} />
      ))}
    </div>
  );
}

/** Whether CircuitRecordsContent would render anything real - exposed the same way
 * hasGrandPrixHistory is, so RaceHistorySection can decide whether the Records tab exists at all. */
export function hasCircuitRecords(timeline: CircuitYearRecord[], liveRaces: RaceDoc[], archiveRaces: ArchiveRaceDoc[], ageRecords: AgeRecords): boolean {
  return buildTiles(timeline, liveRaces, archiveRaces, ageRecords).length > 0;
}
