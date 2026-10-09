"use client";

import { useMemo } from "react";
import { Reveal } from "@/components/motion/Reveal";
import { ChampionshipBattle } from "./v2/ChampionshipBattle";
import { RaceTimeline } from "./v2/RaceTimeline";
import { SeasonInsights } from "./v2/SeasonInsights";
import { SeasonOverview } from "./v2/SeasonOverview";
import { AnalysisWorkspace } from "./AnalysisWorkspace";
import { ChampionshipStandings } from "./ChampionshipStandings";
import { RaceQuickView } from "./race/RaceQuickView";
import {
  SeasonIntelligenceProvider,
  SeasonIntelligenceTrigger,
} from "./ai/SeasonIntelligenceProvider";
import { SeasonApexScope } from "./ai/SeasonApexScope";
import { SeasonExplorerProvider } from "../_context/SeasonExplorerContext";
import {
  buildPersonalSeasonContext,
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
    () =>
      buildPersonalSeasonContext(
        favoriteDriverIds,
        favoriteTeamIds,
        drivers,
        constructors,
        raceSummaries,
        progression,
      ),
    [
      favoriteDriverIds,
      favoriteTeamIds,
      drivers,
      constructors,
      raceSummaries,
      progression,
    ],
  );

  // A favorite driver is the sensible default Compare selection - a personalized default, not a
  // personalized section. Checks every favorite in standings order rather than whichever was
  // saved first, so someone following several gets the one actually ahead.
  const favoriteDriver = drivers.find(
    (d) => d.favoriteId && favoriteDriverIds.includes(d.favoriteId),
  );
  const defaultA = favoriteDriver ?? drivers[0];
  const defaultAIndex = defaultA ? drivers.indexOf(defaultA) : -1;
  // A favorite TEAM's own lead driver beats "whoever is adjacent in the standings" as a default
  // opponent, since comparing someone against their own teammate is a weaker default.
  const favoriteTeam = constructors.find(
    (c) => favoriteTeamIds.includes(c.favoriteId) && c.team !== defaultA?.team,
  );
  const favoriteTeamDriver = favoriteTeam
    ? drivers.find((d) => d.team === favoriteTeam.team)
    : undefined;
  const defaultB =
    favoriteTeamDriver ??
    drivers[defaultAIndex === 0 ? 1 : Math.max(defaultAIndex - 1, 0)];

  // The constructors' table gets its own default pair: the top two teams, or a favorite team
  // against the leader when the reader follows one.
  const favoriteTeamRow = constructors.find((c) =>
    favoriteTeamIds.includes(c.favoriteId),
  );
  const teamA = favoriteTeamRow ?? constructors[0];
  const teamAIndex = teamA ? constructors.indexOf(teamA) : -1;
  const teamB =
    constructors[teamAIndex === 0 ? 1 : Math.max(teamAIndex - 1, 0)];

  const defaultCompare = useMemo(
    () => ({
      drivers: { a: defaultA?.driver ?? "", b: defaultB?.driver ?? "" },
      constructors: { a: teamA?.team ?? "", b: teamB?.team ?? "" },
    }),
    [defaultA?.driver, defaultB?.driver, teamA?.team, teamB?.team],
  );

  return (
    <SeasonExplorerProvider defaultCompare={defaultCompare}>
      {/* Season sends only the year. Everything the model sees is fetched server-side from the
          same authoritative source this page renders from. */}
      <SeasonIntelligenceProvider season={year}>
        <SeasonApexScope season={year} />

        {/* The season page owns the championship (the home owns your race weekend): a compact masthead, the
            championship as it has developed, the standings, the season race by race, then evidence-backed form
            and the deeper analysis tools. */}
        <SeasonOverview
          year={year}
          status={status}
          raceSummaries={raceSummaries}
          drivers={drivers}
          backHref={backHref}
        />

        <Reveal className="mb-12">
          <ChampionshipBattle
            raceSummaries={raceSummaries}
            personal={personal}
          />
        </Reveal>

        {/* The standings scroll inside one fixed height from lg, so a long list never pushes the page apart. */}
        <Reveal className="mb-12 flex flex-col lg:h-[36rem]">
          <ChampionshipStandings
            drivers={drivers}
            constructors={constructors}
            raceSummaries={raceSummaries}
            personal={personal}
          />
        </Reveal>

        <Reveal className="mb-12">
          <RaceTimeline year={year} raceSummaries={raceSummaries} />
        </Reveal>

        <Reveal className="mb-12">
          <SeasonInsights year={year} raceSummaries={raceSummaries} />
        </Reveal>

        <Reveal className="mb-8">
          <SeasonIntelligenceTrigger>
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
          </SeasonIntelligenceTrigger>
        </Reveal>

        {/* Rendered once, driven by the route. Mounted here (not inside the calendar) so a race can
            be opened from anywhere on the page, and so a direct link with ?race= opens it without
            the calendar needing to be involved at all. */}
        <RaceQuickView
          season={year}
          raceSummaries={raceSummaries}
          drivers={drivers}
        />
      </SeasonIntelligenceProvider>
    </SeasonExplorerProvider>
  );
}
