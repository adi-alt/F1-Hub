"use client";

import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/Skeleton";
import { sessionCode } from "@/lib/sessionCode";
import type { CalendarEntry } from "@/lib/supabase/calendar";
import type { RaceDoc } from "@/lib/types/race";

type Step = { code: string; done: boolean };

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
      code === "FP1"
        ? !!race?.practice?.FP1
        : code === "FP2"
          ? !!race?.practice?.FP2
          : code === "FP3"
            ? !!race?.practice?.FP3
            : code === "Q" || code === "SQ"
              ? !!race?.inputs?.length
              : code === "R" || code === "SR"
                ? race?.status === "completed" && !!race?.results?.length
                : false;
    return { code, done };
  });
}

export function RaceReadiness({ calendarEntry, race }: { calendarEntry: CalendarEntry | null; race: RaceDoc | null }) {
  const steps = buildSteps(calendarEntry, race);
  if (steps.length === 0) return null;

  const lastDoneIndex = steps.reduce((acc, s, i) => (s.done ? i : acc), -1);

  return (
    <div className="flex items-center gap-0" role="list" aria-label="Race weekend progress">
      {steps.map((step, i) => (
        <div key={step.code} className="flex items-center" role="listitem">
          <div className="flex flex-col items-center gap-1.5">
            <motion.span
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.3, delay: i * 0.05, ease: "easeOut" }}
              className={`flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-bold ${
                step.done ? "border-[var(--f1-red)] bg-[var(--f1-red)] text-white" : "border-[var(--f1-line)] bg-black/30 text-transparent"
              }`}
            >
              {step.done ? "✓" : ""}
            </motion.span>
            <span className={`text-[10px] font-semibold tracking-wide ${step.done ? "text-neutral-300" : "text-neutral-600"}`}>{step.code}</span>
          </div>
          {i < steps.length - 1 && (
            <div className="mx-1.5 mb-4 h-px w-6 bg-[var(--f1-line)] sm:w-10">
              <motion.div
                className="h-full bg-[var(--f1-red)]"
                initial={{ width: 0 }}
                animate={{ width: i <= lastDoneIndex ? "100%" : "0%" }}
                transition={{ duration: 0.4, ease: "easeOut" }}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function RaceReadinessSkeleton() {
  return (
    <div className="flex items-center gap-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="skeleton-shimmer h-5 w-5 rounded-full" />
      ))}
    </div>
  );
}
