"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/components/motion/variants";
import { useCountdown } from "@/hooks/useCountdown";
import { parseUtcDateTime } from "@/lib/countdown";
import { circuitHref } from "@/lib/routes";
import { generateTrackShape } from "@/lib/trackShape";
import { Skeleton } from "@/components/ui/Skeleton";
import type { CircuitExplorerEntry } from "../services/circuits.service";

type Filter = "all" | "completed" | "next" | "upcoming" | "favorites";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "completed", label: "Completed" },
  { value: "next", label: "Next" },
  { value: "upcoming", label: "Upcoming" },
  { value: "favorites", label: "My Favourite Tracks" },
];

function TrackGlyph({ seed, turns, trackType }: { seed: string; turns: number; trackType: "street" | "permanent" | "hybrid" }) {
  const shape = useMemo(() => generateTrackShape(seed, turns, trackType), [seed, turns, trackType]);
  return (
    <svg viewBox={shape.viewBox || "0 0 100 100"} className="h-10 w-10 shrink-0 opacity-70 transition-opacity group-hover:opacity-100" aria-hidden>
      <path d={shape.path} fill="none" stroke="currentColor" strokeWidth={shape.isAuthentic ? 1.5 : 3.5} strokeLinecap="round" />
    </svg>
  );
}

function daysUntil(seconds: number): string {
  const days = Math.floor(seconds / 86_400);
  if (days >= 1) return `${days} day${days === 1 ? "" : "s"}`;
  const hours = Math.floor(seconds / 3600);
  return hours >= 1 ? `${hours}h` : "Today";
}

function CountdownReadout({ targetMs }: { targetMs: number }) {
  const seconds = useCountdown(targetMs);
  return <p className="font-mono text-xl font-bold tabular-nums text-white">{daysUntil(seconds)}</p>;
}

export function CircuitExplorerTimeline({ entries, favoriteTracks = [] }: { entries: CircuitExplorerEntry[], favoriteTracks?: string[] }) {
  const [filter, setFilter] = useState<Filter>("all");

  const availableFilters = useMemo(() => {
    return FILTERS.filter(f => {
      if (f.value === "all") return true;
      if (f.value === "favorites") return favoriteTracks.length > 0;
      return entries.some((e) => {
        if (f.value === "completed") return e.race.state === "completed";
        if (f.value === "next") return e.race.state === "next";
        if (f.value === "upcoming") return e.race.state === "upcoming";
        return false;
      });
    });
  }, [entries, favoriteTracks]);

  const visible = useMemo(() => {
    return entries.filter((e) => {
      if (filter === "all") return true;
      if (filter === "favorites") return favoriteTracks.includes(e.race.circuit ?? e.race.name);
      if (filter === "completed") return e.race.state === "completed";
      if (filter === "next") return e.race.state === "next";
      if (filter === "upcoming") return e.race.state === "upcoming";
      return true;
    });
  }, [entries, filter, favoriteTracks]);

  return (
    <div className="mt-8">
      <div className="mb-8 flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter circuits">
        {availableFilters.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            aria-pressed={filter === f.value}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--f1-red)] ${
              filter === f.value
                ? "border-[var(--f1-red)]/45 bg-[var(--f1-red)]/[0.09] text-white"
                : "border-[var(--f1-line)] text-neutral-400 hover:border-white/20 hover:text-neutral-200"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="flex min-h-[160px] items-center justify-center rounded-lg border border-dashed border-white/10 px-6 text-center text-sm text-neutral-500">
          No circuits match this filter.
        </div>
      ) : (
        <div className="relative border-l-2 border-white/10 pl-6 sm:ml-4 sm:pl-8">
          <motion.div initial="hidden" animate="show" variants={staggerContainer} className="flex flex-col gap-10">
            {visible.map((entry) => (
              <TimelineNode key={entry.race.round} entry={entry} />
            ))}
          </motion.div>
        </div>
      )}
    </div>
  );
}

function TimelineNode({ entry }: { entry: CircuitExplorerEntry }) {
  const { race, facts } = entry;
  const isCompleted = race.state === "completed";
  const isNext = race.state === "next";

  // The indicator on the spine
  const indicatorColor = isNext ? "bg-[var(--f1-red)]" : isCompleted ? "bg-white" : "bg-neutral-600 border border-neutral-500";
  const pulse = isNext ? <span aria-hidden className="absolute inset-0 block h-3 w-3 animate-ping rounded-full bg-[var(--f1-red)] opacity-40" /> : null;

  return (
    <motion.div variants={staggerItem} className="relative group">
      {/* Spine Marker */}
      <div className="absolute -left-[31px] sm:-left-[39px] top-4 flex h-3 w-3 items-center justify-center">
        {pulse}
        <div className={`relative z-10 h-3 w-3 rounded-full ${indicatorColor} transition-transform group-hover:scale-125`} />
      </div>

      {isNext ? (
        <FeaturedTimelineNode race={race} facts={facts} />
      ) : isCompleted ? (
        <CompletedTimelineNode race={race} facts={facts} />
      ) : (
        <FutureTimelineNode race={race} facts={facts} />
      )}
    </motion.div>
  );
}

