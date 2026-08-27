"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { raceHref } from "@/lib/routes";
import { useSeasonExplorer } from "./SeasonExplorerContext";
import { useSeasonFavorites } from "./SeasonFavoritesContext";
import type { DriverStandingRow, RaceSessionSummary, RaceSummary } from "../services/season.service";

type SessionType = "practice" | "qualifying" | "sprint" | "race";

const TYPE_COLOR: Record<SessionType, string> = {
  practice: "rgba(255,255,255,0.18)",
  qualifying: "rgba(255,255,255,0.4)",
  sprint: "#3987e5", // chart.sequentialBlue — the same secondary accent used in the progression chart
  race: "var(--f1-red)",
};

function sessionType(code: string): SessionType {
  if (code === "R") return "race";
  if (code.startsWith("S")) return "sprint";
  if (code === "Q") return "qualifying";
  return "practice";
}

type MonthGroup = { key: string; label: string; races: RaceSummary[] };

// raceSummaries already arrives sorted by round, and round order tracks the calendar
// chronologically, so a plain Map preserves month order for free — no extra sort needed.
function groupByMonth(raceSummaries: RaceSummary[]): MonthGroup[] {
  const groups = new Map<string, MonthGroup>();
  for (const r of raceSummaries) {
    const d = r.raceDate ? new Date(r.raceDate) : null;
    const key = d ? `${d.getFullYear()}-${d.getMonth()}` : "tbd";
    const label = d ? d.toLocaleDateString(undefined, { month: "short" }).toUpperCase() : "TBD";
    let g = groups.get(key);
    if (!g) {
      g = { key, label, races: [] };
      groups.set(key, g);
    }
    g.races.push(r);
  }
  return [...groups.values()];
}

/** The season at a glance, GitHub/LeetCode-activity-calendar inspired but built at session
 * granularity: every race weekend is its own small row of session cells (practice/qualifying/
 * sprint/race, each with its own color), grouped by month and wrapped so the whole season stays
 * a few compact lines instead of one cell per race. Hovering a session cell shows its own label/
 * date/status via a native title tooltip (120-ish cells is too many for a custom floating one);
 * clicking a race weekend opens the fuller detail panel below — and feeds `highlightRound` into
 * the progression chart above, so the two widgets read as one system. */
