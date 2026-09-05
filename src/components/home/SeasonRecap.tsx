import { ChampionshipTrajectory } from "./ChampionshipTrajectory";
import { SeasonStrip } from "./SeasonStrip";
import { chart } from "@/components/charts/chartTheme";
import { Skeleton } from "@/components/ui/Skeleton";
import type { SeasonRecap as SeasonRecapData } from "@/lib/personalization";
import type { RaceDoc } from "@/lib/types/race";

/** "How the season is unfolding" — a real editorial recap (buildSeasonRecap: rounds completed,
 * leader/gap, closest title fight, most wins/podiums), plus a compact trajectory of the title
 * fight itself and the full-season calendar strip below it. The season's own closing beat in the
 * homepage narrative, not just another card. */
export function SeasonRecap({ year, races, recap }: { year: number; races: RaceDoc[]; recap: SeasonRecapData }) {
  if (recap.roundsCompleted === 0) {
    return (
      <div>
        <h2 className="mb-4 text-lg font-semibold text-white">{year} Season</h2>
        <p className="text-sm text-neutral-500">The season hasn&apos;t started yet, check back once the first race is in the books.</p>
        <div className="mt-4">
          <SeasonStrip races={races} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold text-white">{year} Season</h2>
        <p className="text-sm text-neutral-500">
          Round {recap.roundsCompleted} of {recap.totalRounds}
        </p>
      </div>

      <div className="mt-4 rounded-2xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/40 p-5 sm:p-6">
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-3 text-sm">
            {recap.driverLeader && (
              <p className="text-neutral-300">
                <span className="font-semibold text-white">{recap.driverLeader.driverName}</span> leads the drivers&apos; championship with{" "}
                {recap.driverLeader.points} points
                {recap.driverGapToSecond != null && recap.driverGapToSecond > 0 && <>, a {recap.driverGapToSecond}-point gap to P2</>}
                {recap.driverGapToSecond === 0 && <>, tied on points with P2</>}.
              </p>
            )}
            {recap.teamLeader && (
              <p className="text-neutral-300">
                <span className="font-semibold text-white">{recap.teamLeader.team}</span> tops the constructors&apos; standings with {recap.teamLeader.points}{" "}
                points
                {recap.teamGapToSecond != null && recap.teamGapToSecond > 0 && <> ({recap.teamGapToSecond} clear of P2)</>}.
              </p>
            )}
            {recap.mostWins && (
              <p className="text-neutral-400">
                <span className="font-medium text-white">{recap.mostWins.driverName}</span> has the most race wins this season ({recap.mostWins.wins}).
              </p>
            )}
            {recap.mostPodiums && recap.mostPodiums.driver !== recap.mostWins?.driver && (
              <p className="text-neutral-400">
                <span className="font-medium text-white">{recap.mostPodiums.driverName}</span> has the most podiums ({recap.mostPodiums.podiums}).
              </p>
            )}
            {recap.favoriteDriverRank != null && (
              <p className="text-neutral-400">
                Your favorite sits P{recap.favoriteDriverRank} in the championship.
              </p>
            )}
          </div>

          {recap.driverLeader && (
            <div>
              <p className="mb-2.5 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">Championship leader&apos;s trajectory</p>
              <ChampionshipTrajectory
                races={races}
                series={[{ code: recap.driverLeader.driver, label: recap.driverLeader.driverName, color: chart.sequentialBlue }]}
              />
            </div>
          )}
        </div>
      </div>

      <div className="mt-6">
        <SeasonStrip races={races} />
      </div>
    </div>
  );
}

export function SeasonRecapSkeleton() {
  return (
    <div>
      <Skeleton className="skeleton-shimmer h-6 w-40 rounded" />
      <div className="mt-4 rounded-2xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/40 p-5 sm:p-6">
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-2">
            <Skeleton className="skeleton-shimmer h-4 w-full rounded" />
            <Skeleton className="skeleton-shimmer h-4 w-5/6 rounded" />
            <Skeleton className="skeleton-shimmer h-4 w-2/3 rounded" />
          </div>
          <Skeleton className="skeleton-shimmer h-24 w-full rounded" />
        </div>
      </div>
    </div>
  );
}
