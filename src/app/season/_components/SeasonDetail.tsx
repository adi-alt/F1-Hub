"use client";

import { useMemo } from "react";
import Link from "next/link";
import { AnalysisWorkspace } from "./AnalysisWorkspace";
import { ChampionshipStandings } from "./ChampionshipStandings";
import { SeasonCalendar } from "./SeasonCalendar";
import { SeasonSnapshot } from "./SeasonSnapshot";
import { WhatChangedRecently } from "./WhatChangedRecently";
import { RaceQuickView } from "./race/RaceQuickView";
import { ApexSeasonTake } from "./ai/ApexSeasonTake";
import { SeasonIntelligenceProvider } from "./ai/SeasonIntelligenceProvider";
import { SeasonApexScope } from "./ai/SeasonApexScope";
import { SeasonExplorerProvider } from "../_context/SeasonExplorerContext";
import {
  buildPersonalSeasonContext,
  buildSeasonSnapshot,
  type Battle,
  type ConstructorStandingRow,
  type DriverStandingRow,
  type RaceSummary,
  type SeasonRecord,
} from "../_service/season.pure";

/** The one season-detail experience — Season and Archive both render this exact component, never
 * their own copies. The only thing that changes between them is which data getSeasonDetailData
 * picked (live FastF1 vs. archive_races) and this component's own `status`/`backHref` props. */
