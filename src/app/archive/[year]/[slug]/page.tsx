import { notFound } from "next/navigation";
import { ArchiveRaceTabs } from "../../components/ArchiveRaceTabs";
import { RaceHeader } from "@/components/raceDetail/RaceHeader";
import { getArchiveCircuitData, getArchiveSeasonData } from "../../services/archive.service";
import { SignInGate } from "@/components/auth/SignInGate";
import { archiveSeasonHref, slugifyRaceName } from "@/lib/routes";
import { getSession } from "@/lib/session/getSession";

export default async function ArchiveRacePage({ params }: { params: Promise<{ year: string; slug: string }> }) {
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
  const races = await getArchiveSeasonData(year);
  // getArchiveSeasonData already embeds every race's full results/qualifying/pit-stops (the same
  // query getArchiveRaceData itself used) - finding the match here is one fetch, not two.
  const race = races.find((r) => slugifyRaceName(r.raceName) === slug);
  if (!race) notFound();

  const circuit = race.circuitId ? await getArchiveCircuitData(race.circuitId) : null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <RaceHeader
        backHref={archiveSeasonHref(year)}
        backLabel={`${year}`}
        roundLabel={`Round ${race.round}`}
        name={race.raceName}
        circuitName={race.circuitName}
        locality={race.locality}
        country={race.country}
        dateLabel={race.raceDate ?? undefined}
        externalLink={race.wikipediaUrl ? { href: race.wikipediaUrl, label: "Full race report" } : undefined}
      />

      <div className="mt-8">
        <ArchiveRaceTabs race={race} circuit={circuit} />
      </div>
    </div>
  );
}
