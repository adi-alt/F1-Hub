"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/components/motion/variants";
import { raceStatusLabel } from "@/lib/format";
import { circuitHref, raceHref } from "@/lib/routes";
import type { RaceDoc } from "@/lib/types/race";

/** The season timeline - individual round cards keep containment (Tier 3's one exception: they're
 * the interactive/clickable element, so containment signals interactivity here, not just grouping).
 * `nextRaceRound` marks the one "you are here" round with the same `.pulse-ring` treatment the
 * `/season` page's own calendar uses for its current-session indicator (reduced-motion-safe
 * already, via that shared CSS class) - not a fabricated three-way past/current/next split, since
 * every future round is already `upcoming`/`scheduled` and `nextRaceRound` is the one real anchor
 * this whole homepage already keys off elsewhere. Clicking a round reveals winner/podium/pole (for
 * completed rounds; already-fetched `race.results`/`race.poleSitter`, no new fetch), a weekend-
 * status/predict CTA for the "you are here" round, or a plain "not yet raced" state - never an
 * empty panel. */
export function SeasonStrip({ races, nextRaceRound }: { races: RaceDoc[]; nextRaceRound?: number | null }) {
  const [selectedRound, setSelectedRound] = useState<number | null>(null);
  const selected = selectedRound != null ? races.find((r) => r.round === selectedRound) : null;

  return (
    <div>
      <motion.div
        initial="hidden"
        animate="show"
        variants={staggerContainer}
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 scrollbar-hide"
      >
        {races.map((race) => {
          const statusLabel = raceStatusLabel(race);
          const isHere = race.round === nextRaceRound;
          const isSelected = race.round === selectedRound;
          return (
            <motion.button
              key={race.id}
              type="button"
              variants={staggerItem}
              whileHover={{ y: -3 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setSelectedRound((prev) => (prev === race.round ? null : race.round))}
              className={`flex min-w-[168px] shrink-0 snap-start flex-col gap-1 rounded-xl border px-4 py-3 text-left transition ${
                isSelected
                  ? "border-[var(--f1-red)]/60 bg-[var(--f1-red)]/[0.06]"
                  : "border-[var(--f1-line)] bg-[var(--f1-carbon)] hover:border-white/30"
              }`}
            >
              <span className="flex items-center gap-1.5 text-xs text-neutral-500">
                {isHere && <span aria-hidden className="pulse-ring h-1.5 w-1.5 rounded-full bg-[var(--f1-red)]" />}
                Round {race.round}
                {isHere && <span className="text-[var(--f1-red)]">· You are here</span>}
              </span>
              <span className={race.status === "scheduled" ? "text-sm font-semibold text-neutral-400" : "text-sm font-semibold text-white"}>
                {race.name.replace(" Grand Prix", "")}
              </span>
              <span className="text-xs text-neutral-400">{statusLabel}</span>
            </motion.button>
          );
        })}
      </motion.div>

      {selected && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4"
        >
          <RoundDetail race={selected} isHere={selected.round === nextRaceRound} />
        </motion.div>
      )}
    </div>
  );
}

function RoundDetail({ race, isHere }: { race: RaceDoc; isHere: boolean }) {
  if (race.status === "completed") {
    const podium = (race.results ?? []).filter((r) => r.finishPosition <= 3).sort((a, b) => a.finishPosition - b.finishPosition);
    return (
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1 text-sm">
          {podium.map((r) => (
            <p key={r.driver} className="text-neutral-300">
              <span className="font-mono text-neutral-500">P{r.finishPosition}</span>{" "}
              <span className="font-medium text-white">{r.driverName}</span>
            </p>
          ))}
          {race.poleSitter && <p className="mt-1.5 text-xs text-neutral-500">Pole: {race.poleSitter}</p>}
        </div>
        <Link href={raceHref(race.year, race.round, race.name)} className="text-xs font-medium text-[var(--f1-red)] hover:brightness-125">
          View race →
        </Link>
      </div>
    );
  }

  if (isHere) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-neutral-300">This weekend - make your prediction before lights out.</p>
        <Link
          href={raceHref(race.year, race.round, race.name)}
          className="rounded-full bg-[var(--f1-red)] px-4 py-1.5 text-xs font-semibold text-white transition hover:brightness-110"
        >
          Make Prediction →
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-sm text-neutral-500">Not yet raced.</p>
      <Link href={circuitHref(race.circuit)} className="text-xs font-medium text-neutral-400 hover:text-white">
        Circuit history →
      </Link>
    </div>
  );
}