export function SeasonDetail({
  year,
  status,
  backHref,
  drivers,
  constructors,
  progression,
  raceSummaries,
  racesCompleted,
  racesRemaining,
  battles,
  records,
  favoriteDriverIds,
  favoriteTeamIds = [],
}: {
  year: number;
  status: "ongoing" | "completed";
  backHref?: string;
  drivers: DriverStandingRow[];
  constructors: ConstructorStandingRow[];
  progression: Record<string, number | string | null>[];
  raceSummaries: RaceSummary[];
  racesCompleted: number;
  racesRemaining: number;
  battles: Battle[];
  records: SeasonRecord[];
  favoriteDriverIds: string[];
  favoriteTeamIds?: string[];
}) {
  // Personalization is computed here, once, from data the page already has - and it is the ONLY
  // thing favorites affect. The season narrative below stays shared and stays cached once for
  // everyone; having a favorite driver never triggers a second model call.
  const personal = useMemo(
    () => buildPersonalSeasonContext(favoriteDriverIds, favoriteTeamIds, drivers, constructors, raceSummaries, progression),
    [favoriteDriverIds, favoriteTeamIds, drivers, constructors, raceSummaries, progression],
  );

  const snapshot = useMemo(() => buildSeasonSnapshot(drivers, raceSummaries, battles), [drivers, raceSummaries, battles]);

  // A favorite driver is the sensible default Compare selection - a personalized default, not a
  // personalized section. Checks every favorite in standings order rather than whichever was
  // saved first, so someone following several gets the one actually ahead.
  const favoriteDriver = drivers.find((d) => d.favoriteId && favoriteDriverIds.includes(d.favoriteId));
  const defaultA = favoriteDriver ?? drivers[0];
  const defaultAIndex = defaultA ? drivers.indexOf(defaultA) : -1;
  // A favorite TEAM's own lead driver beats "whoever is adjacent in the standings" as a default
  // opponent, since comparing someone against their own teammate is a weaker default.
  const favoriteTeam = constructors.find((c) => favoriteTeamIds.includes(c.favoriteId) && c.team !== defaultA?.team);
  const favoriteTeamDriver = favoriteTeam ? drivers.find((d) => d.team === favoriteTeam.team) : undefined;
  const defaultB = favoriteTeamDriver ?? drivers[defaultAIndex === 0 ? 1 : Math.max(defaultAIndex - 1, 0)];

  // The constructors' table gets its own default pair: the top two teams, or a favorite team
  // against the leader when the reader follows one.
  const favoriteTeamRow = constructors.find((c) => favoriteTeamIds.includes(c.favoriteId));
  const teamA = favoriteTeamRow ?? constructors[0];
  const teamAIndex = teamA ? constructors.indexOf(teamA) : -1;
  const teamB = constructors[teamAIndex === 0 ? 1 : Math.max(teamAIndex - 1, 0)];

  const defaultCompare = useMemo(
    () => ({
      drivers: { a: defaultA?.driver ?? "", b: defaultB?.driver ?? "" },
      constructors: { a: teamA?.team ?? "", b: teamB?.team ?? "" },
    }),
    [defaultA?.driver, defaultB?.driver, teamA?.team, teamB?.team],
  );

  const currentRound = status === "ongoing" ? raceSummaries.find((r) => r.state === "next") : undefined;
  const progressPct = racesCompleted + racesRemaining > 0 ? (racesCompleted / (racesCompleted + racesRemaining)) * 100 : 0;

  return (
    <SeasonExplorerProvider defaultCompare={defaultCompare}>
      {/* Season sends only the year. Everything the model sees is fetched server-side from the
          same authoritative source this page renders from. */}
      <SeasonIntelligenceProvider season={year}>
        <SeasonApexScope season={year} />

        {/* ── Identity ─────────────────────────────────────────────────────────
            The page's masthead, not another dashboard component: the year, how far through the
            season it is, and what's next, tied together by one hairline progress rule rather than
            stacked in separate boxes. */}
        <header className="mb-8">
          {backHref && (
            <Link href={backHref} className="mb-3 inline-block text-xs text-neutral-500 transition hover:text-neutral-300">
              ← Archive
            </Link>
          )}

          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
            <h1 className="flex items-baseline gap-3">
              <span className="text-[44px] font-bold leading-none tracking-[-0.03em] text-white sm:text-6xl">{year}</span>
              <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-neutral-500">Season</span>
            </h1>

            {currentRound && (
              <p className="flex items-center gap-2 text-xs text-neutral-400">
                <span aria-hidden className="pulse-ring h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--f1-red)]" />
                <span className="text-neutral-500">Next</span>
                <span className="font-medium text-neutral-200">
                  R{currentRound.round} · {currentRound.name}
                </span>
              </p>
            )}
          </div>

          <div className="mt-4 flex items-center gap-3">
            <div aria-hidden className="h-px flex-1 bg-white/[0.07]">
              <div className="h-px bg-[var(--f1-red)]/60" style={{ width: `${progressPct}%` }} />
            </div>
            <p className="shrink-0 text-[11px] tabular-nums text-neutral-500">
              {status === "ongoing" ? (
                <>
                  <span className="font-medium text-neutral-300">{racesCompleted}</span> of {racesCompleted + racesRemaining} rounds complete
                </>
              ) : (
                <>
                  <span className="font-medium text-neutral-300">{racesCompleted}</span> rounds · season complete
                </>
              )}
            </p>
          </div>
        </header>

        <ApexSeasonTake personal={personal} />

        <SeasonSnapshot items={snapshot} personal={personal} />

        {/* ── Standings + what changed ─────────────────────────────────────────
            The two columns share ONE declared row height and each fills it, scrolling internally.
            That is what makes their bottom edges line up exactly, and it holds regardless of which
            championship tab is active, how many rows a search leaves, or how tall the viewport is -
            none of which a "tallest child wins" stretch could guarantee. No padding is added to
            fake the match; the space is real and both components use it.
            `lg:grid-rows-[1fr]` alongside the height, not just the height alone: a single
            `auto`-sized grid row DOES stretch to absorb a definite container height per spec, but
            that's a secondary "leftover space" behaviour, not what actually sizes the row - stating
            the row track itself as `1fr` makes the fill the primary, unambiguous rule instead of
            leaning on that fallback.
            Height applies only from `lg`, where they sit side by side. Stacked on smaller screens
            they size to their own content, because matching heights in a single column is
            meaningless. */}
        <div className="mb-8 grid grid-cols-1 items-stretch gap-8 lg:h-[34rem] lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:grid-rows-[1fr] lg:gap-10">
          <div className="flex min-h-0 min-w-0 flex-col">
            <ChampionshipStandings drivers={drivers} constructors={constructors} raceSummaries={raceSummaries} personal={personal} />
          </div>
          <div className="flex min-h-0 min-w-0 flex-col">
            <WhatChangedRecently
              drivers={drivers}
              constructors={constructors}
              raceSummaries={raceSummaries}
              progression={progression}
              personal={personal}
            />
          </div>
        </div>

        <div className="mb-8">
          <AnalysisWorkspace
            season={year}
            battles={battles}
            records={records}
            drivers={drivers}
            constructors={constructors}
            progression={progression}
            raceSummaries={raceSummaries}
            personal={personal}
          />
        </div>

        <SeasonCalendar year={year} drivers={drivers} raceSummaries={raceSummaries} />

        {/* Rendered once, driven by the route. Mounted here (not inside the calendar) so a race can
            be opened from anywhere on the page, and so a direct link with ?race= opens it without
            the calendar needing to be involved at all. */}
        <RaceQuickView season={year} raceSummaries={raceSummaries} drivers={drivers} />
      </SeasonIntelligenceProvider>
    </SeasonExplorerProvider>
  );
}
