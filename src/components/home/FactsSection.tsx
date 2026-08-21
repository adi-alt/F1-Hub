import type { FavoriteDriverCard, FavoriteTeamCard, SeasonStandings, TrackHistory } from "@/lib/personalization";

type Fact = { icon: string; text: string };

/** Every fact here is derived from computeSeasonStandings / getTrackHistory (real
 * race_results/pole_sitter/archive_results data), never invented copy — if there's nothing to
 * compute yet (season hasn't started, no completed races), this renders nothing rather than a
 * placeholder. */
function buildFacts(
  year: number,
  standings: SeasonStandings,
  favoriteDriver: FavoriteDriverCard | null,
  favoriteTeam: FavoriteTeamCard | null,
  trackHistory: TrackHistory | null,
): Fact[] {
  const facts: Fact[] = [];

  const driverLeader = standings.drivers[0];
  if (driverLeader) {
    facts.push({
      icon: "🏆",
      text: `${driverLeader.driverName} leads the ${year} championship with ${driverLeader.points} points`,
    });
  }

  const teamLeader = standings.teams[0];
  if (teamLeader) {
    facts.push({ icon: "🏗️", text: `${teamLeader.team} tops the constructors' standings with ${teamLeader.points} points` });
  }

  const topPole = Object.entries(standings.poleCounts).sort((a, b) => b[1] - a[1])[0];
  if (topPole) {
    const [driverCode, count] = topPole;
    const name = standings.drivers.find((d) => d.driver === driverCode)?.driverName ?? driverCode;
    facts.push({ icon: "🎯", text: `${name} has the most poles this season (${count})` });
  }

  if (favoriteDriver?.code) {
    const rank = standings.drivers.findIndex((d) => d.driver === favoriteDriver.code);
    if (rank >= 0) {
      const s = standings.drivers[rank];
      facts.push({
        icon: "⭐",
        text: `Your favorite, ${favoriteDriver.name}, sits P${rank + 1} in the championship with ${s.points} points`,
      });
    }
  }

  if (favoriteTeam?.currentName) {
    const rank = standings.teams.findIndex((t) => t.team === favoriteTeam.currentName);
    if (rank >= 0) {
      const s = standings.teams[rank];
      facts.push({
        icon: "🔧",
        text: `${favoriteTeam.name} sits P${rank + 1} in the constructors' championship with ${s.points} points`,
      });
    }
  }

  // A coincidental crossover between "your favorite" and "who's actually won here the most" -
  // only fires when they're literally the same person/team, not a fabricated "your favorite has
  // N wins here" for every driver (that per-track breakdown isn't part of TrackHistory's shape).
  if (favoriteDriver && trackHistory?.topPerformer?.driverId === favoriteDriver.driverId) {
    facts.push({
      icon: "🎉",
      text: `Your favorite, ${favoriteDriver.name}, is also the winningest driver at the upcoming track — ${trackHistory.topPerformer.wins} wins there`,
    });
  }
  if (favoriteTeam && trackHistory?.topCurrentTeam?.name === favoriteTeam.currentName) {
    facts.push({
      icon: "🎉",
      text: `${favoriteTeam.name} has won more at the upcoming track than any other team still on the grid (${trackHistory.topCurrentTeam.wins} wins)`,
    });
  }

  return facts;
}

export function FactsSection({
  year,
  standings,
  favoriteDriver,
  favoriteTeam,
  trackHistory,
}: {
  year: number;
  standings: SeasonStandings;
  favoriteDriver: FavoriteDriverCard | null;
  favoriteTeam: FavoriteTeamCard | null;
  trackHistory: TrackHistory | null;
}) {
  const facts = buildFacts(year, standings, favoriteDriver, favoriteTeam, trackHistory);
  if (facts.length === 0) return null;

  return (
    <section>
      <h2 className="text-lg font-semibold text-white">{year} season, so far</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {facts.map((fact) => (
          <div
            key={fact.text}
            className="flex items-start gap-3 rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)] p-4"
          >
            <span className="text-2xl" aria-hidden>
              {fact.icon}
            </span>
            <p className="text-sm text-neutral-200">{fact.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
