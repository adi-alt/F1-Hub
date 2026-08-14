import Link from "next/link";
import { notFound } from "next/navigation";
import { ArchiveCircuitGrid } from "./components/ArchiveCircuitGrid";
import { ArchiveDriverGrid } from "./components/ArchiveDriverGrid";
import { ArchiveRaceList } from "./components/ArchiveRaceList";
import { ArchiveSeasonGrid } from "./components/ArchiveSeasonGrid";
import { CircuitCard } from "./components/CircuitCard";
import { LapChart } from "./components/LapChart";
import { PitStopsTimeline } from "./components/PitStopsTimeline";
import { QualifyingBarChart } from "./components/QualifyingBarChart";
import { ResultsBoard } from "./components/ResultsBoard";
import {
  ARCHIVE_EARLIEST_YEAR,
  ARCHIVE_LATEST_YEAR,
  getAllArchiveCircuitsData,
  getAllArchiveDriversData,
  getArchiveCircuitData,
  getArchiveCircuitHistoryData,
  getArchiveDriverHistoryData,
  getArchiveRaceData,
  getArchiveSeasonData,
  getArchiveYears,
} from "./services/archive.service";
import { SignInGate } from "@/components/auth/SignInGate";
import { archiveRaceHref, archiveSeasonHref } from "@/lib/routes";
import { getSession } from "@/lib/session/getSession";

type Facet = "year" | "track" | "driver";

function FacetTabs({ active }: { active: Facet }) {
  const tabs: { key: Facet; label: string; href: string }[] = [
    { key: "year", label: "By year", href: "/archive" },
    { key: "track", label: "By track", href: "/archive?by=track" },
    { key: "driver", label: "By driver", href: "/archive?by=driver" },
  ];
  return (
    <div className="mt-6 flex gap-2">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
            t.key === active
              ? "bg-[var(--f1-red)] text-white"
              : "border border-[var(--f1-line)] text-neutral-300 hover:border-white/30 hover:text-white"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}

async function ArchiveIndex({ by }: { by: Facet }) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold text-white">Archive</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Every season from {ARCHIVE_EARLIEST_YEAR} to {ARCHIVE_LATEST_YEAR} — results only, sourced
        from the Ergast/Jolpi historical database.
      </p>
      <FacetTabs active={by} />
      {by === "track" && <ArchiveCircuitGrid circuits={await getAllArchiveCircuitsData()} />}
      {by === "driver" && <ArchiveDriverGrid drivers={await getAllArchiveDriversData()} />}
      {by === "year" && <ArchiveSeasonGrid years={getArchiveYears()} />}
    </div>
  );
}

async function ArchiveSeason({ year }: { year: number }) {
  const races = await getArchiveSeasonData(year);
  if (races.length === 0) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <Link href="/archive" className="text-sm text-neutral-500 hover:text-neutral-300">
          ← Archive
        </Link>
        <h1 className="mt-2 text-3xl font-bold text-white">{year}</h1>
        <p className="mt-4 text-sm text-neutral-500">No results backfilled for this season yet.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <Link href="/archive" className="text-sm text-neutral-500 hover:text-neutral-300">
        ← Archive
      </Link>
      <h1 className="mt-2 text-3xl font-bold text-white">{year}</h1>
      <p className="mt-1 text-sm text-neutral-500">{races.length} races</p>
      <ArchiveRaceList year={year} races={races} />
    </div>
  );
}

async function ArchiveRace({ year, round }: { year: number; round: number }) {
  const race = await getArchiveRaceData(year, round);
  if (!race) notFound();

  const circuit = race.circuitId ? await getArchiveCircuitData(race.circuitId) : null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <Link href={archiveSeasonHref(year)} className="text-sm text-neutral-500 hover:text-neutral-300">
        ← {year}
      </Link>
      <h1 className="mt-2 text-3xl font-bold text-white">{race.raceName}</h1>
      <p className="mt-1 text-sm text-neutral-500">
        {race.circuitName}
        {race.locality ? `, ${race.locality}` : ""}
        {race.country ? `, ${race.country}` : ""}
        {race.raceDate ? ` — ${race.raceDate}` : ""}
        {race.wikipediaUrl && (
          <>
            {" · "}
            <a href={race.wikipediaUrl} target="_blank" rel="noreferrer" className="text-[var(--f1-red)] hover:underline">
              Full race report on Wikipedia →
            </a>
          </>
        )}
      </p>

      {circuit && (
        <div className="mt-6">
          <CircuitCard circuit={circuit} weather={race.weather} />
        </div>
      )}

      <div className="mt-8">
        <ResultsBoard results={race.results} qualifying={race.qualifying} pitStops={race.pitStops} />
      </div>

      {!!race.qualifying?.length && (
        <div className="mt-10">
          <h2 className="mb-3 text-lg font-semibold text-white">Qualifying</h2>
          <QualifyingBarChart qualifying={race.qualifying} />
        </div>
      )}

      {!!race.pitStops?.length && (
        <div className="mt-10">
          <h2 className="mb-3 text-lg font-semibold text-white">Pit stops</h2>
          <PitStopsTimeline pitStops={race.pitStops} results={race.results} />
        </div>
      )}

      {race.lapsBackfilled && (
        <div className="mt-10">
          <h2 className="mb-3 text-lg font-semibold text-white">Race progress</h2>
          <LapChart year={year} round={round} results={race.results} />
        </div>
      )}
    </div>
  );
}

