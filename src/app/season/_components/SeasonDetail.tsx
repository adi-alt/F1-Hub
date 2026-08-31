import Link from "next/link";
import { AnalysisWorkspace } from "./AnalysisWorkspace";
import { ChampionshipStandings } from "./ChampionshipStandings";
import { SeasonCalendar } from "./SeasonCalendar";
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
}: {
  year: number;
  status: "ongoing" | "completed";
  backHref?: string;
  drivers: DriverStandingRow[];
  constructors: ConstructorStandingRow[];
  progression: Record<string, number | string>[];
  raceSummaries: RaceSummary[];
  racesCompleted: number;
  racesRemaining: number;
  battles: Battle[];
  records: SeasonRecord[];
  favoriteDriverIds: string[];
}) {
  // The favorite driver (if any) is the sensible default Compare selection, per the "subtle
  // personalization" rule — it changes a default, it doesn't build a whole section of its own.
  const favoriteDriver = drivers.find((d) => d.favoriteId && favoriteDriverIds.includes(d.favoriteId));
  const defaultA = favoriteDriver ?? drivers[0];
  const defaultAIndex = defaultA ? drivers.indexOf(defaultA) : -1;
  const defaultB = drivers[defaultAIndex === 0 ? 1 : Math.max(defaultAIndex - 1, 0)];
  const currentRound = status === "ongoing" ? raceSummaries.find((r) => r.state === "next") : undefined;

  return (
    <SeasonExplorerProvider defaultCompareA={defaultA?.driver ?? ""} defaultCompareB={defaultB?.driver ?? ""}>
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

      <ChampionshipStandings drivers={drivers} constructors={constructors} raceSummaries={raceSummaries} />

      <div className="mt-8">
        <AnalysisWorkspace battles={battles} records={records} drivers={drivers} constructors={constructors} progression={progression} raceSummaries={raceSummaries} />
      </div>

      <div className="mt-8">
        <SeasonCalendar year={year} drivers={drivers} raceSummaries={raceSummaries} />
      </div>
    </SeasonExplorerProvider>
  );
}
