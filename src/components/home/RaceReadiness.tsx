"use client";

import { Skeleton } from "@/components/ui/LegacySkeleton";
import { SessionSchedule, type ScheduleSession } from "@/components/ui/SessionSchedule";
import { useViewerTimeZone } from "@/hooks/useViewerTimeZone";
import { formatLocalTime, formatLocalWeekday, localZoneLabel } from "@/lib/countdown";
import { sessionCode } from "@/lib/sessionCode";
import type { CalendarEntry } from "@/lib/supabase/calendar";
import type { RaceDoc } from "@/lib/types/race";

type Step = { code: string; done: boolean; date: string };

// Session *existence* comes from the calendar (a sprint weekend genuinely has no "FP2" the
// conventional way — RaceWeekendPanel's own chip row already reads calendar.sessions for this
// exact reason, not a hardcoded FP1-FP2-FP3-Q-R list). Whether a step is *done* comes from real
// data presence on the race itself, never from the scheduled time having merely passed — a
// pipeline that hasn't posted a session yet isn't "done" just because the clock says it should be.
// Sprint qualifying/sprint race have no dedicated fields in RaceDoc, so they fall back to sharing
// the qualifying/race done-signal — an approximation, fine for a glanceable weekend stepper.
function buildSteps(calendarEntry: CalendarEntry | null, race: RaceDoc | null): Step[] {
  if (!calendarEntry || calendarEntry.sessions.length === 0) return [];
  return calendarEntry.sessions.map((s) => {
    const code = sessionCode(s.label);
    const done =
      code === "P1"
        ? !!race?.practice?.FP1
        : code === "P2"
          ? !!race?.practice?.FP2
          : code === "P3"
            ? !!race?.practice?.FP3
            : code === "Q" || code === "SQ"
              ? !!race?.inputs?.length
              : code === "R" || code === "SR"
                ? race?.status === "completed" && !!race?.results?.length
                : false;
    return { code, done, date: s.date };
  });
}

export function RaceReadiness({ calendarEntry, race }: { calendarEntry: CalendarEntry | null; race: RaceDoc | null }) {
  const tz = useViewerTimeZone();
  const steps = buildSteps(calendarEntry, race);
  if (steps.length === 0) return null;

  // The first session that isn't done is the next one; everything after it is just upcoming.
  const nextIndex = steps.findIndex((step) => !step.done);
  const sessions: ScheduleSession[] = steps.map((step, i) => ({
    code: step.code,
    when: [formatLocalWeekday(step.date, tz), formatLocalTime(step.date, tz, false)],
    state: step.done ? "done" : i === nextIndex ? "next" : "upcoming",
  }));

  return <SessionSchedule sessions={sessions} zoneLabel={localZoneLabel(tz)} />;
}

export function RaceReadinessSkeleton() {
  return (
    <div className="grid grid-cols-5 gap-1" aria-hidden>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="border-t border-subtle pt-2">
          <Skeleton className="skeleton-shimmer h-4 w-6 rounded" />
          <Skeleton className="skeleton-shimmer mt-1.5 h-3 w-8 rounded" />
          <Skeleton className="skeleton-shimmer mt-1 h-3 w-10 rounded" />
        </div>
      ))}
    </div>
  );
}
