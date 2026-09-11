import { useRegisterApexScope } from "@/components/apex/ApexScopeProvider";
import Link from "next/link";
import { AnalysisWorkspace } from "./AnalysisWorkspace";
import { ChampionshipStandings } from "./ChampionshipStandings";
import { SeasonCalendar } from "./SeasonCalendar";
import { SeasonStory } from "./SeasonStory";
import { SeasonAtAGlance } from "./SeasonAtAGlance";
import { WhatChangedRecently } from "./WhatChangedRecently";
import { SeasonIntelligenceProvider } from "./ai/SeasonIntelligenceProvider";
import { useMemo } from "react";

/** Fast, non-cryptographic string hash for client-side cache keys */
const cyrb53 = (str: string, seed = 0) => {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
};

function generateContextHash(obj: unknown): string {
  return cyrb53(JSON.stringify(obj)).toString(36);
}
import { SeasonExplorerProvider } from "../_context/SeasonExplorerContext";
import type { Battle, ConstructorStandingRow, DriverStandingRow, RaceSummary, SeasonRecord } from "../_service/season.service";

/** The one season-detail experience — Season and Archive both render this exact component, never
 * their own copies. The only thing that changes between them is which data getSeasonDetailData
 * picked (live FastF1 vs. archive_races) and this component's own `status`/`backHref` props; the
 * standings table, analysis workspace, and calendar are all literally shared, not reimplemented. */
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
  // The favorite driver (if any) is the sensible default Compare selection, per the "subtle
  // personalization" rule — it changes a default, it doesn't build a whole section of its own.
  // Checks every favorite driver in standings order (not just favoriteDriverIds[0]) so someone
  // with several favorites still gets whichever one is actually ahead in the standings, not an
  // arbitrary "first one saved".
  const favoriteDriver = drivers.find((d) => d.favoriteId && favoriteDriverIds.includes(d.favoriteId));
  const defaultA = favoriteDriver ?? drivers[0];
  const defaultAIndex = defaultA ? drivers.indexOf(defaultA) : -1;
  // A favorite TEAM's own top driver is a better default B than "whoever's adjacent in the
  // standings" when the favorite driver picked for A already belongs to that team (comparing a
  // driver against their own teammate is a weaker default than against a team you actually follow).
  // Matched via each constructor row's own real favoriteId (archiveSlugForCurrentTeam), not a
  // guessed slug transform of the team name.
  const favoriteTeam = constructors.find((c) => favoriteTeamIds.includes(c.favoriteId) && c.team !== defaultA?.team);
  const favoriteTeamDriver = favoriteTeam ? drivers.find((d) => d.team === favoriteTeam.team) : undefined;
  const defaultB = favoriteTeamDriver ?? drivers[defaultAIndex === 0 ? 1 : Math.max(defaultAIndex - 1, 0)];
  const currentRound = status === "ongoing" ? raceSummaries.find((r) => r.state === "next") : undefined;

  // Season context for Apex. Standings are trimmed to the top of each table plus the season shape -
  // enough to answer "why is X second" or "who's gained most recently" without shipping the whole
  // progression matrix, which the route would cap away anyway.

  const contextSnapshot = useMemo(
    () => ({
      season: { year, status, racesCompleted, racesRemaining, nextRace: currentRound?.name ?? null },
      driverStandings: drivers.slice(0, 12).map((d, i) => ({ position: i + 1, name: d.driverName, team: d.team, points: d.points, wins: d.wins, podiums: d.podiums })),
      constructorStandings: constructors.slice(0, 10).map((c, i) => ({ position: i + 1, name: c.team, points: c.points, wins: c.wins })),
      battles: battles.slice(0, 5),
      records: records.slice(0, 8),
      recentRaces: raceSummaries.filter((r) => r.state === "completed").slice(-5).map((r) => ({ name: r.name, round: r.round })),
    }),
    [year, status, racesCompleted, racesRemaining, currentRound, drivers, constructors, battles, records, raceSummaries],
  );

  const contextJson = useMemo(() => JSON.stringify(contextSnapshot), [contextSnapshot]);
  const contextHash = useMemo(() => generateContextHash(contextSnapshot), [contextSnapshot]);
  const validIds = useMemo(() => [
    ...drivers.map(d => d.driver),
    ...constructors.map(c => c.team),
    ...battles.map(b => `${b.aId}-vs-${b.bId}`), // IDs for battles could just be string concats, wait, schema is arbitrary. Let's just pass all string IDs.
  ], [drivers, constructors, battles]);

  useRegisterApexScope({
    key: `season:${year}`,
    label: `Season ${year}`,
    sublabel: currentRound ? `Next: ${currentRound.name}` : status === "completed" ? "Completed" : undefined,
    suggestions: [
      "Who has gained the most ground recently?",
      "What's the closest championship battle?",
      ...(drivers[1] && drivers[0] ? [`Compare ${drivers[0].driverName} and ${drivers[1].driverName}.`] : []),
    ],
    context: { page: "season", season: year },
  });

  return (
    <SeasonExplorerProvider defaultCompareA={defaultA?.driver ?? ""} defaultCompareB={defaultB?.driver ?? ""}>
      <SeasonIntelligenceProvider contextJson={contextJson} season={year} completedRounds={racesCompleted} validIds={validIds} contextHash={contextHash}>
        <div className="mb-8">
        {backHref && (
          <Link href={backHref} className="mb-2 inline-block text-sm text-neutral-500 transition hover:text-neutral-300">
            ← Archive
          </Link>
        )}
        <h1 className="flex items-baseline gap-3">
          <span className="text-5xl font-bold tracking-tight text-white sm:text-6xl">{year}</span>
          <span className="text-sm font-semibold uppercase tracking-[0.25em] text-neutral-500">Season</span>
        </h1>
        <p className="mt-3 text-sm text-neutral-500">
          {status === "ongoing" ? (
            <>
              <span className="font-medium text-neutral-300">{racesCompleted}</span> round{racesCompleted === 1 ? "" : "s"} complete ·{" "}
              {racesRemaining} remaining
            </>
          ) : (
            <>
              <span className="font-medium text-neutral-300">{racesCompleted}</span> race{racesCompleted === 1 ? "" : "s"} · Season complete
            </>
          )}
        </p>
        {currentRound && (
          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-neutral-500">
            <span className="pulse-ring h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--f1-red)]" />
            Round {currentRound.round} · {currentRound.name}
          </p>
        )}
      </div>

      <div className="mb-8">
          <SeasonStory />
        </div>
        
        <SeasonAtAGlance drivers={drivers} constructors={constructors} races={raceSummaries} battles={battles} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
          <div className="lg:col-span-2">
            <ChampionshipStandings drivers={drivers} constructors={constructors} raceSummaries={raceSummaries} />
          </div>
          <div>
            <WhatChangedRecently drivers={drivers} constructors={constructors} progression={progression} />
          </div>
        </div>

      <div className="mt-8">
        <AnalysisWorkspace battles={battles} records={records} drivers={drivers} constructors={constructors} progression={progression} raceSummaries={raceSummaries} />
      </div>

      <div className="mt-8">
        <SeasonCalendar year={year} drivers={drivers} raceSummaries={raceSummaries} />
      </div>
      </SeasonIntelligenceProvider>
    </SeasonExplorerProvider>
  );
}
