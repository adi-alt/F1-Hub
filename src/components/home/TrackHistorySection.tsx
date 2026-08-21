import Link from "next/link";
import { EntityAvatar } from "@/components/EntityAvatar";
import { PosterImage } from "./PosterImage";
import type { TrackHistory } from "@/lib/personalization";

export function TrackHistorySection({ history, circuitName }: { history: TrackHistory; circuitName: string }) {
  if (!history.topPerformer && !history.youngestWinner && !history.topCurrentTeam) return null;

  return (
    <section>
      <h2 className="text-lg font-semibold text-white">
        {circuitName}
        <span className="ml-2 text-sm font-normal text-neutral-500">
          {history.totalRaces} races since {history.firstYear}
        </span>
      </h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        {history.topPerformer && (
          <Link href={history.topPerformer.href} className="block transition hover:opacity-90">
            <PosterImage
              imageUrl={history.topPerformer.photoUrl}
              title={history.topPerformer.driverName}
              subtitle={`${history.topPerformer.wins} wins here — the most of anyone`}
            />
          </Link>
        )}
        {history.youngestWinner && (
          <Link href={history.youngestWinner.href} className="block transition hover:opacity-90">
            <PosterImage
              imageUrl={history.youngestWinner.photoUrl}
              title={history.youngestWinner.driverName}
              subtitle={`Youngest winner — ${history.youngestWinner.ageYears} in ${history.youngestWinner.year}`}
            />
          </Link>
        )}
        {history.topCurrentTeam && (
          <div className="flex aspect-[3/4] flex-col items-center justify-center gap-3 rounded-2xl border border-[var(--f1-line)] bg-[var(--f1-carbon)] p-6 text-center">
            <EntityAvatar imageUrl={history.topCurrentTeam.logoUrl} name={history.topCurrentTeam.name} size={72} fit="contain" />
            <div>
              <p className="font-semibold text-white">{history.topCurrentTeam.name}</p>
              <p className="mt-0.5 text-xs text-neutral-500">{history.topCurrentTeam.wins} wins here — most of any team still on the grid</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
