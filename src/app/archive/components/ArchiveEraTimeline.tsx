"use client";

import { useState } from "react";
import { teamColor } from "@/lib/teamColors";
import type { EraSegment } from "./eraSegments";

export type { EraSegment };

/**
 * A driver's team-by-team history, collapsed into contiguous stints (2007-2012 McLaren, 2013-2024 Mercedes, ...): one
 * thin proportional bar in the teams' colours, and every stint written out beneath it with its years and races, so
 * the story reads without hovering. Hovering a stint in either place picks it out in the other; nothing is hidden behind the hover. Segments
 * are computed by the caller (buildEraSegments, in ./eraSegments.ts - not this file, since this file is "use client"
 * and buildEraSegments is called from server code in archive/page.tsx) from real per-race results.
 */
export function ArchiveEraTimeline({ segments }: { segments: EraSegment[] }) {
  const [active, setActive] = useState<number | null>(null);
  if (segments.length === 0) return null;

  const totalYears = segments.reduce((sum, s) => sum + (s.to - s.from + 1), 0);
  const years = (s: EraSegment) => (s.from === s.to ? `${s.from}` : `${s.from}–${s.to}`);
  const hover = (i: number) => ({ onMouseEnter: () => setActive(i), onMouseLeave: () => setActive(null) });

  return (
    <div>
      <div aria-hidden className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full">
        {segments.map((s, i) => (
          <span
            key={`${s.label}-${s.from}`}
            {...hover(i)}
            className="min-w-0.5 transition-opacity duration-fast"
            style={{ width: `${((s.to - s.from + 1) / totalYears) * 100}%`, background: teamColor(s.label), opacity: active === null || active === i ? 1 : 0.3 }}
          />
        ))}
      </div>
      <ol className="mt-4 flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:gap-x-6">
        {segments.map((s, i) => (
          <li
            key={`${s.label}-${s.from}`}
            {...hover(i)}
            className={`flex items-center gap-3 rounded-control px-2 py-1.5 transition-colors duration-fast ${active === i ? "bg-white/[0.04]" : ""}`}
          >
            <span aria-hidden className="h-4 w-1 shrink-0 rounded-full" style={{ background: teamColor(s.label) }} />
            <span className="min-w-0 flex-1 truncate text-body-sm font-medium text-primary sm:flex-none">{s.label}</span>
            <span className="shrink-0 font-mono text-caption tabular text-tertiary">
              {years(s)} · {s.raceCount} race{s.raceCount === 1 ? "" : "s"}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
