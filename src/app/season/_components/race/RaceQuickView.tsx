"use client";

import { useState } from "react";
import Link from "next/link";
import { Dialog } from "@/components/ui/Dialog";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { raceHref } from "@/lib/routes";
import { formatCountdown, parseUtcDateTime } from "@/lib/countdown";
import { roundStatus, type HeaderStatus } from "@/lib/headerSchedule";
import { useMinuteClock } from "@/hooks/useMinuteClock";
import { EYEBROW, PANEL } from "@/components/ui/panel";
import { ensureVisible } from "@/lib/colorContrast";
import { teamColor } from "@/lib/teamColors";
import { useSeasonExplorer } from "../../_context/SeasonExplorerContext";
import { buildPredictionReview, sessionKind, type DriverStandingRow, type RaceSummary, type RaceWeekendStatus } from "../../_service/season.pure";
import { buildRaceInsights } from "../../_service/seasonAnalytics";
import { RaceMedia } from "./RaceMedia";
import { RaceTimeline } from "./RaceTimeline";
import { RaceWeather } from "./RaceWeather";
import { RacePredictionReview } from "./RacePredictionReview";
import { RaceApexTake } from "./RaceApexTake";

const STATUS: Record<RaceWeekendStatus, { label: string; tone: BadgeTone }> = {
  upcoming: { label: "Upcoming", tone: "neutral" },
  // Between sessions nothing is running: the weekend has started, but it is not "live".
  live: { label: "Race weekend", tone: "info" },
  completed: { label: "Completed", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "warning" },
  postponed: { label: "Postponed", tone: "warning" },
};

/**
 * The race window over the Season page: a floating dialog on desktop, a bottom sheet idiom on phones. Its
 * open/closed state is the URL (SeasonExplorerProvider), so a refresh, a shared link and browser back all work.
 *
 * One composition for every state: a header (name, round, where and when, one status badge); a hero row with the
 * race photo or the circuit map beside the one thing that matters now (the countdown before the race, the podium
 * after it); then the details grouped under quiet eyebrows. The panel has a fixed maximum height and the body
 * scrolls inside it, so the window never grows to the edge of the screen.
 */
export function RaceQuickView({ season, raceSummaries, drivers }: { season: number; raceSummaries: RaceSummary[]; drivers: DriverStandingRow[] }) {
  const { openRaceRound, closeRace } = useSeasonExplorer();
  const race = openRaceRound !== null ? raceSummaries.find((r) => r.round === openRaceRound) : undefined;
  // The last race shown stays in the panel while it transitions out after closing.
  const [shown, setShown] = useState(race);
  if (race && race !== shown) setShown(race);
  const now = useMinuteClock();

  if (!shown) return null;
  const live = shown.weekendStatus === "live" ? roundStatus(shown, now) : null;
  const status = live?.kind === "live" ? { label: `Live · ${live.session.label}`, tone: "live" as const } : STATUS[shown.weekendStatus];
  const where = [shown.circuit, shown.country].filter(Boolean).join(", ") || "Circuit to be confirmed";
  return (
    <Dialog
      open={!!race}
      onClose={closeRace}
      title={shown.name}
      size="xl"
      maxHeight="46rem"
      description={
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Badge tone={status.tone}>{status.label}</Badge>
          <span>
            Round {shown.round}
            {shown.isSprintWeekend && " · Sprint weekend"} · {where}
            {shown.raceDate && ` · ${parseUtcDateTime(shown.raceDate).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}`}
          </span>
        </span>
      }
      footer={
        <Link
          href={raceHref(season, shown.round, shown.name)}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-control px-4 text-body-sm font-medium text-primary hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          Open the race page
          <span aria-hidden>→</span>
        </Link>
      }
    >
      <RaceQuickViewBody season={season} race={shown} drivers={drivers} now={now} live={live} />
    </Dialog>
  );
}

