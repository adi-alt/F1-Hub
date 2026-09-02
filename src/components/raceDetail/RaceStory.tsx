"use client";

import { motion } from "framer-motion";

/** A prose summary over the exact same facts HighlightsPanel/StatTiles already show as tiles - no
 * new data, just templated sentences instead of stat cards. Each line is only included when its
 * underlying fact is real (a race with no DNFs gets no DNF line, a pole-sitter who also won gets
 * one merged sentence instead of two) - the plan's "3-5 concise insights", never a fixed count.
 * Shared shape both Season (from computeHighlights) and Archive (mapped from ArchiveResultEntry at
 * the call site, same pattern RaceHeader/RacePodium/RaceResultsTable already use) build into. */
export type RaceStoryFacts = {
  winnerName: string;
  poleSitterName: string | null;
  fastestLap: { driverName: string; timeLabel: string } | null;
  biggestGainer: { driverName: string; positionsGained: number } | null;
  biggestLoser: { driverName: string; positionsLost: number } | null;
  dnfCount: number;
};

/** Own label is "Race highlights", not "Race story" - this now renders inside RaceStorySection's
 * own "RACE STORY" title, so a second identical label directly under it would say the same thing
 * twice (exactly the redundancy the standalone "Race Overview" eyebrow got removed for, a round
 * ago). */
export function RaceStory({ facts }: { facts: RaceStoryFacts }) {
  const lines: string[] = [];

  if (facts.poleSitterName === null) {
    lines.push(`${facts.winnerName} won the race.`);
  } else if (facts.poleSitterName === facts.winnerName) {
    lines.push(`${facts.winnerName} converted pole position into victory.`);
  } else {
    lines.push(`${facts.winnerName} won the race after ${facts.poleSitterName} started from pole.`);
  }
  if (facts.fastestLap) lines.push(`${facts.fastestLap.driverName} set the fastest lap at ${facts.fastestLap.timeLabel}.`);
  if (facts.biggestGainer) {
    const n = facts.biggestGainer.positionsGained;
    lines.push(`${facts.biggestGainer.driverName} gained ${n} position${n === 1 ? "" : "s"} during the race.`);
  }
  if (facts.biggestLoser) {
    const n = facts.biggestLoser.positionsLost;
    lines.push(`${facts.biggestLoser.driverName} lost ${n} position${n === 1 ? "" : "s"} during the race.`);
  }
  if (facts.dnfCount > 0) lines.push(`${facts.dnfCount} car${facts.dnfCount === 1 ? "" : "s"} failed to finish.`);

  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">Race highlights</p>
      <ul className="space-y-2.5">
        {lines.map((line, i) => (
          <motion.li
            key={i}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.25, delay: i * 0.04 }}
            className="flex gap-2 text-sm text-neutral-300"
          >
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[var(--f1-red)]" />
            {line}
          </motion.li>
        ))}
      </ul>
    </div>
  );
}