async function ArchiveCircuitHistory({ circuitId }: { circuitId: string }) {
  const [circuit, races] = await Promise.all([
    getArchiveCircuitData(circuitId),
    getArchiveCircuitHistoryData(circuitId),
  ]);
  if (!circuit) notFound();

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <Link href="/archive?by=track" className="text-sm text-neutral-500 hover:text-neutral-300">
        ← Archive
      </Link>
      <h1 className="mt-2 text-3xl font-bold text-white">{circuit.name ?? circuit.circuitId}</h1>
      <div className="mt-4">
        <CircuitCard circuit={circuit} />
      </div>
      <p className="mt-6 text-sm text-neutral-500">
        {races.length} race{races.length === 1 ? "" : "s"} on record here
      </p>
      <div className="mt-3 space-y-2">
        {races.map((r) => {
          const winner = r.results.find((res) => res.position === 1);
          return (
            <Link
              key={r.id}
              href={archiveRaceHref(r.year, r.round)}
              className="flex items-center justify-between rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)] px-5 py-4 transition hover:border-white/30 hover:shadow-lg hover:shadow-black/30"
            >
              <div>
                <p className="text-xs text-neutral-500">{r.year}</p>
                <p className="font-semibold text-white">{r.raceName}</p>
              </div>
              {winner && (
                <div className="text-right">
                  <p className="text-xs text-neutral-500">Winner</p>
                  <p className="text-sm font-medium text-white">{winner.driverName}</p>
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

async function ArchiveDriverHistory({ driverId }: { driverId: string }) {
  const races = await getArchiveDriverHistoryData(driverId);
  if (races.length === 0) notFound();

  const name = races[0].results.find((r) => r.driverId === driverId)?.driverName ?? driverId;
  const years = races.map((r) => r.year);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <Link href="/archive?by=driver" className="text-sm text-neutral-500 hover:text-neutral-300">
        ← Archive
      </Link>
      <h1 className="mt-2 text-3xl font-bold text-white">{name}</h1>
      <p className="mt-1 text-sm text-neutral-500">
        {Math.min(...years)}–{Math.max(...years)} · {races.length} race{races.length === 1 ? "" : "s"}
      </p>
      <div className="mt-6 space-y-2">
        {races.map((r) => {
          const entry = r.results.find((res) => res.driverId === driverId);
          return (
            <Link
              key={r.id}
              href={archiveRaceHref(r.year, r.round)}
              className="flex items-center justify-between rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)] px-5 py-4 transition hover:border-white/30 hover:shadow-lg hover:shadow-black/30"
            >
              <div>
                <p className="text-xs text-neutral-500">{r.year}</p>
                <p className="font-semibold text-white">{r.raceName}</p>
              </div>
              {entry && (
                <div className="text-right">
                  <p className="text-xs text-neutral-500">Finished</p>
                  <p className="text-sm font-medium text-white">{entry.positionText}</p>
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export default async function ArchivePage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; round?: string; by?: string; circuit?: string; driver?: string }>;
}) {
  const session = await getSession();
  if (!session.uid) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <SignInGate label="the historical archive" />
      </div>
    );
  }

  const { year: yearParam, round: roundParam, by, circuit, driver } = await searchParams;
  const year = yearParam ? Number(yearParam) : null;
  const round = roundParam ? Number(roundParam) : null;

  if (year && round) return <ArchiveRace year={year} round={round} />;
  if (year) return <ArchiveSeason year={year} />;
  if (circuit) return <ArchiveCircuitHistory circuitId={circuit} />;
  if (driver) return <ArchiveDriverHistory driverId={driver} />;
  return <ArchiveIndex by={by === "track" || by === "driver" ? by : "year"} />;
}