/** The body, keyed off the weekend's real state: no results for a race that hasn't run, no forecast for one that has. */
function RaceQuickViewBody({ season, race: loaded, drivers, now, live }: { season: number; race: RaceSummary; drivers: DriverStandingRow[]; now: number; live: HeaderStatus }) {
  // The page's data was built when it loaded; re-read the weekend's sessions on the header's own clock and rule, so
  // the countdown, insights and timeline say what the header says this minute.
  const race: RaceSummary =
    loaded.weekendStatus !== "live"
      ? loaded
      : {
          ...loaded,
          sessions: loaded.sessions.map((s) => ({
            ...s,
            state: live?.session.startsAt === s.date ? (live.kind === "live" ? "live" : "current") : parseUtcDateTime(s.date).getTime() <= now ? "completed" : "upcoming",
          })),
        };
  const review = buildPredictionReview(race);
  const insights = buildRaceInsights(race, drivers);
  const isOff = race.weekendStatus === "cancelled" || race.weekendStatus === "postponed";
  const completed = race.weekendStatus === "completed";

  return (
    <div className="flex flex-col gap-8 pb-2">
      {/* Hero: the race's picture beside the one thing that matters now. */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <RaceMedia photoUrls={race.photoUrls} circuitTrackMap={race.circuitTrackMap} circuitDrawing={race.circuitDrawing ?? null} raceName={race.name} circuit={race.circuit} />
        <div className={`${PANEL} flex min-w-0 flex-col justify-center p-5`}>
          {isOff ? (
            <OffBlock status={race.weekendStatus} />
          ) : completed ? (
            <PodiumBlock race={race} />
          ) : (
            <CountdownBlock race={race} now={now} live={live} />
          )}
        </div>
      </div>

      {!isOff && (
        <section aria-label="Apex on this race" className="flex flex-col gap-5">
          <RaceApexTake season={season} round={race.round} />
          {insights.length > 0 && <QuickInsights insights={insights} />}
        </section>
      )}

      {!isOff && (
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          <RaceWeather race={race} />
          {!completed && <EventFacts race={race} />}
        </div>
      )}

      <section>
        <h3 className={EYEBROW}>Weekend timeline</h3>
        <div className="mt-3">
          <RaceTimeline sessions={race.sessions} />
        </div>
      </section>

      {review && <RacePredictionReview review={review} race={race} />}
    </div>
  );
}

function OffBlock({ status }: { status: RaceWeekendStatus }) {
  return (
    <>
      <p className={EYEBROW}>{STATUS[status].label}</p>
      <p className="mt-3 text-body-sm text-secondary">
        This round is marked {STATUS[status].label.toLowerCase()}. The schedule below is the last one published; a new date appears here once it is confirmed.
      </p>
    </>
  );
}

/** Before the race: lights out, as a countdown, and the next session when that comes first. */
function CountdownBlock({ race, now, live }: { race: RaceSummary; now: number; live: HeaderStatus }) {
  const raceSession = race.sessions.find((s) => sessionKind(s.code) === "race");
  const start = raceSession ? parseUtcDateTime(raceSession.date) : race.raceDate ? parseUtcDateTime(race.raceDate) : null;
  const countdown = start ? formatCountdown(start.getTime(), now) : "";
  const next = live && live.session.startsAt !== raceSession?.date ? live : null;
  return (
    <>
      <p className={EYEBROW}>{countdown ? "Lights out in" : "Lights out"}</p>
      <p className="mt-3 text-display-md tabular text-primary">{countdown || (start ? "Race day" : "To be confirmed")}</p>
      {start && (
        <p suppressHydrationWarning className="mt-1 text-body-sm text-secondary">
          {start.toLocaleString(undefined, { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}
        </p>
      )}
      {next && (
        <p className="mt-5 border-t border-subtle pt-3 text-body-sm text-secondary">
          {next.kind === "live" ? (
            <>
              <span className="font-medium text-primary">{next.session.label}</span> is running now
            </>
          ) : (
            <>
              Next: <span className="font-medium text-primary">{next.session.label}</span> in {next.countdown}
            </>
          )}
        </p>
      )}
      {race.predicted?.winner && (
        <p className="mt-3 text-caption text-tertiary">
          The model&apos;s pick to win: <span className="text-secondary">{race.predicted.winner}</span>
        </p>
      )}
    </>
  );
}

/** After the race: the winner first and largest, P2 and P3 beneath, then pole and fastest lap. */
function PodiumBlock({ race }: { race: RaceSummary }) {
  const winner = race.podium.find((p) => p.position === 1);
  const rest = race.podium.filter((p) => p.position > 1).sort((a, b) => a.position - b.position);
  if (!winner && !race.winnerName) return <p className="text-body-sm text-secondary">The classification is not in yet.</p>;
  return (
    <>
      <p className={EYEBROW}>Winner</p>
      <div className="mt-3 flex items-center gap-3">
        <TeamBar team={winner?.team} tall />
        <div className="min-w-0">
          <p className="truncate text-title-lg text-primary">{winner?.driverName ?? race.winnerName}</p>
          {winner?.team && <p className="truncate text-body-sm text-secondary">{winner.team}</p>}
        </div>
      </div>
      {rest.length > 0 && (
        <ol className="mt-5 space-y-2 border-t border-subtle pt-3">
          {rest.map((p) => (
            <li key={p.driver} className="flex items-center gap-3 text-body-sm">
              <span className="w-6 shrink-0 tabular text-tertiary">P{p.position}</span>
              <TeamBar team={p.team} />
              <span className="min-w-0 truncate text-primary">{p.driverName}</span>
            </li>
          ))}
        </ol>
      )}
      {(race.poleSitterName || race.fastestLap) && (
        <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-subtle pt-3">
          {race.poleSitterName && <Fact label="Pole" value={race.poleSitterName} />}
          {race.fastestLap && <Fact label="Fastest lap" value={race.fastestLap.driverName} />}
        </dl>
      )}
    </>
  );
}

function TeamBar({ team, tall = false }: { team?: string | null; tall?: boolean }) {
  return <span aria-hidden className={`w-[3px] shrink-0 rounded-full ${tall ? "h-10" : "h-4"}`} style={{ backgroundColor: team ? ensureVisible(teamColor(team)) : "transparent" }} />;
}

/** Three short, computed observations. Not model output - see buildRaceInsights for why. */
function QuickInsights({ insights }: { insights: { text: string }[] }) {
  return (
    <div>
      <h3 className={EYEBROW}>Quick insights</h3>
      <ul className="mt-3 space-y-2">
        {insights.map((insight) => (
          <li key={insight.text} className="flex items-baseline gap-3 text-body-sm text-secondary">
            <span aria-hidden className="h-1 w-1 shrink-0 -translate-y-0.5 rounded-full bg-white/30" />
            <span className="min-w-0">{insight.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** What is actually known about a round that hasn't run. */
function EventFacts({ race }: { race: RaceSummary }) {
  const completedSessions = race.sessions.filter((s) => s.state === "completed").length;
  return (
    <section>
      <h3 className={EYEBROW}>{race.weekendStatus === "live" ? "Weekend progress" : "Event"}</h3>
      <dl className="mt-3 grid grid-cols-2 gap-x-5 gap-y-3">
        <Fact label="Format" value={race.isSprintWeekend ? "Sprint weekend" : "Conventional"} />
        <Fact label="Sessions run" value={`${completedSessions} of ${race.sessions.length}`} />
      </dl>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-caption text-tertiary">{label}</dt>
      <dd className="mt-1 truncate text-body-sm text-primary">{value}</dd>
    </div>
  );
}
