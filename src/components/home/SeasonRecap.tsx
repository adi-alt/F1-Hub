import { ChampionshipTrajectory } from "./ChampionshipTrajectory";
import { SeasonStrip } from "./SeasonStrip";
import { chart } from "@/components/charts/chartTheme";
import { Skeleton } from "@/components/ui/Skeleton";
import type { FavoriteDriverCard, FavoriteTeamCard, SeasonRecap as SeasonRecapData } from "@/lib/personalization";
import type { CalendarEntry } from "@/lib/supabase/calendar";
import type { RaceDoc } from "@/lib/types/race";

// Season Recap is a narrative summary, not a second detailed dashboard - a favorite's full stats/
// form/trajectory live in YourF1's switcher and Track Intelligence instead. Capped so a user with
// many favorites never lets this line dominate the recap.
const MAX_FAVORITES_SHOWN = 3;

function formatFavoriteRanks(ranks: { name: string; rank: number }[]): string | null {
  if (ranks.length === 0) return null;
  const shown = ranks
    .slice(0, MAX_FAVORITES_SHOWN)
    .map((r) => `${r.name} P${r.rank}`)
    .join(" · ");
  const rest = ranks.length - MAX_FAVORITES_SHOWN;
  return rest > 0 ? `${shown} +${rest}` : shown;
}

/** "How the season is unfolding" - narrative + chart, then the round navigator + featured-round
 * card, now composed as ONE section (a single bordered/backdrop shell with an internal divider
 * between the two regions) instead of two independently-treated pieces separated by page-level
 * spacing - see the redesign plan's own "cohesive section, not a collection of widgets" direction.
 * The narrative's `border-l-2` accent bar stays as a text-accent detail inside its own region; the
 * outer shell is what now does the "this is one experience" job. */
export function SeasonRecap({
  year,
  races,
  recap,
  aiNarrative,
  nextRaceRound,
  favoriteDriver,
  favoriteTeam,
  circuitImageByRound,
  calendarEntry,
}: {
  year: number;
  races: RaceDoc[];
  recap: SeasonRecapData;
  aiNarrative?: string | null;
  nextRaceRound?: number | null;
  favoriteDriver: FavoriteDriverCard | null;
  favoriteTeam: FavoriteTeamCard | null;
  circuitImageByRound?: Record<number, string | null>;
  /** Real session-schedule data for the upcoming race, threaded through to SeasonStrip's "this
   * weekend" branch - see that component's own comment on why it's only ever for one round. */
  calendarEntry?: CalendarEntry | null;
}) {
  const driverRanksLine = formatFavoriteRanks(recap.favoriteDriverRanks);
  const teamRanksLine = formatFavoriteRanks(recap.favoriteTeamRanks);

  if (recap.roundsCompleted === 0) {
    return (
      <div>
        <div className="flex items-baseline justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--f1-red)]">
            {year} Season So Far
          </h2>
          <p className="text-xs text-neutral-500">Season preparation</p>
        </div>

        <div className="mt-4 overflow-hidden rounded-2xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/40">
          <div className="p-5 sm:p-6">
            <p className="border-l-2 border-white/10 pl-5 text-sm text-neutral-400 sm:pl-6">
              The season hasn&apos;t started yet. Check back once the first race is completed.
              {aiNarrative && (
                <span className="mt-2 block text-xs text-neutral-300">
                  <span className="font-semibold text-white">Season Outlook: </span>{aiNarrative}
                </span>
              )}
            </p>
          </div>
          <div className="border-t border-white/[0.06] p-5 sm:p-6">
            <SeasonStrip
              races={races}
              nextRaceRound={nextRaceRound}
              favoriteDriver={favoriteDriver}
              favoriteTeam={favoriteTeam}
              circuitImageByRound={circuitImageByRound ?? {}}
              calendarEntry={calendarEntry}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--f1-red)]">
          {year} Season So Far
        </h2>
        <p className="text-xs text-neutral-500">
          Round {recap.roundsCompleted} of {recap.totalRounds}
        </p>
      </div>

      {/* One shared shell for narrative+chart and navigator+featured-card - matching background,
       * one outer border, an internal divider between the two regions instead of a page-level gap
       * (see the internal border-t convention already used inside PredictionIntelligence.tsx /
       * ApexIntelligenceWorkspace.tsx for their own sub-sections). */}
      <div className="mt-4 overflow-hidden rounded-2xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/40">
        <div className="grid gap-6 p-5 sm:grid-cols-2 sm:p-6">
          <div className="space-y-3 border-l-2 border-white/10 pl-5 text-sm sm:pl-6">
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
            {driverRanksLine && (
              <p className="text-neutral-400">
                Your favorite driver{recap.favoriteDriverRanks.length > 1 ? "s" : ""}: {driverRanksLine}
              </p>
            )}
            {teamRanksLine && (
              <p className="text-neutral-400">
                Your favorite team{recap.favoriteTeamRanks.length > 1 ? "s" : ""}: {teamRanksLine}
              </p>
            )}

            {aiNarrative && (
              <div className="mt-4 border-t border-white/[0.06] pt-3">
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--f1-red)]" />
                  <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-500">
                    AI Season Narrative
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-neutral-300">{aiNarrative}</p>
              </div>
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

        <div className="border-t border-white/[0.06] p-5 sm:p-6">
          <SeasonStrip
            races={races}
            nextRaceRound={nextRaceRound}
            favoriteDriver={favoriteDriver}
            favoriteTeam={favoriteTeam}
            circuitImageByRound={circuitImageByRound ?? {}}
            calendarEntry={calendarEntry}
          />
        </div>
      </div>
    </div>
  );
}

export function SeasonRecapSkeleton() {
  return (
    <div>
      <Skeleton className="skeleton-shimmer h-4 w-40 rounded" />
      <div className="mt-4 grid gap-6 border-l-2 border-white/10 pl-5 sm:grid-cols-2 sm:pl-6">
        <div className="space-y-2">
          <Skeleton className="skeleton-shimmer h-4 w-full rounded" />
          <Skeleton className="skeleton-shimmer h-4 w-5/6 rounded" />
          <Skeleton className="skeleton-shimmer h-4 w-2/3 rounded" />
        </div>
        <Skeleton className="skeleton-shimmer h-24 w-full rounded" />
      </div>
    </div>
  );
}
