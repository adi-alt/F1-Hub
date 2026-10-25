"use client";

import { RaceSectionCard } from "@/components/raceDetail/RaceSectionCard";
import { useViewerTimeZone } from "@/hooks/useViewerTimeZone";
import { formatCountdown, formatLocalTime, parseUtcDateTime } from "@/lib/countdown";
import type { PhaseSession } from "@/lib/raceWeekendPhase";
import { teamColor } from "@/lib/teamColors";
import type { RaceDoc } from "@/lib/types/race";
import { PickPanel } from "./PickPanel";

export type PickSlot = {
  fallbackEntrants: { driver: string; driverName: string; team: string }[];
  raceSessionDate: string | null;
  sessions: { label: string; date: string }[];
};

/** The reader's pick as its own visible section (id "pick", so the home page's #pick links land on it). */
export function RacePickSection({ race, pick, now, lead = false }: { race: RaceDoc; pick: PickSlot; now: number; lead?: boolean }) {
  const start = pick.raceSessionDate ? parseUtcDateTime(pick.raceSessionDate).getTime() : null;
  const countdown = start ? formatCountdown(start, now) : "";
  return (
    <RaceSectionCard
      id="pick"
      title="Your pick"
      description={lead && countdown ? `Lights out in ${countdown}. Picks lock at the start.` : "Podium, pole, fastest lap and more. Picks lock at lights out."}
      bare
    >
      <PickPanel race={race} fallbackEntrants={pick.fallbackEntrants} raceSessionDate={pick.raceSessionDate} sessions={pick.sessions} />
    </RaceSectionCard>
  );
}

/** After qualifying: the grid as it lines up, front ten. */
export function RaceGrid({ race }: { race: RaceDoc }) {
  const grid = [...(race.inputs ?? [])].filter((i) => i.grid > 0).sort((a, b) => a.grid - b.grid).slice(0, 10);
  if (grid.length === 0) return null;
  return (
    <ol className="grid gap-x-8 gap-y-1 sm:grid-cols-2" aria-label="Starting grid, front ten">
      {grid.map((d) => (
        <li key={d.driver} className="flex items-baseline gap-3 py-1 text-body-sm">
          <span className="w-6 shrink-0 tabular text-secondary">{d.grid}</span>
          <span aria-hidden className="h-3 w-0.5 shrink-0 self-center rounded-full" style={{ backgroundColor: teamColor(d.team) }} />
          <span className="min-w-0 truncate text-primary">{d.driverName}</span>
        </li>
      ))}
    </ol>
  );
}

/** A session running now: what it is and where its results land. */
export function RaceLiveNow({ session }: { session: PhaseSession }) {
  const tz = useViewerTimeZone();
  return (
    <RaceSectionCard id="live" title={`${session.label} is running`} description={`Started at ${formatLocalTime(session.date, tz)}. Picks are locked.`}>
      <p className="text-body-sm text-secondary">
        Times and the classification post to{" "}
        <a href="#sessions" className="text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring">
          Sessions
        </a>{" "}
        once it ends.
      </p>
    </RaceSectionCard>
  );
}

export type PodiumCall = { codes: readonly string[]; earned: number; possible: number };

function finishOf(race: RaceDoc, code: string): string {
  const r = race.results?.find((x) => x.driver === code);
  if (!r) return "Not classified";
  return r.status === "dnf" ? "Retired" : `Finished P${r.finishPosition}`;
}

function PodiumColumn({ label, call, race }: { label: string; call: PodiumCall; race: RaceDoc }) {
  const byCode = new Map((race.results ?? []).map((r) => [r.driver, r]));
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-body-sm font-semibold text-primary">{label}</h3>
        <p className="tabular text-body-sm text-secondary">
          <span className="text-title-md text-primary">{call.earned}</span> / {call.possible} pts
        </p>
      </div>
      <ol className="mt-3 divide-y divide-subtle">
        {call.codes.map((code, i) => {
          const r = byCode.get(code);
          const exact = r?.finishPosition === i + 1 && r.status !== "dnf";
          return (
            <li key={`${i}-${code}`} className="flex items-center gap-3 py-2 text-body-sm">
              <span className="w-6 shrink-0 tabular text-secondary">P{i + 1}</span>
              <span aria-hidden className="h-3 w-0.5 shrink-0 rounded-full" style={{ backgroundColor: teamColor(r?.team ?? "") }} />
              <span className="min-w-0 flex-1 truncate text-primary">{r?.driverName ?? code}</span>
              <span className={`shrink-0 tabular ${exact ? "font-semibold text-primary" : "text-secondary"}`}>
                {exact ? `Exact, P${i + 1}` : finishOf(race, code)}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** After the race: your podium against what actually happened, beside the model's own call. Hidden when you made no pick. */
export function YourPickResult({ race, yours, model, community }: { race: RaceDoc; yours: PodiumCall | null; model: PodiumCall | null; community: { average: number | null; count: number } }) {
  if (!yours) return null;
  const verdict =
    model === null ? `You scored ${yours.earned} of ${yours.possible} points.` : yours.earned > model.earned ? `You beat the model by ${yours.earned - model.earned} ${yours.earned - model.earned === 1 ? "point" : "points"}.` : yours.earned === model.earned ? "You matched the model." : `The model beat you by ${model.earned - yours.earned} ${model.earned - yours.earned === 1 ? "point" : "points"}.`;
  const crowd = community.average !== null && community.count > 1 ? ` The ${community.count} picks for this race averaged ${community.average} points.` : "";
  return (
    <RaceSectionCard id="your-pick" title="Your pick" description={`${verdict}${crowd}`}>
      <div className={`grid gap-8 ${model ? "sm:grid-cols-2" : ""}`}>
        <PodiumColumn label="You" call={yours} race={race} />
        {model && <PodiumColumn label="The model" call={model} race={race} />}
      </div>
    </RaceSectionCard>
  );
}
