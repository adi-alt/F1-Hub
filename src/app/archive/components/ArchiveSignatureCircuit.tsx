import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { CircuitCanvas } from "@/components/circuit/CircuitCanvas";
import { Icon } from "@/components/ui/Icon";
import { PANEL } from "@/components/ui/panel";
import { chooseLayout, latestLayout, layoutToDrawing } from "@/lib/circuitLayout";
import { archiveCircuitHref } from "@/lib/routes";
import { getCircuitLayouts } from "@/lib/supabase/circuitLayouts";
import type { ArchiveRaceDoc, ArchiveResultEntry } from "@/lib/supabase/archive";
import { isClassified } from "@/lib/archiveResult";

type Entry = { race: ArchiveRaceDoc; result: ArchiveResultEntry };

export type SignatureCircuit = {
  circuitId: string | null;
  circuitName: string;
  starts: number;
  wins: number;
  podiums: number;
  firstYear: number;
  lastYear: number;
  /** The last race there, whose layout is the one drawn. */
  lastRaceName: string;
};

/**
 * The circuit that defines a career or a team: for a driver, where they won most (then podiums, then starts); for a
 * team, where it has raced most. Counted per race weekend, so a team's two cars at one race are one start.
 */
export function signatureCircuit(entries: Entry[], by: "wins" | "starts"): SignatureCircuit | null {
  const byCircuit = new Map<string, SignatureCircuit & { races: Set<string>; winRaces: Set<string>; podiumRaces: Set<string> }>();
  for (const { race, result } of entries) {
    if (!race.circuitName) continue;
    const key = race.circuitId ?? race.circuitName;
    const c = byCircuit.get(key) ?? {
      circuitId: race.circuitId ?? null,
      circuitName: race.circuitName,
      starts: 0,
      wins: 0,
      podiums: 0,
      firstYear: race.year,
      lastYear: race.year,
      lastRaceName: race.raceName,
      races: new Set<string>(),
      winRaces: new Set<string>(),
      podiumRaces: new Set<string>(),
    };
    c.races.add(race.id);
    if (isClassified(result.status) && result.position === 1) c.winRaces.add(race.id);
    if (isClassified(result.status) && result.position <= 3) c.podiumRaces.add(race.id);
    c.firstYear = Math.min(c.firstYear, race.year);
    if (race.year >= c.lastYear) {
      c.lastYear = race.year;
      c.lastRaceName = race.raceName;
    }
    byCircuit.set(key, c);
  }
  const all = [...byCircuit.values()].map(({ races, winRaces, podiumRaces, ...c }) => ({ ...c, starts: races.size, wins: winRaces.size, podiums: podiumRaces.size }));
  all.sort((a, b) => (by === "wins" ? b.wins - a.wins || b.podiums - a.podiums : 0) || b.starts - a.starts || b.lastYear - a.lastYear);
  return all[0] ?? null;
}

/**
 * That circuit, drawn: the real layout of the last season they raced there (the circuit pages' own drawings), with a
 * car lapping it in the team's colour, and what happened there underneath. Left out when the circuit has no drawing.
 */
export async function ArchiveSignatureCircuit({ circuit, lapColor }: { circuit: SignatureCircuit; lapColor: string | null }) {
  const layouts = await getCircuitLayouts({ circuitId: circuit.circuitId, circuitName: circuit.circuitName });
  const layout = chooseLayout(layouts, circuit.lastYear, circuit.lastRaceName) ?? latestLayout(layouts, 0);
  if (!layout) return null;
  const drawing = layoutToDrawing(layout);
  const years = circuit.firstYear === circuit.lastYear ? `${circuit.firstYear}` : `${circuit.firstYear}–${circuit.lastYear}`;

  return (
    <div className={`flex flex-1 flex-col p-5 ${PANEL}`}>
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <CircuitCanvas drawing={drawing} caption={false} className="max-h-64 w-full" lapColor={lapColor} lapSeconds={8} />
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-body font-semibold text-primary">{circuit.circuitName}</p>
          <p className="mt-0.5 text-caption tabular text-secondary">
            {circuit.wins > 0 && (
              <>
                <span className="font-semibold text-primary">{circuit.wins}</span> win{circuit.wins === 1 ? "" : "s"} ·{" "}
              </>
            )}
            {circuit.podiums > circuit.wins && (
              <>
                {circuit.podiums} podiums ·{" "}
              </>
            )}
            {circuit.starts} start{circuit.starts === 1 ? "" : "s"} · <span className="font-mono">{years}</span>
          </p>
        </div>
        {circuit.circuitId && (
          <Link
            href={archiveCircuitHref(circuit.circuitId)}
            className="flex shrink-0 items-center gap-0.5 rounded-control text-caption text-secondary transition-colors duration-fast hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            Circuit
            <Icon icon={ChevronRight} size={16} className="size-3.5" />
          </Link>
        )}
      </div>
    </div>
  );
}
