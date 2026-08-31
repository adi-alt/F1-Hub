"use client";

import { motion } from "framer-motion";
import { teamColor } from "@/lib/teamColors";

export type PodiumEntry = { position: 1 | 2 | 3; driverName: string; team: string; gapOrTime: string | null; points?: number };

/** P1/P2/P3, equal height, restrained team-color accents (a thin top border, not the full
 * gradient-fill treatment the old ResultsBoard.tsx PodiumCard used) - P1 reads slightly heavier
 * through size/weight and the app's own red accent, not more color. Shared by Season and Archive's
 * race pages - both already have this exact shape (position/driverName/team/gap-or-time/points)
 * once mapped from their own real result rows at the call site. */
export function RacePodium({ entries }: { entries: PodiumEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <div className="grid grid-cols-3 gap-3">
      {entries.map((entry) => (
        <PodiumCard key={entry.position} entry={entry} />
      ))}
    </div>
  );
}

function PodiumCard({ entry }: { entry: PodiumEntry }) {
  const isP1 = entry.position === 1;
  const accent = isP1 ? "var(--f1-red)" : teamColor(entry.team);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="surface-inset flex h-full flex-col justify-between rounded-xl border-t-2 bg-[var(--f1-carbon)]/60 p-4"
      style={{ borderTopColor: accent }}
    >
      <p className={isP1 ? "text-3xl font-black text-white" : "text-2xl font-black text-neutral-300"}>P{entry.position}</p>
      <div className="mt-3 min-w-0">
        <p className="truncate font-semibold text-white">{entry.driverName}</p>
        <p className="truncate text-xs text-neutral-500">{entry.team}</p>
      </div>
      {entry.gapOrTime && <p className="mt-3 font-mono text-sm text-neutral-400">{entry.gapOrTime}</p>}
      {typeof entry.points === "number" && entry.points > 0 && <p className="mt-1 text-xs text-neutral-500">{entry.points} pts</p>}
    </motion.div>
  );
}