function CompletedTimelineNode({ race, facts }: { race: CircuitExplorerEntry["race"], facts: CircuitExplorerEntry["facts"] }) {
  return (
    <Link
      href={circuitHref(race.circuit ?? race.name)}
      className="flex flex-col sm:flex-row gap-4 sm:gap-6 rounded-xl border border-white/5 bg-white/[0.015] p-4 transition hover:bg-white/[0.03] hover:border-white/10"
    >
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-500">Round {race.round}</p>
        <h3 className="mt-1 text-lg font-semibold text-white">{race.name}</h3>
        <p className="mt-0.5 text-xs text-neutral-400">{[race.circuit, race.country].filter(Boolean).join(", ")}</p>
        {race.raceDate && (
          <p className="mt-2 text-xs text-neutral-500">{parseUtcDateTime(race.raceDate).toLocaleDateString(undefined, { day: "numeric", month: "long" })}</p>
        )}
      </div>
      <div className="flex-1 flex flex-col justify-center text-xs text-neutral-300 space-y-1 border-l border-white/5 pl-4 sm:pl-6">
        {race.winnerName && <p><span className="text-neutral-500 font-medium">Winner:</span> {race.winnerName}</p>}
        {race.poleSitterName && <p><span className="text-neutral-500 font-medium">Pole:</span> {race.poleSitterName}</p>}
        {race.fastestLap?.driverName && <p><span className="text-neutral-500 font-medium">Fastest lap:</span> {race.fastestLap.driverName}</p>}
      </div>
      {facts && (
        <div className="shrink-0 flex items-center pr-2">
          <TrackGlyph seed={race.circuit ?? race.name} turns={facts.turns} trackType={facts.trackType} />
        </div>
      )}
    </Link>
  );
}

function FeaturedTimelineNode({ race, facts }: { race: CircuitExplorerEntry["race"], facts: CircuitExplorerEntry["facts"] }) {
  const [loaded, setLoaded] = useState(false);
  const imageUrl = race.photoUrls?.[0]; 

  return (
    <Link
      href={circuitHref(race.circuit ?? race.name)}
      className="block overflow-hidden rounded-2xl border border-[var(--f1-red)]/35 bg-black/40 shadow-xl transition hover:border-[var(--f1-red)]/55"
    >
      <div className="relative aspect-[21/9] w-full">
        {imageUrl ? (
          <>
            {!loaded && <Skeleton className="skeleton-shimmer absolute inset-0" />}
            <Image
              src={imageUrl}
              alt=""
              fill
              sizes="(min-width: 640px) 800px, 100vw"
              className={`object-cover transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
              onLoad={() => setLoaded(true)}
            />
          </>
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_120%_120%_at_25%_0%,rgba(225,6,0,0.15),transparent_65%)]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--f1-carbon)] via-[var(--f1-carbon)]/60 to-transparent" />
        <div className="absolute bottom-4 left-4 sm:bottom-6 sm:left-6 right-4 sm:right-6 flex items-end justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--f1-red)]">Next Round · R{race.round}</p>
            <h3 className="mt-1 text-2xl font-bold text-white sm:text-3xl">{race.name}</h3>
          </div>
          {facts && (
            <div className="hidden sm:block">
              <TrackGlyph seed={race.circuit ?? race.name} turns={facts.turns} trackType={facts.trackType} />
            </div>
          )}
        </div>
      </div>
      <div className="p-4 sm:p-6 flex flex-col sm:flex-row gap-6 bg-[var(--f1-carbon)]">
        <div className="flex-1 space-y-4">
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-neutral-400">
            <p>{[race.circuit, race.country].filter(Boolean).join(", ")}</p>
            {race.isSprintWeekend && <p className="font-semibold text-[#eab308]">Sprint Weekend</p>}
            {facts?.trackType === "street" && <p>Street Circuit</p>}
            {facts?.nightRace && <p>Night Race</p>}
          </div>
          <div className="text-sm text-neutral-300">
            {facts ? <p>{facts.venueName} runs {facts.lengthKm.toFixed(1)}km over {facts.turns} turns.</p> : <p>The next destination on the F1 calendar.</p>}
          </div>
        </div>
        <div className="shrink-0 flex items-center justify-start sm:justify-end border-t sm:border-t-0 sm:border-l border-white/10 pt-4 sm:pt-0 sm:pl-6">
          {race.raceDate ? (
            <div className="text-left sm:text-right">
              <p className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1">Lights Out</p>
              <CountdownReadout targetMs={parseUtcDateTime(race.raceDate).getTime()} />
            </div>
          ) : (
            <p className="text-sm text-neutral-500">Date to be confirmed</p>
          )}
        </div>
      </div>
    </Link>
  );
}

function FutureTimelineNode({ race, facts }: { race: CircuitExplorerEntry["race"], facts: CircuitExplorerEntry["facts"] }) {
  return (
    <Link
      href={circuitHref(race.circuit ?? race.name)}
      className="flex items-center justify-between gap-4 py-2 transition group-hover:px-2 rounded-lg group-hover:bg-white/[0.02]"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-neutral-500">R{race.round}</span>
          <h3 className="text-sm font-medium text-white">{race.name}</h3>
        </div>
        <p className="mt-1 text-xs text-neutral-500">
          {[race.circuit, race.country].filter(Boolean).join(", ")}
          {race.raceDate && ` · ${parseUtcDateTime(race.raceDate).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`}
        </p>
      </div>
      {facts && (
        <div className="shrink-0 opacity-50 transition group-hover:opacity-100">
          <TrackGlyph seed={race.circuit ?? race.name} turns={facts.turns} trackType={facts.trackType} />
        </div>
      )}
    </Link>
  );
}
