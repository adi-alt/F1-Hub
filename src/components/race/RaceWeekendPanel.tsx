"use client";

import { motion } from "framer-motion";
import { RaceSectionCard } from "@/components/raceDetail/RaceSectionCard";
import { useMinuteClock } from "@/hooks/useMinuteClock";
import { sessionCode } from "@/lib/sessionCode";
import type { CalendarEntry } from "@/lib/supabase/calendar";

function formatCountdown(targetMs: number, nowMs: number): string {
  const diff = targetMs - nowMs;
  if (diff <= 0) return "";
  const totalMinutes = Math.floor(diff / 60_000);
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/** The "what's happening this weekend" panel for a race that hasn't finished yet - a countdown to
 * lights-out plus a session-by-session schedule chip row (FP1/FP2/FP3/Q/R, whichever this exact
 * weekend's `eventFormat` actually has), so the page reads as "a living weekend page" instead of
 * silently having nothing until qualifying data shows up. Built entirely from `calendar` (real
 * per-session datetimes sync_calendar.py already writes for every round, completed or not) - no new
 * data source. Caller-gated to non-completed races; a completed race already has its own real
 * RaceHeader dateLabel and doesn't need a schedule reconstructed from scratch. */
export function RaceWeekendPanel({ calendarEntry }: { calendarEntry: CalendarEntry | null }) {
  const now = useMinuteClock();
  if (!calendarEntry || calendarEntry.sessions.length === 0) return null;

  const raceSessionDate = calendarEntry.sessions.find((s) => sessionCode(s.label) === "R")?.date ?? calendarEntry.raceDate;
  const countdown = raceSessionDate ? formatCountdown(new Date(raceSessionDate).getTime(), now) : "";
  // Race day has come and gone but the pipeline hasn't posted a completed status/results yet (it
  // runs on a batch schedule, not live - see races.ts's getRace docstring) - an honest "results are
  // coming, not stuck" note rather than a countdown sitting at 0m or silently vanishing.
  const awaitingResults = !!raceSessionDate && !countdown && new Date(raceSessionDate).getTime() <= now;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.3, ease: "easeOut" }}>
      <RaceSectionCard title="Race Weekend" description={awaitingResults ? "Race day has passed - results will appear here once posted." : "Session schedule for this Grand Prix weekend."}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap gap-2">
            {calendarEntry.sessions.map((s) => {
              const completed = new Date(s.date).getTime() <= now;
              return (
                <div
                  key={s.label}
                  className={`rounded-lg border px-3 py-1.5 text-xs ${completed ? "border-[var(--f1-line)] bg-white/[0.03] text-neutral-500" : "border-[var(--f1-line)] bg-[var(--f1-carbon)] text-neutral-300"}`}
                >
                  <span className={`font-semibold ${completed ? "" : "text-white"}`}>{sessionCode(s.label)}</span>
                  <span className="ml-1.5 font-mono text-[11px] text-neutral-500">
                    {new Date(s.date).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}
                  </span>
                </div>
              );
            })}
          </div>
          {countdown && (
            <div className="text-right">
              <p className="text-[11px] uppercase tracking-wide text-neutral-500">Lights out in</p>
              <p className="font-mono text-lg font-semibold text-white">{countdown}</p>
            </div>
          )}
        </div>
      </RaceSectionCard>
    </motion.div>
  );
}
