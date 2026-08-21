import { RaceRealtimeWatcher } from "@/components/RaceRealtimeWatcher";
import { AboutSection } from "@/components/home/AboutSection";
import { FavoritesSection } from "@/components/home/FavoritesSection";
import { GroupsPreview } from "@/components/home/GroupsPreview";
import { Hero } from "@/components/home/Hero";
import { OnboardingTour } from "@/components/home/OnboardingTour";
import { RotatingBackdrop } from "@/components/home/RotatingBackdrop";
import { SeasonStrip } from "@/components/home/SeasonStrip";
import { type StandingsVariant } from "@/components/home/StandingsWidget";
import { UpcomingRaceCard } from "@/components/home/UpcomingRaceCard";
import { resolveCurrentCircuitToArchiveId } from "@/lib/circuitSlug";
import {
  buildFacts,
  computeChampionshipProgression,
  computeSeasonStandings,
  getFavoriteDriverCard,
  getFavoriteTeamCard,
  getFavoriteTrackCard,
  getRecentCircuitPhotos,
  getTrackHistory,
} from "@/lib/personalization";
import { getAllArchiveCircuits } from "@/lib/supabase/archive";
import { getCalendarEntry } from "@/lib/supabase/calendar";
import { getNextUpcomingRace, getRacesByYear } from "@/lib/supabase/races";
import { getUserProfile } from "@/lib/supabase/users";
import { getSession } from "@/lib/session/getSession";

// Reading the session cookie below makes this route inherently dynamic (no route-level
// `revalidate` possible), but the underlying Postgres reads are still cached for 300s via
// `unstable_cache` in lib/supabase/races.ts, so signed-in visits don't hit Postgres every time.

// A homepage teaser shows a few, not "all your favorites" (that's what /profile is for) — caps
// keep the grid readable regardless of how enthusiastically someone's favorited things.
const FAVORITES_PER_CATEGORY = 3;
const STANDINGS_VARIANTS: StandingsVariant[] = ["table", "bar", "line"];

// Extracted out of the page component itself: eslint's react-hooks/purity rule flags any impure
// call (Math.random, Date.now, ...) lexically inside a function it treats as a component - a
// plain helper sidesteps that, and the *reason* it's fine here still holds regardless: this is a
// Server Component evaluated once per request, not a client component re-rendering, so a fresh
// random pick per request is exactly "impure" in the way that's intended, not a bug.
function pickStandingsVariant(): StandingsVariant {
  return STANDINGS_VARIANTS[Math.floor(Math.random() * STANDINGS_VARIANTS.length)];
}

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
  const [nextRace, races, standings, profile, archiveCircuits] = await Promise.all([
    getNextUpcomingRace(year),
    getRacesByYear(year),
    computeSeasonStandings(year),
    getUserProfile(session.uid),
    getAllArchiveCircuits(),
  ]);

  const [favoriteDrivers, favoriteTeams, favoriteTracks] = await Promise.all([
    Promise.all((profile?.favoriteDrivers ?? []).slice(0, FAVORITES_PER_CATEGORY).map(getFavoriteDriverCard)),
    Promise.all((profile?.favoriteTeams ?? []).slice(0, FAVORITES_PER_CATEGORY).map(getFavoriteTeamCard)),
    Promise.all((profile?.favoriteTracks ?? []).slice(0, FAVORITES_PER_CATEGORY).map(getFavoriteTrackCard)),
  ]);
  const resolvedDrivers = favoriteDrivers.filter((d) => d !== null);
  const resolvedTeams = favoriteTeams.filter((t) => t !== null);
  const resolvedTracks = favoriteTracks.filter((t) => t !== null);
  const favoriteDriver = resolvedDrivers[0] ?? null;
  const favoriteTeam = resolvedTeams[0] ?? null;

  // The upcoming race's own `circuit` is a raw FastF1 location string ("Zandvoort"), not the
  // archive's circuit_id — same reconciliation profile/page.tsx already needed, reused here
  // rather than re-derived (see lib/circuitSlug.ts).
  const circuitLocalities = new Map(archiveCircuits.filter((c) => c.locality).map((c) => [c.circuitId, c.locality as string]));
  const circuitIdsByName = new Map(archiveCircuits.filter((c) => c.name).map((c) => [c.name!.trim().toLowerCase(), c.circuitId]));
  const resolvedCircuitId = nextRace ? resolveCurrentCircuitToArchiveId(nextRace.circuit, circuitLocalities, circuitIdsByName) : null;

  const [calendarEntry, trackHistory, recentPhotos] = await Promise.all([
    nextRace ? getCalendarEntry(nextRace.year, nextRace.round) : null,
    resolvedCircuitId ? getTrackHistory(resolvedCircuitId) : null,
    getRecentCircuitPhotos(resolvedCircuitId, nextRace?.circuit ?? null, year),
  ]);

  const topDriverCodes = standings.drivers.slice(0, 5).map((d) => d.driver);
  const progression = topDriverCodes.length > 0 ? await computeChampionshipProgression(year, topDriverCodes) : [];
  // Chosen once per request, server-side, and passed down as a prop — picking it inside a client
  // component would desync from the server-rendered HTML on hydration (see StandingsWidget's own
  // docstring).
  const standingsVariant = pickStandingsVariant();
  const facts = buildFacts(year, standings, favoriteDriver, favoriteTeam, trackHistory);

  const firstName = profile?.firstName ?? profile?.displayName ?? "there";
  const isReturning = !!profile?.onboardingCompletedAt;
  // Falls back to the circuit's one known image when no real recent photo has been backfilled yet
  // (a brand-new track) — RotatingBackdrop itself only rotates once it has 2+ frames, so a
  // single-photo array here just renders as a still backdrop.
  const backdropPhotos = recentPhotos.length > 0 ? recentPhotos.map((p) => p.url) : trackHistory?.circuitImageUrl ? [trackHistory.circuitImageUrl] : [];

  return (
    <>
      <RaceRealtimeWatcher />
      <OnboardingTour initiallyOpen={!isReturning} />
      <div className="relative">
        {/* The homepage's own background, not any one card's — a fixed-height band pinned to the
            top that fades into the page's flat background color by the time it ends, so it reads
            as "this page has a photo backdrop" rather than "this div has a photo". */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[70vh] max-h-[640px] overflow-hidden">
          <RotatingBackdrop photos={backdropPhotos} />
          <div className="absolute inset-0 bg-gradient-to-b from-[var(--background)]/50 via-[var(--background)]/85 to-[var(--background)]" />
        </div>

        <div className="relative mx-auto max-w-6xl space-y-12 px-4 py-10 sm:px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-[var(--f1-red)]">{isReturning ? "Welcome back" : "Welcome"}</p>
            <h1 className="mt-1 text-3xl font-bold text-white">{firstName}</h1>
          </div>

          {calendarEntry && (
            <UpcomingRaceCard
              calendar={calendarEntry}
              circuitName={nextRace?.circuit ?? calendarEntry.circuit ?? calendarEntry.name ?? "Unknown circuit"}
              trackHistory={trackHistory}
              year={year}
              standings={standings}
              standingsVariant={standingsVariant}
              progression={progression}
              facts={facts}
            />
          )}

          <FavoritesSection drivers={resolvedDrivers} teams={resolvedTeams} tracks={resolvedTracks} />
          <GroupsPreview uid={session.uid} />

          <div>
            <h2 className="mb-4 text-lg font-semibold text-white">{year} Season</h2>
            <SeasonStrip races={races} />
          </div>
        </div>
      </div>
    </>
  );
}
