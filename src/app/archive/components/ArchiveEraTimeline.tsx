"use client";

import { useState } from "react";
import { teamColor } from "@/lib/teamColors";

export type EraSegment = { from: number; to: number; label: string; raceCount: number };

/**
 * A driver's real team-by-team history, collapsed into contiguous stints (2001-2002 Minardi,
 * 2003-2006 Renault, 2007 McLaren, ...) and drawn as one proportional segmented bar rather than a
 * list of year-by-year cards - the "represent visually, not as a stack of cards" requirement for
 * this specific shape of data (a small number of real, contiguous ranges, not a long series to
 * plot). Segments are computed by the caller (buildEraSegments below) directly from real per-year
 * results - nothing here invents a grouping.
 */
export function ArchiveEraTimeline({ segments }: { segments: EraSegment[] }) {
  const [active, setActive] = useState<number | null>(null);
  if (segments.length === 0) return null;

  const totalYears = segments.reduce((sum, s) => sum + (s.to - s.from + 1), 0);

  return (
    <div>
      <div className="flex h-8 w-full overflow-hidden rounded-md border border-white/[0.07]">
        {segments.map((s, i) => {
          const span = s.to - s.from + 1;
          const widthPct = (span / totalYears) * 100;
          const color = teamColor(s.label);
          return (
            <button
              key={`${s.label}-${s.from}`}
              type="button"
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              style={{ width: `${widthPct}%`, background: color }}
              className="relative flex min-w-[2px] items-center justify-center border-r border-black/30 text-[10px] font-semibold text-white last:border-r-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white"
              aria-label={`${s.label}, ${s.from === s.to ? s.from : `${s.from} to ${s.to}`}, ${s.raceCount} race${s.raceCount === 1 ? "" : "s"}`}
            >
              {widthPct > 10 && <span className="truncate px-1">{s.label}</span>}
            </button>
          );
        })}
      </div>
      <div className="mt-2 min-h-[18px] text-xs text-neutral-400">
        {active !== null ? (
          <span>
            <span className="font-medium text-white">{segments[active].label}</span> · {segments[active].from === segments[active].to ? segments[active].from : `${segments[active].from}–${segments[active].to}`} ·{" "}
            {segments[active].raceCount} race{segments[active].raceCount === 1 ? "" : "s"}
          </span>
        ) : (
          <span className="text-neutral-600">Hover a segment for details</span>
        )}
      </div>
    </div>
  );
}

/** Collapses a real year -> label series (a driver's own team each season, say) into contiguous
 * runs - "2003, 2004, 2005 all Renault" becomes one 2003-2005 segment, not three. Skips years with
 * no real label (a gap season) rather than inventing a continuation across it. */
export function buildEraSegments(yearLabels: { year: number; label: string; raceCount: number }[]): EraSegment[] {
  const sorted = [...yearLabels].sort((a, b) => a.year - b.year);
  const segments: EraSegment[] = [];
  for (const { year, label, raceCount } of sorted) {
    const last = segments[segments.length - 1];
    if (last && last.label === label && last.to === year - 1) {
      last.to = year;
      last.raceCount += raceCount;
    } else {
      segments.push({ from: year, to: year, label, raceCount });
    }
  }
  return segments;
}
