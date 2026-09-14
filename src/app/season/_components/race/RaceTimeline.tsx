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
 * The weekend as an event curve.
 *
 * Horizontal on desktop, where the width exists to show progression as an actual line of nodes,
 * and vertical on phones, where a horizontal rail of five sessions would either overflow or
 * shrink the labels to nothing. Both render from the same ordered data.
 *
 * Fully data-driven, which is what makes sprint weekends work: it draws whatever sessions the
 * calendar actually holds, in real chronological order, so Sprint Qualifying and Sprint appear in
 * sequence rather than being forced into five conventional slots or dropped for not matching them.
 *
 * The rail is solid up to the last completed session and hairline beyond it, so how far through
 * the weekend you are reads without a legend.
 */
export function RaceTimeline({ sessions }: { sessions: RaceSessionSummary[] }) {
  if (sessions.length === 0) {
    return <p className="text-sm text-neutral-500">No session schedule published for this round yet.</p>;
  }

  const ordered = [...sessions].sort((a, b) => parseUtcDateTime(a.date).getTime() - parseUtcDateTime(b.date).getTime());
  const lastCompleted = ordered.reduce((acc, s, i) => (s.state === "completed" ? i : acc), -1);
  const progressPct = ordered.length > 1 ? Math.max(0, lastCompleted) / (ordered.length - 1) : 0;

  return (
    <>
      {/* ── Desktop: horizontal event curve ───────────────────────────────── */}
      <ol className="relative hidden md:flex md:items-start md:justify-between">
        {/* One rail behind every node, with the completed portion overlaid. Insetting it by half a
            node keeps it from protruding past the first and last dots. */}
        <span aria-hidden className="absolute left-[6%] right-[6%] top-[5px] h-px bg-white/[0.1]" />
        <span
          aria-hidden
          className="absolute left-[6%] top-[5px] h-px bg-white/30 transition-[width] duration-500"
          style={{ width: `calc((100% - 12%) * ${progressPct})` }}
        />

        {ordered.map((s) => {
          const kind = sessionKind(s.code);
          const color = KIND_COLOR[kind];
          const date = parseUtcDateTime(s.date);
          const done = s.state === "completed";
          const current = s.state === "current";

          return (
            <li key={`${s.label}-${s.date}`} className="relative flex min-w-0 flex-1 flex-col items-center px-1 text-center">
              <span
                aria-hidden
                className={`mb-2.5 block h-[11px] w-[11px] shrink-0 rounded-full ${current ? "pulse-ring" : ""}`}
                style={done || current ? { background: color } : { border: `1px solid ${color}`, background: "var(--background)" }}
              />
              <span className={`w-full truncate text-[11px] font-medium ${done || current ? "text-white" : "text-neutral-400"}`}>{s.label}</span>
              <time dateTime={date.toISOString()} className="mt-0.5 w-full truncate font-mono text-[10px] tabular-nums text-neutral-500">
                {date.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </time>
              {current && <span className="mt-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--f1-red)]">Next up</span>}
              {s.result && (
                <span className="mt-1 w-full truncate text-[10px] text-neutral-500" title={`${s.result.label}: ${s.result.value}`}>
                  {s.result.value}
                </span>
              )}
              {!s.result && !current && <span className="mt-1 text-[10px] text-neutral-600">{done ? "Completed" : "Upcoming"}</span>}
            </li>
          );
        })}
      </ol>

      {/* ── Mobile: the same data, stacked ────────────────────────────────── */}
      <ol className="relative ml-[5px] border-l border-white/[0.08] md:hidden">
        {ordered.map((s, i) => {
          const kind = sessionKind(s.code);
          const color = KIND_COLOR[kind];
          const date = parseUtcDateTime(s.date);
          const done = s.state === "completed";
          const current = s.state === "current";

          return (
            <li key={`${s.label}-${s.date}`} className="relative pb-4 pl-5 last:pb-0">
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
    </>
  );
}
