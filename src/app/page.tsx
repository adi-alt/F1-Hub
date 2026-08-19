import { AboutSection } from "@/components/home/AboutSection";
import { Hero } from "@/components/home/Hero";
import { NextRaceCard } from "@/components/home/NextRaceCard";
import { SeasonStrip } from "@/components/home/SeasonStrip";
import { getNextUpcomingRace, getRacesByYear } from "@/lib/supabase/races";
import { getSession } from "@/lib/session/getSession";

// Reading the session cookie below makes this route inherently dynamic (no route-level
// `revalidate` possible), but the underlying Firestore reads are still cached for 300s via
// `unstable_cache` in lib/supabase/races.ts, so signed-in visits don't hit Firestore every time.

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
  const [nextRace, races] = await Promise.all([getNextUpcomingRace(year), getRacesByYear(year)]);

  return (
    <>
      <Hero />
      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <NextRaceCard race={nextRace} />
      </section>
      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <h2 className="mb-4 text-lg font-semibold text-white">{year} Season</h2>
        <SeasonStrip races={races} />
      </section>
    </>
  );
}
