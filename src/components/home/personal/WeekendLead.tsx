"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { DriverIdentity } from "@/components/ui/DriverIdentity";
import { Icon } from "@/components/ui/Icon";
import type { PersonalHomeData } from "@/lib/homeData";
import type { PhaseSession } from "@/lib/raceWeekendPhase";
import { raceHref } from "@/lib/routes";
import type { RaceDoc } from "@/lib/types/race";

// The hero's lead module in race-weekend mode (R-64), beside the race: the grid and the model's call
// after qualifying, the session that's on now, and after the race your points against the community's
// and the model's. Before qualifying the hero keeps its track card: the countdown and the pick lead.
// Same surface as that card, so switching phase never changes the hero's shape.

const CARD = "flex h-full min-w-0 flex-col rounded-card bg-surface-1 p-5";
const TEXT_LINK =
  "mt-auto inline-flex items-center gap-1 self-start rounded-control pt-4 text-body-sm font-medium text-secondary underline-offset-4 transition-colors duration-fast hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring";

const GRID_ROWS = 6;

/** After qualifying: the front of the grid and the race model's podium. */
export function GridAndModelLead({ race }: { race: RaceDoc }) {
  const grid = [...(race.inputs ?? [])].filter((i) => i.grid > 0).sort((a, b) => a.grid - b.grid).slice(0, GRID_ROWS);
  const byCode = new Map((race.inputs ?? []).map((i) => [i.driver, i]));
  const podium = [...(race.prediction?.finishOrder ?? [])].sort((a, b) => a.predictedPosition - b.predictedPosition).slice(0, 3);
  return (
    <section aria-labelledby="weekend-lead" className={CARD}>
      <h2 id="weekend-lead" className="text-title-md text-primary">
        The grid
      </h2>
      {grid.length === 0 ? (
        <p className="mt-1 text-body-sm text-secondary">Qualifying is done; the grid lands here once it&apos;s classified.</p>
      ) : (
        <ol className="mt-3 space-y-2">
          {grid.map((i) => (
            <li key={i.driver} className="flex items-center gap-3">
              <span className="w-6 shrink-0 text-caption tabular text-secondary">P{i.grid}</span>
              <DriverIdentity code={i.driver} name={i.driverName} team={i.team} size={24} nameVisibility="always" className="min-w-0 text-body-sm" />
            </li>
          ))}
        </ol>
      )}
      {podium.length === 3 && (
        <>
          <h3 className="mt-5 text-caption text-secondary">The model&apos;s podium</h3>
          <p className="mt-1 text-body-sm text-primary">{podium.map((p) => byCode.get(p.driver)?.driverName ?? p.driver).join(" · ")}</p>
        </>
      )}
      <Link href={raceHref(race.year, race.round, race.name, "simulation")} className={TEXT_LINK}>
        Grid and model
        <Icon icon={ArrowRight} size={16} />
      </Link>
    </section>
  );
}

/** A session running now. */
export function LiveLead({ race, session }: { race: RaceDoc; session: PhaseSession }) {
  return (
    <section aria-labelledby="weekend-lead" className={CARD}>
      <p className="flex items-center gap-1.5 text-caption text-brand-text">
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-brand motion-safe:animate-pulse" />
        On now
      </p>
      <h2 id="weekend-lead" className="mt-1 text-title-lg text-primary">
        {session.label}
      </h2>
      <p className="mt-1 text-body-sm text-secondary">Follow it on the race page: the order, the gaps and the model as it runs.</p>
      <Link href={raceHref(race.year, race.round, race.name)} className={TEXT_LINK}>
        Follow it live
        <Icon icon={ArrowRight} size={16} />
      </Link>
    </section>
  );
}

/** After the race: your points against the community's average and the model's. */
export function OutcomeLead({ scores }: { scores: NonNullable<PersonalHomeData["lastRaceScores"]> }) {
  const figures = [
    { label: "You", value: scores.you, detail: scores.you === null ? "No pick" : null },
    { label: "Community", value: scores.communityAverage, detail: scores.communityCount ? `Average of ${scores.communityCount}` : "No picks" },
    { label: "Model", value: scores.model, detail: scores.model === null ? "No call" : null },
  ];
  return (
    <section aria-labelledby="weekend-lead" className={CARD}>
      <h2 id="weekend-lead" className="text-title-md text-primary">
        {scores.raceName.replace(/ Grand Prix$/, "")} points
      </h2>
      <p className="text-caption text-secondary">Out of {scores.max}</p>
      <dl className="mt-4 grid grid-cols-3 gap-3">
        {figures.map((f) => (
          <div key={f.label} className="min-w-0">
            <dt className="text-caption text-secondary">{f.label}</dt>
            <dd className="mt-0.5 text-title-lg tabular text-primary">{f.value ?? "–"}</dd>
            {f.detail && <dd className="text-caption text-tertiary">{f.detail}</dd>}
          </div>
        ))}
      </dl>
      <Link href={`${raceHref(scores.year, scores.round, scores.raceName)}#results`} className={TEXT_LINK}>
        See how you did
        <Icon icon={ArrowRight} size={16} />
      </Link>
    </section>
  );
}
