import { RaceRealtimeWatcher } from "@/components/RaceRealtimeWatcher";
import { AboutSection } from "@/components/home/AboutSection";
import { FactsSection } from "@/components/home/FactsSection";
import { FavoritesSection } from "@/components/home/FavoritesSection";
import { GroupsPreview } from "@/components/home/GroupsPreview";
import { Hero } from "@/components/home/Hero";
import { NextRaceCard } from "@/components/home/NextRaceCard";
import { SeasonStrip } from "@/components/home/SeasonStrip";
import {
  computeSeasonStandings,
  getFavoriteDriverCard,
  getFavoriteTeamCard,
  getFavoriteTrackCard,
} from "@/lib/personalization";
import { getNextUpcomingRace, getRacesByYear } from "@/lib/supabase/races";
import { getUserProfile } from "@/lib/supabase/users";
import { getSession } from "@/lib/session/getSession";

// Reading the session cookie below makes this route inherently dynamic (no route-level
// `revalidate` possible), but the underlying Postgres reads are still cached for 300s via
// `unstable_cache` in lib/supabase/races.ts, so signed-in visits don't hit Postgres every time.

// A homepage teaser shows a few, not "all your favorites" (that's what /profile is for) — caps
// keep the grid readable regardless of how enthusiastically someone's favorited things.
const FAVORITES_PER_CATEGORY = 3;

export default async function HomePage() {
  const session = await getSession();

  // Signed-out visitors only get the landing hero — race/season data is neither fetched nor
  // shipped to them, not just visually hidden, so gating this way doesn't leak it in the RSC payload.
  if (!session.uid) {
    return (
      <>
        <Hero />
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <AboutSection />
        </section>
      </>
    );
  }

  const year = new Date().getFullYear();
  const [nextRace, races, standings, profile] = await Promise.all([
    getNextUpcomingRace(year),
    getRacesByYear(year),
    computeSeasonStandings(year),
    getUserProfile(session.uid),
  ]);

  const [favoriteDrivers, favoriteTeams, favoriteTracks] = await Promise.all([
    Promise.all((profile?.favoriteDrivers ?? []).slice(0, FAVORITES_PER_CATEGORY).map(getFavoriteDriverCard)),
    Promise.all((profile?.favoriteTeams ?? []).slice(0, FAVORITES_PER_CATEGORY).map(getFavoriteTeamCard)),
    Promise.all((profile?.favoriteTracks ?? []).slice(0, FAVORITES_PER_CATEGORY).map(getFavoriteTrackCard)),
  ]);
  const resolvedDrivers = favoriteDrivers.filter((d) => d !== null);
  const resolvedTeams = favoriteTeams.filter((t) => t !== null);
  const resolvedTracks = favoriteTracks.filter((t) => t !== null);

  return (
    <>
      <Hero />
      <RaceRealtimeWatcher />
      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <NextRaceCard race={nextRace} />
      </section>
      <section className="mx-auto max-w-6xl space-y-12 px-4 pb-16 sm:px-6">
        <FactsSection year={year} standings={standings} favoriteDriver={resolvedDrivers[0] ?? null} favoriteTeam={resolvedTeams[0] ?? null} />
        <FavoritesSection drivers={resolvedDrivers} teams={resolvedTeams} tracks={resolvedTracks} />
        <GroupsPreview uid={session.uid} />
        <div>
          <h2 className="mb-4 text-lg font-semibold text-white">{year} Season</h2>
          <SeasonStrip races={races} />
        </div>
      </section>
    </>
  );
}
