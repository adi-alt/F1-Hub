"use client";

import { motion } from "framer-motion";
import { RaceSectionCard } from "@/components/raceDetail/RaceSectionCard";
import { useMinuteClock } from "@/hooks/useMinuteClock";
import { formatCountdown, parseUtcDateTime } from "@/lib/countdown";
import { liveSession, nextSession, sessionCode } from "@/lib/sessionCode";
import type { CalendarEntry } from "@/lib/supabase/calendar";

/** The "what's happening this weekend" panel for a race that hasn't finished yet - a countdown to
 * lights-out plus a session-by-session schedule chip row (FP1/FP2/FP3/Q/R, whichever this exact
 * weekend's `eventFormat` actually has), so the page reads as "a living weekend page" instead of
 * silently having nothing until qualifying data shows up. Built entirely from `calendar` (real
 * per-session datetimes sync_calendar.py already writes for every round, completed or not) - no new
 * data source. Caller-gated to non-completed races; a completed race already has its own real
 * RaceHeader dateLabel and doesn't need a schedule reconstructed from scratch. */
export function RaceWeekendPanel({ calendarEntry, id }: { calendarEntry: CalendarEntry | null; id?: string }) {
  const now = useMinuteClock();
  if (!calendarEntry || calendarEntry.sessions.length === 0) return null;

  const raceSessionDate = calendarEntry.sessions.find((s) => sessionCode(s.label) === "R")?.date ?? calendarEntry.raceDate;
  // The countdown corresponds to the next session that's actually still ahead - three days out
  // from a race weekend this counts down to Practice 1, not to a Grand Prix that's still a full
  // weekend away, and it retargets itself session by session as each one passes.
  const upcoming = nextSession(calendarEntry.sessions, now);
  const countdown = upcoming ? formatCountdown(parseUtcDateTime(upcoming.date).getTime(), now) : "";
  // A genuine approximation (this app has no real session-end timestamp - see liveSession's own
  // comment), used only for the "Live" label itself, never for anything a real timestamp
  // comparison already handles correctly (the countdown above, `completed` below).
  const live = liveSession(calendarEntry.sessions, now);
  // Race day has come and gone but the pipeline hasn't posted a completed status/results yet (it
  // runs on a batch schedule, not live - see races.ts's getRace docstring) - an honest "results are
  // coming, not stuck" note rather than a countdown sitting at 0m or silently vanishing.
  const awaitingResults = !!raceSessionDate && !upcoming && parseUtcDateTime(raceSessionDate).getTime() <= now;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} viewport={{ once: true }} whileInView={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: "easeOut" }}>
      <RaceSectionCard id={id} title="Race Weekend" description={awaitingResults ? "Race day has passed - results will appear here once posted." : "Session schedule for this Grand Prix weekend."}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap gap-2">
            {calendarEntry.sessions.map((s) => {
              const completed = parseUtcDateTime(s.date).getTime() <= now;
              const isNext = upcoming?.label === s.label;
              const isLive = live?.label === s.label;
              return (
                <div
                  key={s.label}
                  className={
                    isLive
                      ? "rounded-lg border border-emerald-500/40 bg-emerald-500/[0.1] px-3 py-1.5 text-xs"
                      : isNext
                        ? "rounded-lg border border-[var(--f1-red)]/40 bg-[var(--f1-red)]/[0.08] px-3 py-1.5 text-xs"
                        : `rounded-lg border px-3 py-1.5 text-xs ${completed ? "border-[var(--f1-line)] bg-white/[0.03] text-neutral-500" : "border-[var(--f1-line)] bg-[var(--f1-carbon)] text-neutral-300"}`
                  }
                >
                  {isLive && <span aria-hidden className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 motion-safe:animate-pulse" />}
                  <span className={`font-semibold ${isLive ? "text-emerald-400" : isNext ? "text-[var(--f1-red)]" : completed ? "" : "text-white"}`}>{sessionCode(s.label)}</span>
                  <span className={`ml-1.5 font-mono text-[11px] ${isLive || isNext ? "text-neutral-300" : "text-neutral-500"}`}>
                    {isLive ? "Live now" : parseUtcDateTime(s.date).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}
                  </span>
                </div>
              );
            })}
          </div>
          {live ? (
            <div className="text-right">
              <p className="flex items-center justify-end gap-1.5 text-[11px] uppercase tracking-wide text-emerald-400">
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald-400 motion-safe:animate-pulse" />
                Live now
              </p>
              <p className="text-sm font-semibold text-white">{live.label}</p>
            </div>
          ) : (
            countdown &&
            upcoming && (
              <div className="text-right">
                <p className="text-[11px] uppercase tracking-wide text-neutral-500">{sessionCode(upcoming.label) === "R" ? "Lights out in" : `${upcoming.label} in`}</p>
                <p className="font-mono text-lg font-semibold text-white">{countdown}</p>
              </div>
            )
          )}
        </div>
      </RaceSectionCard>
    </motion.div>
  );
}
