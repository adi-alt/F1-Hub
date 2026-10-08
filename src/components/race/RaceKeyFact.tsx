"use client";

import { DriverIdentity } from "@/components/ui/DriverIdentity";
import { useMinuteClock } from "@/hooks/useMinuteClock";
import { useViewerTimeZone } from "@/hooks/useViewerTimeZone";
import { formatCountdown, formatLocalDateTime, parseUtcDateTime } from "@/lib/countdown";
import { liveSession, nextSession, sessionCode } from "@/lib/sessionCode";
import type { CalendarSession } from "@/lib/supabase/calendar";
import type { RaceResultEntry } from "@/lib/types/race";

/**
 * The one fact a race page leads with (spec §3.1, §3.4): before the race, how long until the next session;
 * while one runs, that it is running; after the race, who won and by how much. It sits in the page header, so
 * on a phone it is above the fold instead of at the bottom of a long rail.
 */
export function RaceKeyFact({ sessions, results }: { sessions: CalendarSession[]; results?: RaceResultEntry[] | null }) {
  const now = useMinuteClock();
  const timeZone = useViewerTimeZone();

  const winner = results?.find((r) => r.finishPosition === 1);
  if (winner) {
    const second = results?.find((r) => r.finishPosition === 2);
    const margin = second?.finishGapSec ? `by ${second.finishGapSec.toFixed(3)}s` : null;
    return (
      <div>
        <p className="text-caption text-secondary">Winner</p>
        <DriverIdentity code={winner.driver} name={winner.driverName} team={winner.team} size={32} nameVisibility="always" className="mt-1 text-body" />
        {margin && <p className="mt-1 text-body-sm tabular text-secondary">{margin}</p>}
      </div>
    );
  }

  const live = liveSession(sessions, now);
  if (live) {
    return (
      <div>
        <p className="flex items-center gap-1.5 text-caption text-brand-text lg:justify-end">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-brand motion-safe:animate-pulse" />
          On now
        </p>
        <p className="mt-1 text-title-lg text-primary">{live.label}</p>
        <p className="mt-1 text-body-sm text-secondary">Results follow about 30 minutes after the flag.</p>
      </div>
    );
  }

  const next = nextSession(sessions, now);
  if (!next) {
    // Every session has run but no result is stored yet: say so rather than show nothing.
    if (sessions.length === 0) return null;
    return (
      <div>
        <p className="text-caption text-secondary">Race over</p>
        <p className="mt-1 text-body text-primary">Results appear here as soon as they are posted.</p>
      </div>
    );
  }
  const countdown = formatCountdown(parseUtcDateTime(next.date).getTime(), now);
  return (
    <div>
      <p className="text-caption text-secondary">{sessionCode(next.label) === "R" ? "Lights out in" : `${next.label} in`}</p>
      <p className="mt-1 text-display-md tabular text-primary">{countdown}</p>
      <p className="mt-1 text-body-sm text-secondary">{formatLocalDateTime(next.date, timeZone)}</p>
    </div>
  );
}
