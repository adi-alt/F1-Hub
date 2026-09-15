// Deliberately NOT "use client" - buildEraSegments/EraSegment are plain data transformation, no
// React, no browser API, called from server code (archive/page.tsx's ArchiveDriverHistory) as an
// ordinary function. This used to live inside ArchiveEraTimeline.tsx, which IS "use client" - that
// made buildEraSegments a client reference too, since a "use client" directive applies to every
// export of the module, not just the component that actually needs it. Calling a client reference
// as a plain function from the server throws "Attempted to call buildEraSegments() from the server
// but buildEraSegments is on the client" - confirmed live, in production (a real next build enforces
// this boundary; next dev's own Turbopack pipeline did not, which is why this never surfaced
// locally). Splitting the pure function out into its own non-"use client" module is the fix, not
// computing this client-side instead - it's real server-rendered content, not client-only state.

export type EraSegment = { from: number; to: number; label: string; raceCount: number };

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
