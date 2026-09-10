"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { formatLapTime, raceStatusLabel, trackShortForm } from "@/lib/format";
import type { FavoriteDriverCard, FavoriteTeamCard } from "@/lib/personalization";
import { circuitHref, raceHref } from "@/lib/routes";
import type { RaceDoc } from "@/lib/types/race";

/** The season timeline, redesigned as a minimal round-navigator strip + one larger featured-round
 * panel, instead of a row of near-identical bordered cards (the weakest component on the previous
 * pass, per direct user feedback). Images live ONLY on the featured panel, never per-node in the
 * strip - explicit constraint, so this doesn't become "23 image cards in a carousel."
 *
 * `selectedRound` defaults to the current/next race (or the last completed round once the season's
 * over, or round 1 pre-season) so the panel is never empty on load - not a click-to-reveal-nothing
 * pattern. `.pulse-ring` (same class the `/season` calendar's live-session indicator already uses,
 * reduced-motion-safe) marks the "you are here" node. */
export function SeasonStrip({
  races,
  nextRaceRound,
  favoriteDriver,
  favoriteTeam,
}: {
  races: RaceDoc[];
  nextRaceRound?: number | null;
  favoriteDriver: FavoriteDriverCard | null;
  favoriteTeam: FavoriteTeamCard | null;
}) {
  const [selectedRound, setSelectedRound] = useState<number | null>(
    () => nextRaceRound ?? [...races].reverse().find((r) => r.status === "completed")?.round ?? races[0]?.round ?? null,
  );
  const selected = selectedRound != null ? races.find((r) => r.round === selectedRound) : null;
  const roundIndex = races.findIndex((r) => r.round === selectedRound);
  const nodeRefs = useRef<Record<number, HTMLButtonElement | null>>({});

  function selectRound(round: number, focus = false) {
    setSelectedRound(round);
    const prefersReducedMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    nodeRefs.current[round]?.scrollIntoView({ inline: "center", block: "nearest", behavior: prefersReducedMotion ? "auto" : "smooth" });
    if (focus) nodeRefs.current[round]?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent, index: number) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    let nextIndex = index;
    if (e.key === "ArrowRight") nextIndex = Math.min(index + 1, races.length - 1);
    else if (e.key === "ArrowLeft") nextIndex = Math.max(index - 1, 0);
    else if (e.key === "Home") nextIndex = 0;
    else if (e.key === "End") nextIndex = races.length - 1;
    selectRound(races[nextIndex].round, true);
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => roundIndex > 0 && selectRound(races[roundIndex - 1].round)}
          disabled={roundIndex <= 0}
          aria-label="Previous round"
          className="shrink-0 rounded-lg border border-[var(--f1-line)] px-2 py-2 text-neutral-400 transition hover:border-white/30 hover:text-white disabled:opacity-30"
        >
          ◀
        </button>

        <div role="listbox" aria-label="Season rounds" className="flex flex-1 snap-x snap-mandatory gap-1.5 overflow-x-auto scrollbar-hide">
          {races.map((race, i) => {
            const isHere = race.round === nextRaceRound;
            const isSelected = race.round === selectedRound;
            return (
              <button
                key={race.id}
                ref={(el) => {
                  nodeRefs.current[race.round] = el;
                }}
                type="button"
                role="option"
                aria-selected={isSelected}
                tabIndex={isSelected ? 0 : -1}
                onClick={() => selectRound(race.round)}
                onKeyDown={(e) => onKeyDown(e, i)}
                className={`flex shrink-0 snap-start flex-col items-center gap-1 rounded-md border px-2.5 py-2 text-center transition ${
                  isSelected ? "border-[var(--f1-red)]/50 bg-[var(--f1-red)]/[0.08]" : "border-transparent hover:border-white/20"
                }`}
              >
                <span className="font-mono text-[10px] text-neutral-500">R{race.round}</span>
                <span className="whitespace-nowrap text-[11px] font-medium text-neutral-300">{trackShortForm(race.circuit)}</span>
                <span
                  aria-hidden
                  className={
                    isHere
                      ? "pulse-ring h-1.5 w-1.5 rounded-full bg-[var(--f1-red)]"
                      : race.status === "completed"
                        ? "h-1.5 w-1.5 rounded-full bg-neutral-500"
                        : "h-1.5 w-1.5 rounded-full border border-neutral-600"
                  }
                />
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => roundIndex < races.length - 1 && selectRound(races[roundIndex + 1].round)}
          disabled={roundIndex < 0 || roundIndex >= races.length - 1}
          aria-label="Next round"
          className="shrink-0 rounded-lg border border-[var(--f1-line)] px-2 py-2 text-neutral-400 transition hover:border-white/30 hover:text-white disabled:opacity-30"
        >
          ▶
        </button>
      </div>

      {selected && (
        <motion.div
          key={selected.id}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="mt-3 overflow-hidden rounded-2xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/40"
        >
          <FeaturedRound race={selected} isHere={selected.round === nextRaceRound} favoriteDriver={favoriteDriver} favoriteTeam={favoriteTeam} />
        </motion.div>
      )}
    </div>
  );
}

function FeaturedRound({
  race,
  isHere,
  favoriteDriver,
  favoriteTeam,
}: {
  race: RaceDoc;
  isHere: boolean;
  favoriteDriver: FavoriteDriverCard | null;
  favoriteTeam: FavoriteTeamCard | null;
}) {
  return (
    <div>
      {/* Real per-round photo (RaceDoc.photoUrl - already fetched for every DB-backed race, zero
       * new fetch), only on this featured panel, never on a strip node. Omitted entirely (no
       * broken <Image>) for far-future calendar-placeholder rounds that don't have one yet. */}
      {race.photoUrl && (
        <div className="relative aspect-[21/9] w-full overflow-hidden">
          <Image src={race.photoUrl} alt="" fill sizes="(min-width: 640px) 600px, 100vw" className="object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-[var(--f1-carbon)] via-[var(--f1-carbon)]/20 to-transparent" />
        </div>
      )}

      <div className="p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <div>
            <p className="font-mono text-[11px] text-neutral-500">Round {race.round}</p>
            <p className="text-base font-semibold text-white">{race.name}</p>
          </div>
          <p className="text-xs text-neutral-400">{raceStatusLabel(race)}</p>
        </div>

        <div className="mt-3">
          {race.status === "completed" ? (
            <CompletedRoundDetail race={race} favoriteDriver={favoriteDriver} favoriteTeam={favoriteTeam} />
          ) : isHere ? (
            <ThisWeekendDetail race={race} favoriteDriver={favoriteDriver} favoriteTeam={favoriteTeam} />
          ) : (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-neutral-500">Not yet raced.</p>
              <Link href={circuitHref(race.circuit)} className="text-xs font-medium text-neutral-400 hover:text-white">
                Circuit history →
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CompletedRoundDetail({
  race,
  favoriteDriver,
  favoriteTeam,
}: {
  race: RaceDoc;
  favoriteDriver: FavoriteDriverCard | null;
  favoriteTeam: FavoriteTeamCard | null;
}) {
  const results = race.results ?? [];
  const podium = [...results].filter((r) => r.finishPosition <= 3).sort((a, b) => a.finishPosition - b.finishPosition);
  const fastestLap = [...results].filter((r) => r.fastestLapSec != null).sort((a, b) => a.fastestLapSec! - b.fastestLapSec!)[0];

  // Personalization, in priority order, never fabricated - each branch reads a real field already
  // on this race's own results, no cross-race derivation needed.
  const favoriteDriverResult = favoriteDriver?.code ? results.find((r) => r.driver === favoriteDriver.code) : null;
  const favoriteTeamResults = favoriteTeam?.currentName
    ? [...results].filter((r) => r.team === favoriteTeam.currentName).sort((a, b) => a.finishPosition - b.finishPosition)
    : [];

  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="space-y-1 text-sm">
        {podium.map((r) => (
          <p key={r.driver} className="text-neutral-300">
            <span className="font-mono text-neutral-500">P{r.finishPosition}</span> <span className="font-medium text-white">{r.driverName}</span>
          </p>
        ))}
        <div className="mt-1.5 space-y-0.5 text-xs text-neutral-500">
          {race.poleSitter && (
            <p>
              Pole: {race.poleSitter}
              {race.poleTimeSec != null && <> ({formatLapTime(race.poleTimeSec)})</>}
            </p>
          )}
          {fastestLap && (
            <p>
              Fastest lap: {fastestLap.driverName} ({formatLapTime(fastestLap.fastestLapSec!)})
            </p>
          )}
        </div>

        {favoriteDriverResult ? (
          <p className="mt-2 text-xs text-neutral-400">
            <span className="font-medium text-neutral-200">Your driver — </span>
            {favoriteDriver!.name} finished {favoriteDriverResult.status === "dnf" ? "DNF" : `P${favoriteDriverResult.finishPosition}`}.
          </p>
        ) : favoriteTeamResults.length > 0 ? (
          <p className="mt-2 text-xs text-neutral-400">
            <span className="font-medium text-neutral-200">Your team — </span>
            {favoriteTeam!.name} best finish P{favoriteTeamResults[0].finishPosition}.
          </p>
        ) : podium[0] ? (
          <p className="mt-2 text-xs text-neutral-400">
            {podium[0].driverName} ({podium[0].team}) took the win.
          </p>
        ) : null}
      </div>
      <Link href={raceHref(race.year, race.round, race.name)} className="text-xs font-medium text-[var(--f1-red)] hover:brightness-125">
        View race →
      </Link>
    </div>
  );
}

function ThisWeekendDetail({
  race,
  favoriteDriver,
  favoriteTeam,
}: {
  race: RaceDoc;
  favoriteDriver: FavoriteDriverCard | null;
  favoriteTeam: FavoriteTeamCard | null;
}) {
  const who = favoriteDriver?.name ?? favoriteTeam?.name;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-neutral-300">
        This weekend{who ? ` — make your ${who} prediction` : ""} before lights out.
      </p>
      <Link
        href={raceHref(race.year, race.round, race.name)}
        className="rounded-lg bg-[var(--f1-red)] px-4 py-1.5 text-xs font-semibold text-white transition hover:brightness-110"
      >
        Make Prediction →
      </Link>
    </div>
  );
}
