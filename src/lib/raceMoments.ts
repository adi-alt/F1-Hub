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

export type ChapterKind = "start" | "lead" | "charge" | "finish";
export type Chapter = { lap: number; kind: ChapterKind; driverId: string; title: string; story: string };

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/**
 * The race as a storyline: lights out, every lead change, the biggest one-lap charge, and the flag - each
 * chapter told in a sentence of context (who lost the lead and how long they had held it, where a charge
 * started and ended, how much of the race the winner led) rather than as a bare event. Derived from the same
 * real lap positions as computeMoments; nothing invented. Empty when there are no positions at all.
 */
export function computeStoryline(laps: LapEntry[], nameFor: (id: string) => string): Chapter[] {
  const leaderOf = (e: LapEntry) => e.timings.find((t) => t.position === 1)?.driverId ?? null;
  const led = laps.map((e) => ({ lap: e.lap, leader: leaderOf(e) })).filter((x): x is { lap: number; leader: string } => x.leader !== null);
  if (led.length === 0) return [];

  const chapters: Chapter[] = [];
  const first = led[0];
  chapters.push({ lap: first.lap, kind: "start", driverId: first.leader, title: `${nameFor(first.leader)} leads away`, story: `Lights out, and ${nameFor(first.leader)} is in front at the end of lap ${first.lap}.` });

  const lapsLed = new Map<string, number>();
  let stintStart = first.lap;
  for (let i = 0; i < led.length; i++) {
    const { lap, leader } = led[i];
    lapsLed.set(leader, (lapsLed.get(leader) ?? 0) + 1);
    const prev = led[i - 1];
    if (prev && prev.leader !== leader) {
      const held = lap - stintStart;
      chapters.push({
        lap,
        kind: "lead",
        driverId: leader,
        title: `${nameFor(leader)} takes the lead`,
        story: `${nameFor(prev.leader)} had led for ${plural(held, "lap")}${held > 1 ? ` since lap ${stintStart}` : ""}; ${nameFor(leader)} is now in front.`,
      });
      stintStart = lap;
    }
  }

  let charge: { lap: number; driverId: string; from: number; to: number } | null = null;
  for (let i = 1; i < laps.length; i++) {
    const before = new Map(laps[i - 1].timings.filter((t) => t.position !== null).map((t) => [t.driverId, t.position!]));
    for (const t of laps[i].timings) {
      const from = before.get(t.driverId);
      if (t.position === null || from === undefined) continue;
      if (from - t.position > (charge ? charge.from - charge.to : 1)) charge = { lap: laps[i].lap, driverId: t.driverId, from, to: t.position };
    }
  }
  if (charge) {
    const gained = charge.from - charge.to;
    chapters.push({ lap: charge.lap, kind: "charge", driverId: charge.driverId, title: `${nameFor(charge.driverId)} charges`, story: `The biggest move of the race: ${plural(gained, "place")} in a single lap, from P${charge.from} to P${charge.to}.` });
  }

  const last = led[led.length - 1];
  const winnerLed = lapsLed.get(last.leader) ?? 0;
  const finalStint = last.lap - stintStart + 1;
  chapters.push({
    lap: last.lap,
    kind: "finish",
    driverId: last.leader,
    title: `${nameFor(last.leader)} takes the flag`,
    story: `${nameFor(last.leader)} led ${plural(winnerLed, "lap")} in all${finalStint < led.length ? `, the last ${plural(finalStint, "lap")} without a break` : ", every one of them"}.`,
  });

  // Order by lap; the start comes first and the flag last even when they share a lap with another chapter.
  const rank = { start: 0, lead: 1, charge: 1, finish: 2 } as const;
  const sorted = chapters.sort((a, b) => a.lap - b.lap || rank[a.kind] - rank[b.kind]);
  // A long race can change lead a dozen times: keep the start, the flag, the charge and the latest lead
  // changes up to eight chapters, so it stays a story rather than a log.
  if (sorted.length <= 8) return sorted;
  const keep = new Set(sorted.filter((c) => c.kind !== "lead"));
  for (const c of [...sorted].reverse()) if (keep.size < 8 && c.kind === "lead") keep.add(c);
  return sorted.filter((c) => keep.has(c));
}
