"use client";

import { useMemo } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { staggerItem } from "@/components/motion/variants";
import { useCountdown } from "@/hooks/useCountdown";
import { parseUtcDateTime } from "@/lib/countdown";
import { circuitHref } from "@/lib/routes";
import { generateTrackShape } from "@/lib/trackShape";
import type { CircuitExplorerEntry } from "../services/circuits.service";

/** A small, non-interactive track glyph - the same schematic shape generator the detail page's
 * full track map uses, at a size where it reads as an identity mark rather than a diagram. This is
 * what stops 23 cards from being 23 identical text boxes: every circuit gets a real, distinct
 * (if stylized) shape rather than a shared icon. */
function TrackGlyph({ seed, turns, trackType }: { seed: string; turns: number; trackType: "street" | "permanent" | "hybrid" }) {
  const shape = useMemo(() => generateTrackShape(seed, turns, trackType), [seed, turns, trackType]);
  return (
    <svg viewBox="0 0 100 100" className="h-12 w-12 shrink-0 opacity-70 transition-opacity group-hover:opacity-100" aria-hidden>
      <path d={shape.path} fill="none" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" />
    </svg>
  );
}

function daysUntil(seconds: number): string {
  const days = Math.floor(seconds / 86_400);
  if (days >= 1) return `${days} day${days === 1 ? "" : "s"}`;
  const hours = Math.floor(seconds / 3600);
  return hours >= 1 ? `${hours}h` : "Today";
}

/** Its own component, not a hook call inline in CircuitCard - useCountdown owns a real
 * setInterval(1000), and calling it in every card (even the 22 that never display it) would tick
 * every single completed/upcoming card once a second for a value none of them ever show. Only the
 * one "next race" card ever mounts this. */
function CountdownReadout({ targetMs }: { targetMs: number }) {
  const seconds = useCountdown(targetMs);
  return <p className="font-mono text-lg font-bold tabular-nums text-white">{daysUntil(seconds)}</p>;
}

export function CircuitCard({ entry }: { entry: CircuitExplorerEntry }) {
  const { race, facts } = entry;
  const isCompleted = race.state === "completed";
  const isNext = race.state === "next";

  return (
    <motion.div variants={staggerItem} whileHover={{ y: -2 }}>
      <Link
        href={circuitHref(race.circuit ?? race.name)}
        className={`group relative flex h-full flex-col gap-3 overflow-hidden rounded-lg border p-4 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--f1-red)] ${
          isNext
            ? "border-[var(--f1-red)]/35 bg-[var(--f1-red)]/[0.05] hover:border-[var(--f1-red)]/55"
            : "border-white/[0.07] bg-white/[0.015] hover:border-white/[0.16]"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-500">Round {race.round}</p>
            <h3 className="mt-1 truncate text-[15px] font-semibold leading-snug text-white">{race.name}</h3>
            <p className="mt-0.5 truncate text-xs text-neutral-500">{[race.circuit, race.country].filter(Boolean).join(", ") || "Location to be confirmed"}</p>
          </div>
          {facts && (
            <div className="shrink-0 text-neutral-500">
              <TrackGlyph seed={race.circuit ?? race.name} turns={facts.turns} trackType={facts.trackType} />
            </div>
          )}
        </div>

        <StatusBadge state={race.state} />

        <div className="mt-auto pt-1">
          {isCompleted ? (
            <dl className="space-y-1 text-xs">
              {race.winnerName && (
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="text-neutral-600">Winner</dt>
                  <dd className="truncate font-medium text-neutral-200">{race.winnerName}</dd>
                </div>
              )}
              {race.poleSitterName && (
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="text-neutral-600">Pole</dt>
                  <dd className="truncate text-neutral-400">{race.poleSitterName}</dd>
                </div>
              )}
              {race.fastestLap && (
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="text-neutral-600">Fastest lap</dt>
                  <dd className="truncate text-neutral-400">{race.fastestLap.driverName}</dd>
                </div>
              )}
              {!race.winnerName && <p className="text-neutral-600">Result not yet recorded.</p>}
            </dl>
          ) : isNext ? (
            <div>
              {race.raceDate ? <CountdownReadout targetMs={parseUtcDateTime(race.raceDate).getTime()} /> : <p className="text-sm text-neutral-500">Date to be confirmed</p>}
              {race.raceDate && (
                <p className="text-xs text-neutral-500">{parseUtcDateTime(race.raceDate).toLocaleDateString(undefined, { day: "numeric", month: "long" })}</p>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
              {race.raceDate && <span>{parseUtcDateTime(race.raceDate).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span>}
              {facts?.trackType === "street" && (
                <>
                  <span aria-hidden>·</span>
                  <span>Street circuit</span>
                </>
              )}
              {facts?.nightRace && (
                <>
                  <span aria-hidden>·</span>
                  <span>Night race</span>
                </>
              )}
              {race.isSprintWeekend && (
                <>
                  <span aria-hidden>·</span>
                  <span className="text-[#eab308]">Sprint</span>
                </>
              )}
            </div>
          )}
        </div>
      </Link>
    </motion.div>
  );
}

function StatusBadge({ state }: { state: "completed" | "next" | "upcoming" }) {
  if (state === "completed") {
    return (
      <span className="inline-flex w-fit items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
        <span aria-hidden>✓</span> Completed
      </span>
    );
  }
  if (state === "next") {
    return <span className="inline-flex w-fit items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--f1-red)]"><span aria-hidden className="pulse-ring h-1.5 w-1.5 rounded-full bg-[var(--f1-red)]" />Next race</span>;
  }
  return <span className="inline-flex w-fit items-center text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-600">Upcoming</span>;
}
