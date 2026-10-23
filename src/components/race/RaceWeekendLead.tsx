"use client";

import { RaceSectionCard } from "@/components/raceDetail/RaceSectionCard";
import { useViewerTimeZone } from "@/hooks/useViewerTimeZone";
import { formatCountdown, formatLocalTime, parseUtcDateTime } from "@/lib/countdown";
import type { PhaseSession } from "@/lib/raceWeekendPhase";
import type { RaceWeekendScores } from "@/lib/raceWeekendScores";
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

function Figure({ label, value, max }: { label: string; value: number | null; max: number }) {
  return (
    <div>
      <dt className="text-caption text-secondary">{label}</dt>
      <dd className="mt-1 text-title-md tabular text-primary">
        {value === null ? "–" : value}
        {value !== null && <span className="text-body-sm text-secondary"> / {max}</span>}
      </dd>
    </div>
  );
}

/** After the race: your points, the community's average and the model's, scored the same way. */
export function RaceWeekendScoresSection({ scores }: { scores: RaceWeekendScores }) {
  if (scores.you === null && scores.communityAverage === null && scores.model === null) return null;
  return (
    <RaceSectionCard
      id="your-weekend"
      title="Your weekend"
      description={scores.you === null ? "You didn't make a pick for this race." : scores.communityCount > 0 ? `Against ${scores.communityCount} ${scores.communityCount === 1 ? "pick" : "picks"} from the community.` : undefined}
    >
      <dl className="grid grid-cols-3 gap-5">
        <Figure label="Your points" value={scores.you} max={scores.max} />
        <Figure label="Community average" value={scores.communityAverage} max={scores.max} />
        <Figure label="The model" value={scores.model} max={scores.max} />
      </dl>
    </RaceSectionCard>
  );
}
