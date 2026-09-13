// Pure, dependency-free lap-moment derivation - lives outside LapChart.tsx (a "use client" file
// pulling in recharts/framer-motion/victory-vendor) specifically so server-side code (the Race
// Intelligence context builder, src/lib/ai/context/raceContext.ts) can import it without dragging
// heavy client chart libraries into the server bundle. LapChart.tsx re-uses these same exports
// rather than defining its own copy - one real derivation, two callers.

export type LapTiming = { driverId: string; time: string | null; position: number | null };
export type LapEntry = { lap: number; timings: LapTiming[] };
export type Moment = { lap: number; text: string };

/** Every lead change (the P1 driver changing lap over lap - unambiguous) plus the single biggest
 * one-lap position gain across the whole field - genuinely derivable from real lap-by-lap position
 * data, nothing invented. Capped so this stays a handful of real highlights, not a lap-by-lap
 * transcript. */
export function computeMoments(laps: LapEntry[], nameFor: (id: string) => string): Moment[] {
  const moments: Moment[] = [];
  let prevLeader: string | null = null;
  let biggestGain: { lap: number; driverId: string; gained: number } | null = null;
  let prevPositions = new Map<string, number>();

  for (const entry of laps) {
    const leader = entry.timings.find((t) => t.position === 1)?.driverId ?? null;
    if (leader && prevLeader && leader !== prevLeader) {
      moments.push({ lap: entry.lap, text: `${nameFor(leader)} took the lead.` });
    }
    if (leader) prevLeader = leader;

    for (const t of entry.timings) {
      if (t.position === null) continue;
      const prev = prevPositions.get(t.driverId);
      if (prev !== undefined) {
        const gained = prev - t.position;
        if (gained > 0 && (!biggestGain || gained > biggestGain.gained)) {
          biggestGain = { lap: entry.lap, driverId: t.driverId, gained };
        }
      }
    }
    prevPositions = new Map(entry.timings.filter((t) => t.position !== null).map((t) => [t.driverId, t.position!]));
  }

  if (biggestGain && biggestGain.gained >= 2) {
    moments.push({ lap: biggestGain.lap, text: `${nameFor(biggestGain.driverId)} gained ${biggestGain.gained} places in a single lap.` });
  }

  return moments.sort((a, b) => a.lap - b.lap).slice(0, 6);
}
