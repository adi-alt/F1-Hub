import Link from "next/link";
import { GridToFinishChart } from "@/components/circuit/GridToFinishChart";
import { raceHref } from "@/lib/routes";
import type { RaceSummary } from "@/app/season/_service/season.pure";

/** Mandatory the moment this season's own round at this circuit has actually run - what happened
 * here THIS year, not just all-time history. Every number is read straight off the real
 * classification (race.winnerName/poleSitterName/fastestLap/podium), nothing computed twice. */
export function CurrentSeasonPerformance({ race, year }: { race: RaceSummary; year: number }) {
  const podium = race.podium;
  const gainer = [...race.results]
    .filter((r) => r.grid != null && r.status !== "dnf")
    .sort((a, b) => (b.grid! - b.finishPosition) - (a.grid! - a.finishPosition))[0];
  const loser = [...race.results]
    .filter((r) => r.grid != null)
    .sort((a, b) => (a.grid! - a.finishPosition) - (b.grid! - b.finishPosition))[0];
  const dnfCount = race.results.filter((r) => r.status === "dnf").length;

  return (
    <section aria-label={`${year} performance at this circuit`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500">{year} performance</p>
      <div aria-hidden className="mt-2 h-px w-full bg-gradient-to-r from-white/[0.09] to-transparent" />

      <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
          {race.winnerName && (
            <div>
              <p className="text-[10px] uppercase tracking-[0.12em] text-neutral-600">Winner</p>
              <p className="mt-0.5 truncate text-lg font-semibold text-white">{race.winnerName}</p>
            </div>
          )}
          {race.poleSitterName && (
            <div>
              <p className="text-[10px] uppercase tracking-[0.12em] text-neutral-600">Pole</p>
              <p className="mt-0.5 truncate text-sm font-medium text-neutral-200">{race.poleSitterName}</p>
            </div>
          )}
          {race.fastestLap && (
            <div>
              <p className="text-[10px] uppercase tracking-[0.12em] text-neutral-600">Fastest lap</p>
              <p className="mt-0.5 truncate text-sm font-medium text-neutral-200">{race.fastestLap.driverName}</p>
            </div>
          )}
          {podium.length > 1 && (
            <div className="col-span-2 sm:col-span-3">
              <p className="text-[10px] uppercase tracking-[0.12em] text-neutral-600">Podium</p>
              <ol className="mt-1 flex flex-wrap gap-x-5 gap-y-1">
                {podium.map((p) => (
                  <li key={p.driver} className="flex items-baseline gap-1.5 text-sm">
                    <span className="font-mono text-[11px] tabular-nums text-neutral-600">P{p.position}</span>
                    <span className="text-neutral-300">{p.driverName}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {(gainer || loser || dnfCount > 0) && (
            <div className="col-span-2 grid grid-cols-1 gap-3 border-t border-white/[0.06] pt-3 sm:col-span-3 sm:grid-cols-3">
              {gainer && gainer.grid! - gainer.finishPosition > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-[0.12em] text-neutral-600">Biggest gainer</p>
                  <p className="mt-0.5 text-sm text-neutral-200">
                    {gainer.driverName} <span className="text-emerald-400">+{gainer.grid! - gainer.finishPosition}</span>
                  </p>
                </div>
              )}
              {loser && loser.grid! - loser.finishPosition < 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-[0.12em] text-neutral-600">Most positions lost</p>
                  <p className="mt-0.5 text-sm text-neutral-200">
                    {loser.driverName} <span className="text-[var(--f1-red)]">{loser.grid! - loser.finishPosition}</span>
                  </p>
                </div>
              )}
              {dnfCount > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-[0.12em] text-neutral-600">Retirements</p>
                  <p className="mt-0.5 text-sm text-neutral-200">{dnfCount}</p>
                </div>
              )}
            </div>
          )}

          <div className="col-span-2 sm:col-span-3">
            <Link href={raceHref(year, race.round, race.name)} className="text-xs font-medium text-neutral-400 underline decoration-white/20 underline-offset-4 transition hover:text-white">
              View full race detail →
            </Link>
          </div>
        </div>

        <div className="min-w-0">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500">Grid → finish</p>
          <GridToFinishChart results={race.results} tireStints={[]} />
        </div>
      </div>
    </section>
  );
}
