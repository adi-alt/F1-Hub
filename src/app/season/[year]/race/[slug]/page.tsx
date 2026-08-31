import { notFound } from "next/navigation";
import { SeasonRaceTabs } from "@/components/race/SeasonRaceTabs";
import { RaceHeader } from "@/components/raceDetail/RaceHeader";
import { PickPanel } from "@/components/race/PickPanel";
import { SignInGate } from "@/components/auth/SignInGate";
import { getRace, getRacesByYear } from "@/lib/supabase/races";
import { computeHighlights } from "@/lib/highlights";
import { comparePolePrediction, comparePrediction } from "@/lib/predictionAccuracy";
import { seasonHref, slugifyRaceName } from "@/lib/routes";
import { getSession } from "@/lib/session/getSession";

export default async function SeasonRacePage({ params }: { params: Promise<{ year: string; slug: string }> }) {
  const session = await getSession();
  if (!session.uid) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <SignInGate label="this race" />
      </div>
    );
  }

  const { year: yearParam, slug } = await params;
  const year = Number(yearParam);
  // getRacesByYear also returns calendar placeholders for rounds with no real row yet (see its own
  // comment) - only used here to resolve slug -> round; getRace below is the strict, real-data-only
  // fetch that actually 404s a round nothing has been written for yet, same as before this route existed.
  const roundMatch = (await getRacesByYear(year)).find((r) => slugifyRaceName(r.name) === slug);
  if (!roundMatch) notFound();

  const race = await getRace(year, roundMatch.round);
  if (!race) notFound();

  const highlights = computeHighlights(race);
  const accuracy = comparePrediction(race);
  const poleAccuracy = comparePolePrediction(race);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <RaceHeader backHref={seasonHref(race.year)} backLabel={`${race.year} season`} roundLabel={`Round ${race.round}`} name={race.name} circuitName={race.circuit} />

      <div className="mt-8">
        <SeasonRaceTabs race={race} highlights={highlights} accuracy={accuracy} poleAccuracy={poleAccuracy} />
      </div>

      <div className="mt-8">
        <PickPanel race={race} />
      </div>
    </div>
  );
}
