"use client";

import { parseUtcDateTime } from "@/lib/countdown";
import { sessionKind, type RaceSessionSummary, type SessionKind } from "../../_service/season.pure";

const KIND_COLOR: Record<SessionKind, string> = {
  practice: "#3987e5",
  qualifying: "#8b5cf6",
  sprint: "#eab308",
  race: "var(--f1-red)",
};

/**
 * The weekend as a vertical event curve rather than a flat list.
 *
 * Fully data-driven, which is what makes sprint weekends work: it renders whatever sessions the
 * calendar actually contains, in real chronological order, so a sprint weekend's Sprint Qualifying
 * and Sprint appear naturally in sequence instead of being forced into five conventional slots
 * (or dropped for not matching them).
 *
 * Progression is carried by the rail itself — it's solid through completed sessions and hairline
 * beyond the current one, so how far into the weekend you are reads without a legend.
 */
export function RaceTimeline({ sessions }: { sessions: RaceSessionSummary[] }) {
  if (sessions.length === 0) return <p className="text-sm text-neutral-500">No session schedule published for this round yet.</p>;

  const ordered = [...sessions].sort((a, b) => parseUtcDateTime(a.date).getTime() - parseUtcDateTime(b.date).getTime());
  const lastCompleted = ordered.reduce((acc, s, i) => (s.state === "completed" ? i : acc), -1);

  return (
    <ol className="relative ml-[5px] border-l border-white/[0.08]">
      {ordered.map((s, i) => {
        const kind = sessionKind(s.code);
        const color = KIND_COLOR[kind];
        const date = parseUtcDateTime(s.date);
        const done = s.state === "completed";
        const current = s.state === "current";

        return (
          <li key={`${s.label}-${s.date}`} className="relative pb-4 pl-5 last:pb-0">
            {/* The solid segment of the rail stops at the last completed session. */}
            {i <= lastCompleted && <span aria-hidden className="absolute -left-px bottom-0 top-0 w-px bg-white/25" />}

            <span
              aria-hidden
              className={`absolute -left-[5px] top-[3px] h-[9px] w-[9px] rounded-full ${current ? "pulse-ring" : ""}`}
              style={done || current ? { background: color } : { border: `1px solid ${color}`, background: "var(--background)" }}
            />

            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <p className={`text-sm font-medium ${done || current ? "text-white" : "text-neutral-400"}`}>
                {s.label}
                {current && <span className="ml-2 align-middle text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--f1-red)]">Next up</span>}
              </p>
              <time dateTime={date.toISOString()} className="font-mono text-[11px] tabular-nums text-neutral-500">
                {/* Rendered in the reader's own timezone from a correctly-parsed UTC instant —
                    parseUtcDateTime is what stops a naive pipeline string being read as local. */}
                {date.toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </time>
            </div>

            {s.result && (
              <p className="mt-0.5 text-[11px] text-neutral-500">
                <span className="text-neutral-600">{s.result.label}:</span> <span className="text-neutral-300">{s.result.value}</span>
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
