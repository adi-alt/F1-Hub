"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";
import { useCountdown } from "@/hooks/useCountdown";
import { parseUtcDateTime } from "@/lib/countdown";
import { circuitHref } from "@/lib/routes";
import { generateTrackShape } from "@/lib/trackShape";
import type { CircuitExplorerEntry } from "../services/circuits.service";

function daysUntil(seconds: number): string {
  const days = Math.floor(seconds / 86_400);
  if (days >= 1) return `${days}d`;
  const hours = Math.floor(seconds / 3600);
  if (hours >= 1) return `${hours}h`;
  const minutes = Math.floor(seconds / 60);
  return `${Math.max(minutes, 0)}m`;
}

function CountdownReadout({ targetMs }: { targetMs: number }) {
  const seconds = useCountdown(targetMs);
  return <p className="font-mono text-2xl font-bold tabular-nums leading-none text-white">{daysUntil(seconds)}</p>;
}

/** A compact, permanently-visible "what's next" strip - deliberately NOT a full-bleed hero image
 * card (that was the old FeaturedTimelineNode's job, and the whole reason this section needed
 * scrolling to get past). The season journey above stays the primary visual; this is a focused
 * summary of the one round it's already pointing at, sized to sit comfortably beneath it rather
 * than compete with it. Renders nothing once the season is over - there's no "next" round to focus
 * on, and a stale placeholder would be a wrong statement, not an honest empty state. */
export function NextRaceFocus({ entries }: { entries: CircuitExplorerEntry[] }) {
  const next = entries.find((e) => e.race.state === "next");
  const shape = useMemo(() => {
    if (!next) return null;
    return generateTrackShape(next.race.circuit ?? next.race.name, next.facts?.turns ?? 12, next.facts?.trackType ?? "permanent");
  }, [next]);

  if (!next || !shape) return null;
  const { race, facts } = next;
  const location = [race.circuit, race.country].filter(Boolean).join(", ");

  return (
    <Link
      href={circuitHref(race.circuit ?? race.name)}
      className="group mt-6 flex flex-col gap-4 rounded-xl border border-[var(--f1-red)]/25 bg-[var(--f1-red)]/[0.04] p-4 transition hover:border-[var(--f1-red)]/45 sm:flex-row sm:items-center sm:gap-6 sm:p-5"
    >
      <div className="flex items-center gap-4">
        <span className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-[var(--f1-red)]/[0.08]">
          <span aria-hidden className="pulse-ring absolute inset-0 rounded-lg bg-[var(--f1-red)]/15" />
          <svg viewBox={shape.viewBox || "0 0 100 100"} className="relative h-12 w-12 text-[var(--f1-red)]" aria-hidden>
            <path d={shape.path} fill="none" stroke="currentColor" strokeWidth={shape.isAuthentic ? 5 : 3.5} strokeLinecap="round" />
          </svg>
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--f1-red)]">Next stop · Round {race.round}</p>
          <h3 className="mt-0.5 truncate text-lg font-bold text-white">{race.name}</h3>
          {location && <p className="mt-0.5 text-xs text-neutral-400">{location}</p>}
        </div>
      </div>

      <div className="flex flex-1 flex-wrap items-center gap-x-6 gap-y-2 border-t border-white/[0.06] pt-3 text-xs text-neutral-400 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
        {facts ? (
          <>
            <span>{facts.lengthKm.toFixed(1)} km</span>
            <span>{facts.turns} turns</span>
            <span>{facts.trackType === "street" ? "Street circuit" : facts.trackType === "hybrid" ? "Hybrid circuit" : "Permanent circuit"}</span>
            {facts.nightRace && <span className="text-[#eab308]">Night race</span>}
          </>
        ) : (
          <span className="text-neutral-600">No track profile yet</span>
        )}
        {race.isSprintWeekend && <span className="font-semibold text-[#eab308]">Sprint weekend</span>}
      </div>

      <div className="flex shrink-0 items-center gap-4 sm:pl-4">
        {race.raceDate ? (
          <div className="text-right">
            <p className="text-[9px] uppercase tracking-wide text-neutral-500">Lights out</p>
            <CountdownReadout targetMs={parseUtcDateTime(race.raceDate).getTime()} />
          </div>
        ) : (
          <p className="text-xs text-neutral-500">Date TBC</p>
        )}
        <ChevronRightIcon className="h-4 w-4 shrink-0 text-neutral-600 transition group-hover:translate-x-0.5 group-hover:text-[var(--f1-red)]" aria-hidden />
      </div>
    </Link>
  );
}
