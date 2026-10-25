"use client";

import { useState } from "react";
import Link from "next/link";
import { EntityAvatar } from "@/components/EntityAvatar";
import { EYEBROW } from "@/components/ui/panel";
import { ensureVisible } from "@/lib/colorContrast";
import { computeTrackRecords, filterByRaceName, joinNames, type CircuitYearRecord } from "@/lib/circuitIntelligence";
import { teamColor } from "@/lib/teamColors";

const YEARS_SHOWN_COLLAPSED = 10;

/** A winner's headshot and profile link, by year (circuits.service buildWinnerMedia). */
export type WinnerMediaByYear = Record<number, { photoUrl: string | null; href: string | null }>;

function Fact({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <dt className={EYEBROW}>{label}</dt>
      <dd className="mt-1 truncate text-body font-semibold text-primary">{value}</dd>
      {sub && <dd className="truncate text-caption text-secondary">{sub}</dd>}
    </div>
  );
}

function WinnerRow({ r, media, showVenue }: { r: CircuitYearRecord; media?: { photoUrl: string | null; href: string | null }; showVenue: boolean }) {
  const name = r.winnerDriver ?? "No classified winner";
  return (
    <li className="flex items-center gap-3 py-2">
      <span className="w-10 shrink-0 tabular text-body-sm text-secondary">{r.year}</span>
      <span aria-hidden className="h-6 w-[3px] shrink-0 rounded-full" style={{ backgroundColor: r.winnerTeam ? ensureVisible(teamColor(r.winnerTeam)) : "transparent" }} />
      <EntityAvatar imageUrl={media?.photoUrl ?? null} name={name} size={24} />
      <span className="min-w-0 flex-1">
        {media?.href ? (
          <Link href={media.href} className="block truncate rounded-control text-body-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring">
            {name}
          </Link>
        ) : (
          <span className="block truncate text-body-sm font-medium text-primary">{name}</span>
        )}
        <span className="block truncate text-caption text-secondary">{[r.winnerTeam, showVenue ? r.venue : null].filter(Boolean).join(" · ")}</span>
      </span>
    </li>
  );
}

/**
 * The Grand Prix's own history, year by year: the event's runnings across every venue it has used (eventTimeline,
 * built from the event's name, not the circuit), so the Spanish Grand Prix shows Barcelona's 1991-2025 as well as
 * Jarama. When this year's venue is new to the event, it says so rather than presenting an old track's past as
 * this one's.
 */
export function GrandPrixHistoryContent({ raceName, timeline, venue, media = {} }: { raceName: string; timeline: CircuitYearRecord[]; venue: string; media?: WinnerMediaByYear }) {
  const [expanded, setExpanded] = useState(false);
  const gpTimeline = filterByRaceName(timeline, raceName);
  if (gpTimeline.length === 0) return null;

  const records = computeTrackRecords(gpTimeline);
  const oldestYear = gpTimeline[gpTimeline.length - 1].year;
  const venues = [...new Set(gpTimeline.map((r) => r.venue).filter((v): v is string => !!v))];
  const latest = gpTimeline[0];
  // A venue the event has used only this once (the newest year): its history is the event's, not the track's.
  const newVenue = venues.length > 1 && latest.venue && gpTimeline.filter((r) => r.venue === latest.venue).length === 1 ? latest.venue : null;
  const rows = expanded ? gpTimeline : gpTimeline.slice(0, YEARS_SHOWN_COLLAPSED);

  return (
    <div>
      <dl className="grid grid-cols-2 gap-5 sm:grid-cols-3">
        <Fact label="Runnings" value={`${gpTimeline.length}`} sub={`since ${oldestYear}${venues.length > 1 ? `, at ${venues.length} venues` : ""}`} />
        {records.mostWins && <Fact label="Most wins" value={joinNames(records.mostWins.drivers)} sub={`${records.mostWins.count} ${records.mostWins.count === 1 ? "win" : "wins"}`} />}
        {latest.winnerDriver && <Fact label="Last winner" value={latest.winnerDriver} sub={`${latest.year}${latest.winnerTeam ? `, ${latest.winnerTeam}` : ""}`} />}
      </dl>
      {newVenue && (
        <p className="mt-5 text-body-sm text-secondary">
          {latest.year} was the first {raceName} at {venue}. The years before it ran elsewhere, so they are the event&apos;s history, not this track&apos;s.
        </p>
      )}
      <ol className="mt-5 grid gap-x-8 border-t border-subtle pt-3 md:grid-cols-2" aria-label={`${raceName} winners by year`}>
        {rows.map((r) => (
          <WinnerRow key={r.year} r={r} media={media[r.year]} showVenue={venues.length > 1} />
        ))}
      </ol>
      {gpTimeline.length > YEARS_SHOWN_COLLAPSED && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 rounded-control text-body-sm font-medium text-secondary transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          {expanded ? "Show fewer years" : `Show all ${gpTimeline.length} years`}
        </button>
      )}
    </div>
  );
}

/** Whether GrandPrixHistoryContent would render anything real, so RaceHistorySection only offers the tab then. */
export function hasGrandPrixHistory(raceName: string, timeline: CircuitYearRecord[]): boolean {
  if (timeline.length === 0) return false;
  return filterByRaceName(timeline, raceName).length > 0;
}
