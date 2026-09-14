"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useCountdown } from "@/hooks/useCountdown";
import { parseUtcDateTime } from "@/lib/countdown";
import { circuitHref, raceHref } from "@/lib/routes";
import { generateTrackShape } from "@/lib/trackShape";
import { nodeStatus } from "./SeasonMap";
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
  return <p className="font-mono text-3xl font-bold tabular-nums leading-none text-white">{daysUntil(seconds)}</p>;
}

/**
 * The one rich focus area the whole page is built around - whatever round is currently selected
 * in the SeasonMap above it (defaulting to the current/next round), not just "the next race" the
 * old NextRaceFocus strip was hardcoded to. A real three-part composition (identity + geometry,
 * date/session or result, track profile) rather than the old single thin row, so selecting any
 * round - completed or still to come - gets a substantial, useful answer instead of a one-liner.
 */
export function CircuitFocusPanel({ entry, year }: { entry: CircuitExplorerEntry; year: number }) {
  const { race, facts } = entry;
  const status = nodeStatus(race);
  const shape = useMemo(() => generateTrackShape(race.circuit ?? race.name, facts?.turns ?? 12, facts?.trackType ?? "permanent"), [race, facts]);
  const location = [race.circuit, race.country].filter(Boolean).join(", ");
  const nextSession = race.sessions.find((s) => s.state === "current") ?? race.sessions.find((s) => s.state === "upcoming") ?? null;

  const eyebrowLabel = status === "completed" ? `Round ${race.round} · Completed` : status === "current" ? `Next stop · Round ${race.round}` : `Round ${race.round} · Upcoming`;

  return (
    <div className={`rounded-xl border p-5 sm:p-6 ${status === "current" ? "border-[var(--f1-red)]/25 bg-[var(--f1-red)]/[0.04]" : "border-white/[0.08] bg-white/[0.02]"}`}>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)]">
        {/* Identity + geometry - the circuit's own visual signature, sized to actually matter. */}
        <div className="flex items-center gap-4 lg:flex-col lg:items-start lg:gap-3">
          <span className={`relative flex h-28 w-28 shrink-0 items-center justify-center rounded-xl sm:h-32 sm:w-32 ${status === "current" ? "bg-[var(--f1-red)]/[0.08]" : "bg-white/[0.04]"}`}>
            {status === "current" && <span aria-hidden className="pulse-ring absolute inset-0 rounded-xl bg-[var(--f1-red)]/15" />}
            <svg viewBox={shape.viewBox || "0 0 100 100"} className={`relative h-24 w-24 sm:h-28 sm:w-28 ${status === "current" ? "text-[var(--f1-red)]" : "text-neutral-200"}`} aria-hidden>
              <path d={shape.path} fill="none" stroke="currentColor" strokeWidth={shape.isAuthentic ? 6 : 4} strokeLinecap="round" />
            </svg>
          </span>
          <div className="min-w-0">
            <p className={`text-[10px] font-semibold uppercase tracking-[0.18em] ${status === "current" ? "text-[var(--f1-red)]" : "text-neutral-500"}`}>{eyebrowLabel}</p>
            <h2 className="mt-1 text-xl font-bold leading-tight text-white sm:text-2xl">{race.name}</h2>
            {location && <p className="mt-0.5 text-sm text-neutral-400">{location}</p>}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {facts?.trackType === "street" && <Badge>Street circuit</Badge>}
              {facts?.nightRace && <Badge tone="amber">Night race</Badge>}
              {race.isSprintWeekend && <Badge tone="amber">Sprint weekend</Badge>}
            </div>
          </div>
        </div>

        {/* Date / countdown / session, or the real result for a completed round. */}
        <div className="border-t border-white/[0.06] pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          {status === "completed" ? (
            <div className="space-y-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-600">Result</p>
              {race.winnerName ? (
                <Stat label="Winner" value={race.winnerName} />
              ) : (
                <p className="text-sm text-neutral-600">Results not in yet</p>
              )}
              {race.poleSitterName && <Stat label="Pole" value={race.poleSitterName} />}
              {race.fastestLap?.driverName && <Stat label="Fastest lap" value={race.fastestLap.driverName} />}
            </div>
          ) : (
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-600">Schedule</p>
                {nextSession ? (
                  <Stat label="Next session" value={`${nextSession.label} · ${parseUtcDateTime(nextSession.date).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}`} />
                ) : (
                  <p className="text-sm text-neutral-600">Session schedule not published yet</p>
                )}
              </div>
              {race.raceDate ? (
                <div className="shrink-0 text-right">
                  <p className="text-[9px] uppercase tracking-wide text-neutral-500">Lights out</p>
                  <CountdownReadout targetMs={parseUtcDateTime(race.raceDate).getTime()} />
                </div>
              ) : (
                <p className="shrink-0 text-xs text-neutral-500">Date TBC</p>
              )}
            </div>
          )}
        </div>

        {/* Track profile - a real editorial grid of authoritative facts, never invented values. */}
        <div className="border-t border-white/[0.06] pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-600">Track profile</p>
          {facts ? (
            <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-3">
              <Metric value={`${facts.lengthKm.toFixed(3)} km`} label="Length" />
              <Metric value={facts.turns} label="Turns" />
              <Metric value={facts.trackType === "street" ? "Street" : facts.trackType === "hybrid" ? "Hybrid" : "Permanent"} label="Type" />
              <Metric value={facts.firstGrandPrix} label="First GP" />
              {facts.drsZones != null && <Metric value={facts.drsZones} label="DRS zones" />}
              {facts.lapRecord && <Metric value={`${facts.lapRecord.timeSec.toFixed(3)}s`} label={`Lap record · ${facts.lapRecord.year}`} />}
            </dl>
          ) : (
            <p className="mt-2.5 text-sm text-neutral-600">No track profile on record for this circuit yet.</p>
          )}

          <div className="mt-4 flex items-center gap-3">
            <Link
              href={circuitHref(race.circuit ?? race.name)}
              className="inline-flex items-center gap-1 rounded-lg bg-[var(--f1-red)] px-3 py-1.5 text-[11px] font-semibold text-white transition hover:brightness-110"
            >
              View full circuit →
            </Link>
            {status === "completed" && (
              <Link href={raceHref(year, race.round, race.name)} className="text-[11px] font-medium text-neutral-400 transition hover:text-white">
                Full race analysis →
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "amber" }) {
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${tone === "amber" ? "border-[#eab308]/30 text-[#eab308]" : "border-white/10 text-neutral-400"}`}>
      {children}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <p className="text-sm">
      <span className="text-neutral-500">{label} </span>
      <span className="font-medium text-white">{value}</span>
    </p>
  );
}

function Metric({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="min-w-0">
      <dd className="font-mono text-base font-semibold text-white">{value}</dd>
      <dt className="text-[10px] text-neutral-500">{label}</dt>
    </div>
  );
}
