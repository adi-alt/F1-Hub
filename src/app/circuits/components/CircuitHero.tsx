import Link from "next/link";
import { formatLapTime, raceTitle } from "@/lib/format";
import { describeTrackCharacter, type CircuitFacts } from "@/lib/circuitFacts";
import { teamColor } from "@/lib/teamColors";
import type { RaceSummary } from "@/app/season/_service/season.pure";
import type { RaceDoc } from "@/lib/types/race";

export type HeroAnswer =
  | { kind: "result"; year: number; race: RaceDoc; dateLabel: string | null }
  | { kind: "next"; race: RaceSummary; daysToGo: number | null; dateLabel: string | null }
  | null;

/**
 * The circuit page's header (spec §3 page template, §4.11 PageHeader): breadcrumb, the circuit's name, its Grand
 * Prix and place, and - answer first - the one fact a visitor came for: who won here last, with the podium, or
 * when the next race is. The circuit's own figures sit beside it. Nothing is guessed: a missing figure is left out.
 */
export function CircuitHero({
  location,
  grandPrixName,
  country,
  facts,
  answer,
  avgFieldMovement,
}: {
  location: string;
  grandPrixName: string | null;
  country: string | null;
  facts: CircuitFacts | null;
  answer: HeroAnswer;
  avgFieldMovement: number | null;
}) {
  const displayName = facts?.venueName ?? raceTitle(location);
  const character = facts ? describeTrackCharacter(facts, avgFieldMovement) : [];

  const stats = facts
    ? [
        { label: "Length", value: `${facts.lengthKm.toFixed(3)} km` },
        { label: "Turns", value: String(facts.turns) },
        { label: "Direction", value: facts.direction === "clockwise" ? "Clockwise" : "Anticlockwise" },
        { label: "Type", value: facts.trackType === "street" ? "Street" : facts.trackType === "hybrid" ? "Hybrid" : "Permanent" },
        { label: "First Grand Prix", value: String(facts.firstGrandPrix) },
        facts.lapRecord ? { label: `Lap record · ${facts.lapRecord.year}`, value: formatLapTime(facts.lapRecord.timeSec), detail: facts.lapRecord.driverName } : null,
      ].filter((x): x is { label: string; value: string; detail?: string } => x !== null)
    : [];

  return (
    <header className="mb-12 grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-12">
      <div className="min-w-0">
        <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-1.5 text-body-sm">
          <Link href="/circuits" className="text-secondary transition-colors hover:text-primary">
            Circuits
          </Link>
          <span aria-hidden className="text-tertiary">
            /
          </span>
          <span className="truncate text-primary" aria-current="page">
            {displayName}
          </span>
        </nav>
        <h1 className="text-[40px] font-bold leading-none tracking-[-0.03em] text-primary sm:text-6xl">{displayName}</h1>
        <p className="mt-3 text-body text-secondary">
          {grandPrixName ?? "Grand Prix"}
          {(location || country) && <span className="text-tertiary"> · {[location, country].filter(Boolean).join(", ")}</span>}
        </p>
        {answer && <Answer answer={answer} />}
      </div>

      {stats.length > 0 && (
        <div className="min-w-0 lg:border-l lg:border-subtle lg:pl-12">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 lg:grid-cols-2">
            {stats.map((item) => (
              <div key={item.label} className="min-w-0">
                <dt className="text-caption text-secondary">{item.label}</dt>
                <dd className="mt-1 truncate text-title-md font-semibold tabular text-primary">{item.value}</dd>
                {item.detail && <dd className="mt-0.5 truncate text-caption text-secondary">{item.detail}</dd>}
              </div>
            ))}
          </dl>
          {character.length > 0 && (
            <ul aria-label="Track character" className="mt-6 flex flex-wrap gap-1.5">
              {character.map((tag) => (
                <li key={tag} className="rounded-sm border border-subtle px-2 py-0.5 text-caption text-secondary">
                  {tag}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </header>
  );
}

function Answer({ answer }: { answer: NonNullable<HeroAnswer> }) {
  if (answer.kind === "next") {
    const { race, daysToGo, dateLabel } = answer;
    const when = daysToGo === null ? "date to be confirmed" : daysToGo <= 0 ? "this weekend" : `in ${daysToGo} ${daysToGo === 1 ? "day" : "days"}`;
    return (
      <div className="mt-8 border-t border-subtle pt-6">
        <p className="text-caption text-secondary">{race.state === "next" ? "Next race" : "Coming up"} · Round {race.round}</p>
        <p className="mt-1 text-title-lg font-semibold text-primary">
          {dateLabel ?? race.name}, <span className="text-brand-text">{when}</span>
        </p>
        {race.forecast && (
          <p className="mt-3 text-body-sm text-secondary">
            {Math.round(race.forecast.airTempC)}°C, {Math.round(race.forecast.rainProbability * 100)}% chance of rain
            {race.forecast.source !== "openweathermap" && <span className="text-tertiary"> · from past conditions, no live forecast yet</span>}
          </p>
        )}
      </div>
    );
  }
  const { race, year, dateLabel } = answer;
  const podium = [...(race.results ?? [])].filter((r) => r.finishPosition <= 3 && r.status !== "dnf").sort((a, b) => a.finishPosition - b.finishPosition);
  const winner = podium[0];
  if (!winner) return null;
  return (
    <div className="mt-8 border-t border-subtle pt-6">
      <p className="text-caption text-secondary">
        {year === race.year ? `This season` : `Last raced`} · {race.year}
        {dateLabel ? ` · ${dateLabel}` : ""}
      </p>
      <p className="mt-1 text-title-lg font-semibold text-primary">
        {winner.driverName} won{winner.grid ? (winner.grid === 1 ? " from pole" : ` from P${winner.grid}`) : ""}
      </p>
      <ol className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5">
        {podium.map((p) => (
          <li key={p.driver} className="flex items-center gap-2 text-body-sm">
            <span className="tabular text-tertiary">P{p.finishPosition}</span>
            <span aria-hidden className="h-3.5 w-0.5" style={{ backgroundColor: teamColor(p.team) }} />
            <span className="text-primary">{p.driverName}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
