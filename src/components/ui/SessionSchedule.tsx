import { Check } from "lucide-react";
import { Icon } from "./Icon";

export type SessionState = "done" | "next" | "upcoming";

export type ScheduleSession = {
  /** The short code: "P1", "Q", "R". */
  code: string;
  /** The day and time already formatted in the viewer's zone, as two lines: ["Fri", "6:30 AM"]. */
  when: [day: string, time: string];
  state: SessionState;
};

/**
 * A race weekend's sessions as one equal-width row (design system spec, DS-19): the code, the day and the
 * time for each. A finished session is a check mark, the next one a red dot and "Next", the rest are
 * plain. State never relies on colour alone, and there is only ever one red element in the row.
 *
 * Equal columns that can shrink (minmax(0, 1fr)) with the day and time stacked, so five sessions fit a
 * 320px screen without scrolling sideways. The zone is named once under the row ("Times in IST"), not on
 * every cell, which is what made the old row too wide.
 */
export function SessionSchedule({ sessions, zoneLabel, className }: { sessions: ScheduleSession[]; zoneLabel?: string; className?: string }) {
  if (sessions.length === 0) return null;
  return (
    <div className={className}>
      <ol role="list" aria-label="Race weekend sessions" className="grid gap-1" style={{ gridTemplateColumns: `repeat(${sessions.length}, minmax(0, 1fr))` }}>
        {sessions.map((s) => (
          <li key={s.code} className={`min-w-0 border-t pt-2 ${s.state === "next" ? "border-[var(--f1-red)]" : "border-subtle"}`}>
            <p className="flex items-center gap-1 text-body-sm font-semibold text-primary">
              {s.state === "done" && <Icon icon={Check} size={16} className="text-secondary" />}
              {s.state === "next" && <span aria-hidden className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--f1-red)]" />}
              {s.code}
              {s.state === "done" && <span className="sr-only"> (done)</span>}
              {s.state === "next" && <span className="sr-only"> (next)</span>}
            </p>
            <p className="mt-0.5 text-caption text-secondary">{s.when[0]}</p>
            <p className="text-caption tabular-nums text-secondary">{s.when[1]}</p>
          </li>
        ))}
      </ol>
      {zoneLabel && <p className="mt-2 text-caption text-tertiary">Times in {zoneLabel}</p>}
    </div>
  );
}
