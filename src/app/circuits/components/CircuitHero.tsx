import Link from "next/link";
import { RotatingBackdrop } from "@/components/home/RotatingBackdrop";
import { CircuitCanvas } from "@/components/circuit/CircuitCanvas";
import { formatLapTime, raceTitle } from "@/lib/format";
import { describeTrackCharacter, type CircuitFacts } from "@/lib/circuitFacts";
import { teamColor } from "@/lib/teamColors";
import type { CircuitDrawing } from "@/lib/circuitLayout";
import type { RaceSummary } from "@/app/season/_service/season.pure";
import type { RaceDoc } from "@/lib/types/race";

export type HeroAnswer =
  | { kind: "result"; year: number; race: RaceDoc; dateLabel: string | null }
  | { kind: "next"; race: RaceSummary; daysToGo: number | null; dateLabel: string | null }
  | null;

/**
 * The circuit page's hero, in the home page's language: the circuit's own race photography behind it (the same
 * rotating backdrop and scrim), the name, and - answer first - who won here last or when the next race is. The real
 * circuit is drawn large beside it, and its figures run in a strip underneath. Nothing is guessed: a missing figure
 * or photo is simply left out.
 */
export function CircuitHero({
  location,
  grandPrixName,
  country,
  facts,
  answer,
  avgFieldMovement,
  photos,
  drawing,
}: {
  location: string;
  grandPrixName: string | null;
  country: string | null;
  facts: CircuitFacts | null;
  answer: HeroAnswer;
  avgFieldMovement: number | null;
  photos: string[];
  drawing: CircuitDrawing | null;
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
        facts.lapRecord ? { label: `Lap record · ${facts.lapRecord.driverName}, ${facts.lapRecord.year}`, value: formatLapTime(facts.lapRecord.timeSec) } : null,
      ].filter((x): x is { label: string; value: string } => x !== null)
    : [];

  return (
    <header className="relative mb-12">
      {/* Full-bleed: the photography runs edge to edge behind the hero, as on the home page. */}
      <div aria-hidden className="pointer-events-none absolute inset-y-0 left-1/2 -z-10 w-screen -translate-x-1/2 overflow-hidden">
        <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(225,6,0,0.08), transparent 70%)" }} />
        <RotatingBackdrop photos={photos} />
        <div className="absolute inset-0 bg-gradient-to-b from-surface-0/40 via-surface-0/80 to-surface-0" />
      </div>

      <div className="grid grid-cols-1 items-center gap-8 pt-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:gap-12 lg:pt-10">
        <div className="min-w-0">
          <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-1.5 text-body-sm">
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
          <p className="text-body-sm text-secondary">
            {grandPrixName ?? "Grand Prix"}
            {(location || country) && ` · ${[location, country].filter(Boolean).join(", ")}`}
          </p>
          <h1 className="mt-2 text-display-lg font-bold text-primary sm:text-display-xl">{displayName}</h1>
          {character.length > 0 && (
            <ul aria-label="Track character" className="mt-4 flex flex-wrap gap-1.5">
              {character.map((tag) => (
                <li key={tag} className="rounded-sm border border-white/15 bg-black/20 px-2 py-0.5 text-caption text-secondary">
                  {tag}
                </li>
              ))}
            </ul>
          )}
          {answer && <Answer answer={answer} />}
        </div>
        {/* The circuit's signature, drawn large. The photography stays a dimmed backdrop: it isn't verified imagery
            yet (audit §8), and some of it is poor or wrongly rotated, so it isn't put in a frame. */}
        {drawing && (
          <div className="min-w-0">
            <CircuitCanvas drawing={drawing} className="max-h-[22rem]" caption={false} />
          </div>
        )}
      </div>

      {stats.length > 0 && (
        <dl className="mt-10 grid grid-cols-2 gap-x-6 gap-y-5 border-y border-subtle py-5 sm:grid-cols-3 lg:grid-cols-6">
          {stats.map((item) => (
            <div key={item.label} className="min-w-0">
              <dt className="truncate text-caption text-secondary" title={item.label}>
                {item.label}
              </dt>
              <dd className="mt-1 text-title-md font-semibold tabular text-primary">{item.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </header>
  );
}

function Answer({ answer }: { answer: NonNullable<HeroAnswer> }) {
  if (answer.kind === "next") {
    const { race, daysToGo, dateLabel } = answer;
    const when = daysToGo === null ? "date to be confirmed" : daysToGo <= 0 ? "this weekend" : `in ${daysToGo} ${daysToGo === 1 ? "day" : "days"}`;
    return (
      <div className="mt-8">
        <p className="text-caption text-secondary">{race.state === "next" ? "Next race" : "Coming up"} · Round {race.round}</p>
        <p className="mt-1 text-display-md font-semibold text-primary">
          {dateLabel ?? race.name}, <span className="text-brand-text">{when}</span>
        </p>
        {race.forecast && (
          <p className="mt-2 text-body-sm text-secondary">
            {Math.round(race.forecast.airTempC)}°C, {Math.round(race.forecast.rainProbability * 100)}% chance of rain
            {race.forecast.source !== "openweathermap" && <span className="text-tertiary"> · from past conditions</span>}
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
    <div className="mt-8">
      <p className="text-caption text-secondary">
        {year === race.year ? "This season" : "Last raced"} · {race.year}
        {dateLabel ? ` · ${dateLabel}` : ""}
      </p>
      <p className="mt-1 text-display-md font-semibold text-primary">
        {winner.driverName} won{winner.grid ? (winner.grid === 1 ? " from pole" : ` from P${winner.grid}`) : ""}
      </p>
      <ol className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5">
        {podium.map((p) => (
          <li key={p.driver} className="flex items-center gap-2 text-body-sm">
            <span className="tabular text-tertiary">P{p.finishPosition}</span>
            <span aria-hidden className="h-3.5 w-0.5" style={{ backgroundColor: teamColor(p.team) }} />
            <span className="text-primary">{p.driverName}</span>
            <span className="text-tertiary">{p.team}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