export function SeasonCalendar({ year, drivers, raceSummaries }: { year: number; drivers: DriverStandingRow[]; raceSummaries: RaceSummary[] }) {
  const { setHighlightRound } = useSeasonExplorer();
  const { favDrivers } = useSeasonFavorites();
  const [hovered, setHovered] = useState<number | null>(null);
  const [opened, setOpened] = useState<number | null>(null);

  const groups = useMemo(() => groupByMonth(raceSummaries), [raceSummaries]);

  const favoriteIdByCode = useMemo(() => new Map(drivers.map((d) => [d.driver, d.favoriteId])), [drivers]);
  function isFavoritePodium(race: RaceSummary): boolean {
    return race.results.some((r) => r.finishPosition <= 3 && r.driver && favoriteIdByCode.get(r.driver) && favDrivers.has(favoriteIdByCode.get(r.driver)!));
  }

  const effectiveHighlight = hovered ?? opened;
  useEffect(() => {
    setHighlightRound(effectiveHighlight);
  }, [effectiveHighlight, setHighlightRound]);
  // Clear the chart highlight when this widget unmounts/navigates away, so it doesn't linger.
  useEffect(() => () => setHighlightRound(null), [setHighlightRound]);

  const openedRace = raceSummaries.find((r) => r.round === opened);

  return (
    <div>
      <p className="mb-4 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">Season calendar</p>

      <div className="space-y-3">
        {groups.map((g) => (
          <div key={g.key} className="flex items-start gap-4">
            <p className="w-8 shrink-0 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-600">{g.label}</p>
            <div className="flex flex-1 flex-wrap gap-x-6 gap-y-2">
              {g.races.map((r) => (
                <RaceBlock
                  key={r.round}
                  race={r}
                  isOpen={opened === r.round}
                  isFavoritePodium={isFavoritePodium(r)}
                  onHover={() => setHovered(r.round)}
                  onLeave={() => setHovered((prev) => (prev === r.round ? null : prev))}
                  onClick={() => setOpened((prev) => (prev === r.round ? null : r.round))}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-1.5 text-[10px] text-neutral-500">
        <span className="flex items-center gap-3">
          <LegendSwatch className="opacity-100" label="Completed" />
          <LegendSwatch className="pulse-ring opacity-100 ring-1 ring-white/40" label="Current" />
          <LegendSwatch className="border border-white/30 bg-transparent opacity-100" label="Upcoming" />
        </span>
        <span className="flex items-center gap-3">
          {(["practice", "qualifying", "sprint", "race"] as const).map((t) => (
            <span key={t} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-[2px]" style={{ background: TYPE_COLOR[t] }} />
              <span className="capitalize">{t}</span>
            </span>
          ))}
        </span>
        <LegendDot className="bg-amber-400" label="Favorite podium" />
      </div>

      {openedRace && (
        <div className="glass-surface mt-4 rounded-xl p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Round {openedRace.round}</p>
              <p className="mt-0.5 text-lg font-semibold text-white">{openedRace.name}</p>
            </div>
            <button onClick={() => setOpened(null)} aria-label="Close" className="text-neutral-500 transition hover:text-white">
              ×
            </button>
          </div>

          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
            {openedRace.sessions.map((s) => (
              <span key={s.label} className="flex items-center gap-1.5 text-xs text-neutral-400" title={s.label}>
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    s.state === "completed" ? "" : s.state === "current" ? "pulse-ring" : "border border-white/30"
                  }`}
                  style={s.state !== "upcoming" ? { background: TYPE_COLOR[sessionType(s.code)] } : undefined}
                />
                {s.code}
              </span>
            ))}
          </div>

          {openedRace.results.length > 0 ? (
            <>
              <div className="mt-4 flex flex-col gap-1.5">
                {openedRace.results
                  .filter((r) => r.finishPosition <= 3)
                  .sort((a, b) => a.finishPosition - b.finishPosition)
                  .map((r) => (
                    <div key={r.driver} className="flex items-center justify-between text-sm">
                      <span className={r.finishPosition === 1 ? "font-semibold text-white" : "text-neutral-300"}>
                        P{r.finishPosition} {r.driverName}
                      </span>
                      <span className="font-mono tabular-nums text-neutral-500">+{r.points}</span>
                    </div>
                  ))}
              </div>
              <Link
                href={raceHref(year, openedRace.round)}
                className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-neutral-400 transition hover:text-white"
              >
                View race →
              </Link>
            </>
          ) : (
            <p className="mt-3 text-sm text-neutral-500">
              {openedRace.state === "next" ? "Coming up next." : "Not yet run."}
              {openedRace.raceDate && ` ${new Date(openedRace.raceDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}.`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function RaceBlock({
  race,
  isOpen,
  isFavoritePodium,
  onHover,
  onLeave,
  onClick,
}: {
  race: RaceSummary;
  isOpen: boolean;
  isFavoritePodium: boolean;
  onHover: () => void;
  onLeave: () => void;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      onClick={onClick}
      title={race.name}
      className={`group flex flex-col items-start gap-1 rounded-md px-1.5 py-1 transition-colors duration-150 ${isOpen ? "bg-white/[0.07]" : "hover:bg-white/[0.03]"}`}
    >
      <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-500 transition-colors group-hover:text-neutral-300">
        {race.trackShort}
        {isFavoritePodium && <span className="h-1 w-1 shrink-0 rounded-full bg-amber-400" />}
      </span>
      <span className="flex gap-[3px]">
        {race.sessions.map((s) => (
          <SessionCell key={s.label} session={s} />
        ))}
      </span>
    </button>
  );
}

function SessionCell({ session }: { session: RaceSessionSummary }) {
  const type = sessionType(session.code);
  const color = TYPE_COLOR[type];
  const label = `${session.label} — ${new Date(session.date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}${
    session.state === "current" ? " (up next)" : session.state === "completed" ? " (completed)" : ""
  }`;

  if (session.state === "upcoming") {
    return <span title={label} className="h-[11px] w-[11px] rounded-[2.5px] border transition-transform duration-150 group-hover:scale-110" style={{ borderColor: color, opacity: 0.6 }} />;
  }
  return (
    <span
      title={label}
      className={`h-[11px] w-[11px] rounded-[2.5px] transition-transform duration-150 group-hover:scale-110 ${session.state === "current" ? "pulse-ring" : ""}`}
      style={{ background: color }}
    />
  );
}

function LegendSwatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-[10px] w-[10px] rounded-[2.5px] bg-white/25 ${className}`} />
      {label}
    </span>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-1.5 w-1.5 rounded-full ${className}`} />
      {label}
    </span>
  );
}
