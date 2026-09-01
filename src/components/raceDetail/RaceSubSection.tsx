import type { ReactNode } from "react";

/** A third hierarchy level, inside a RaceSectionCard - "Session Analysis" groups Practice/
 * Qualifying/Strategy under one module instead of three separate ones, each still needing its own
 * clear sub-heading and a divider from its neighbor. Matches the 4-level model: page background ->
 * major surfaces (RaceSectionCard, the Season table's own border+fill treatment) -> inset surfaces
 * (StatTiles/podium/practice cards) -> compact rows (RaceResultsTable). This is the connective
 * tissue between the second and third levels, not a new visual language - `--f1-line` for the
 * divider matches every other divider on the page (RaceResultsTable, ChampionshipStandings). */
export function RaceSubSection({ label, description, first, children }: { label: string; description?: string; first?: boolean; children: ReactNode }) {
  return (
    <div className={first ? "" : "mt-8 border-t border-[var(--f1-line)] pt-8"}>
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">{label}</p>
      {description && <p className="mt-1 text-sm text-neutral-500">{description}</p>}
      <div className="mt-3">{children}</div>
    </div>
  );
}
