"use client";

import { useState } from "react";
import Link from "next/link";
import { Dialog } from "@/components/ui/Dialog";
import { raceHref } from "@/lib/routes";
import { parseUtcDateTime } from "@/lib/countdown";
import { roundStatus, type HeaderStatus } from "@/lib/headerSchedule";
import { useMinuteClock } from "@/hooks/useMinuteClock";
import { EYEBROW } from "@/components/ui/panel";
import { useSeasonExplorer } from "../../_context/SeasonExplorerContext";
import { buildPredictionReview, type DriverStandingRow, type RaceSummary, type RaceWeekendStatus } from "../../_service/season.pure";
import { buildRaceInsights } from "../../_service/seasonAnalytics";
import { RaceMedia } from "./RaceMedia";
import { RaceTimeline } from "./RaceTimeline";
import { RaceWeather } from "./RaceWeather";
import { RacePredictionReview } from "./RacePredictionReview";
import { RaceApexTake } from "./RaceApexTake";

const STATUS_LABEL: Record<RaceWeekendStatus, string> = {
  upcoming: "Upcoming",
  live: "Weekend under way",
  completed: "Completed",
  cancelled: "Cancelled",
  postponed: "Postponed",
};

/**
 * The race detail window.
 *
 * Replaces the full-height right-hand drawer, which behaved like an application settings panel:
 * it covered the page edge to edge vertically, hid the content behind it, and had nothing to do
 * with the composition of the page it appeared over. This is a constrained floating window on
 * desktop (the page stays visible and legible around it) and a bottom sheet on phones, where a
 * sheet is the native idiom.
 *
 * Its open/closed state is the URL — see SeasonExplorerProvider. That is what makes a hard refresh
 * land back on the same window, a shared link open it directly, and browser back close it. Modal
 * state held in a component could do none of those.
 *
 * It is the house Dialog (R-34): focus is trapped while open and restored to the element that
 * opened it on close, and Escape or the scrim closes it.
 */
export function RaceQuickView({ season, raceSummaries, drivers }: { season: number; raceSummaries: RaceSummary[]; drivers: DriverStandingRow[] }) {
  const { openRaceRound, closeRace } = useSeasonExplorer();
  const race = openRaceRound !== null ? raceSummaries.find((r) => r.round === openRaceRound) : undefined;
  // The last race shown stays in the panel while it transitions out after closing.
  const [shown, setShown] = useState(race);
  if (race && race !== shown) setShown(race);

  if (!shown) return null;
  return (
    <Dialog
      open={!!race}
      onClose={closeRace}
      title={shown.name}
      size="xl"
      description={
        <>
          Round {shown.round}
          {shown.isSprintWeekend && " · Sprint weekend"}
          {" · "}
          {[shown.circuit, shown.country].filter(Boolean).join(", ") || "Circuit to be confirmed"}
          {shown.raceDate && ` · ${parseUtcDateTime(shown.raceDate).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}`}
        </>
      }
      footer={
        <Link
          href={raceHref(season, shown.round, shown.name)}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-control px-4 text-body-sm font-medium text-primary hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          View full race detail
          <span aria-hidden>→</span>
        </Link>
      }
    >
      <RaceQuickViewBody season={season} race={shown} drivers={drivers} />
    </Dialog>
  );
}

/** Body content, keyed off the weekend's real state. Each state shows only what is genuinely
 * knowable for it - no results for a race that hasn't run, no forecast for one that has.
 *
 * From md up: a compact map beside the status, take and insights; conditions and progress in two
 * columns beneath; then the timeline and prediction review at full width, being horizontal by
 * nature. Phones stack it all in one column and scroll. */
function RaceQuickViewBody({ season, race: loaded, drivers }: { season: number; race: RaceSummary; drivers: DriverStandingRow[] }) {
  const now = useMinuteClock();
  // The page's data was built when it loaded; re-read the weekend's sessions on the header's own clock and rule, so
  // the badge, insights and progress say what the header says this minute.
  const status = loaded.weekendStatus === "live" ? roundStatus(loaded, now) : null;
  const race: RaceSummary =
    loaded.weekendStatus !== "live"
      ? loaded
      : {
          ...loaded,
          sessions: loaded.sessions.map((s) => ({
            ...s,
            state: status?.session.startsAt === s.date ? (status.kind === "live" ? "live" : "current") : parseUtcDateTime(s.date).getTime() <= now ? "completed" : "upcoming",
          })),
        };
  const review = buildPredictionReview(race);
  const insights = buildRaceInsights(race, drivers);
  const isOff = race.weekendStatus === "cancelled" || race.weekendStatus === "postponed";

  return (
    <div className="flex flex-col gap-6">
      {/* The map is a compact block beside the details from md up (above them on phones), so everything that matters
          fits a laptop screen without scrolling. */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
        <RaceMedia photoUrls={race.photoUrls} circuitTrackMap={race.circuitTrackMap} circuitDrawing={race.circuitDrawing ?? null} raceName={race.name} circuit={race.circuit} />
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex items-center gap-2">
            <StatusPill status={race.weekendStatus} session={status} />
          </div>
          {isOff ? (
            <p className="max-w-2xl text-sm leading-relaxed text-neutral-400">
              This round is currently marked {STATUS_LABEL[race.weekendStatus].toLowerCase()}. The schedule below is the last published version; any replacement date will appear here once it is confirmed.
            </p>
          ) : (
            <>
              <RaceApexTake season={season} round={race.round} />
              {insights.length > 0 && <QuickInsights insights={insights} />}
            </>
          )}
        </div>
      </div>

      {!isOff && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-10">
          <RaceWeather race={race} />
          {race.weekendStatus === "completed" ? <QuickResults race={race} /> : <UpcomingFacts race={race} />}
        </div>
      )}

      <section>
        <p className={EYEBROW}>Weekend timeline</p>
        <div className="mt-3">
          <RaceTimeline sessions={race.sessions} />
        </div>
      </section>

      {review && <RacePredictionReview review={review} race={race} />}
    </div>
  );
}

/** Three short, computed observations. Not model output - see buildRaceInsights for why. */
function QuickInsights({ insights }: { insights: { text: string }[] }) {
  // One neutral bullet for every line: the tone was a colour with no legend, so it read as noise.
  return (
    <section>
      <p className={EYEBROW}>Quick insights</p>
      <ul className="mt-2.5 space-y-1.5">
        {insights.map((insight) => (
          <li key={insight.text} className="flex items-baseline gap-2.5 text-sm leading-relaxed text-neutral-300">
            <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-neutral-500/70" />
            <span className="min-w-0">{insight.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** What is actually known about a round that hasn't run. Never a predicted result presented as
 * fact - the prediction review only ever appears after the event. */
function UpcomingFacts({ race }: { race: RaceSummary }) {
  const running = race.sessions.find((s) => s.state === "live");
  const nextSession = race.sessions.find((s) => s.state === "current" || s.state === "upcoming");
  const completedSessions = race.sessions.filter((s) => s.state === "completed").length;

  return (
    <section>
      <p className="text-caption font-semibold uppercase tracking-[0.16em] text-tertiary">
        {race.weekendStatus === "live" ? "Weekend progress" : "Event"}
      </p>
      <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-3">
        <Fact label="Format" value={race.isSprintWeekend ? "Sprint weekend" : "Conventional"} />
        <Fact label="Sessions" value={`${completedSessions} of ${race.sessions.length} run`} />
        {running ? <Fact label="Running now" value={running.label} /> : nextSession && <Fact label="Next session" value={nextSession.label} />}
        {race.circuit && <Fact label="Circuit" value={race.circuit} />}
      </dl>
      {race.predicted && race.predicted.winner && (
        <p className="mt-3 text-caption leading-relaxed text-tertiary">
          {/* Explicitly framed as a projection, and only shown where no result exists to confuse
              it with. */}
          Apex&apos;s pre-race projection favours{" "}
          <span className="text-neutral-300">{race.predicted.winner}</span>. It is scored against the real result once the race runs.
        </p>
      )}
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-caption uppercase tracking-[0.12em] text-tertiary">{label}</dt>
      <dd className="mt-0.5 truncate text-sm text-neutral-200">{value}</dd>
    </div>
  );
}

/** Compact and hierarchical, not a results table - the full classification lives on the race
 * page, which the footer links to. The winner is deliberately several steps larger than anything
 * else here; a podium rendered as three equal rows buries the one fact people came for. */
function QuickResults({ race }: { race: RaceSummary }) {
  const rest = race.podium.filter((p) => p.position > 1);
  if (!race.winnerName && race.podium.length === 0) return null;

  return (
    <section>
      <p className="text-caption font-semibold uppercase tracking-[0.16em] text-tertiary">Result</p>

      {race.winnerName && (
        <div className="mt-2.5">
          <p className="font-mono text-caption font-semibold uppercase tracking-[0.16em] text-brand-text">Winner</p>
          <p className="mt-0.5 truncate text-2xl font-semibold tracking-[-0.01em] text-white">{race.winnerName}</p>
        </div>
      )}

      {rest.length > 0 && (
        <ol className="mt-3 space-y-1">
          {rest.map((p) => (
            <li key={p.driver} className="flex items-baseline gap-2.5 text-sm">
              <span className="w-6 shrink-0 font-mono text-caption tabular-nums text-tertiary">P{p.position}</span>
              <span className="min-w-0 truncate text-neutral-300">{p.driverName}</span>
            </li>
          ))}
        </ol>
      )}

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-white/[0.055] pt-3">
        {race.poleSitterName && <Fact label="Pole" value={race.poleSitterName} />}
        {race.fastestLap && <Fact label="Fastest lap" value={race.fastestLap.driverName} />}
      </dl>
    </section>
  );
}

/** During a weekend it names the session exactly as the header does: "Live · Qualifying", or "Qualifying in 16m". */
function StatusPill({ status, session }: { status: RaceWeekendStatus; session: HeaderStatus }) {
  const running = status === "live" && session?.kind === "live";
  const label = session ? (running ? `Live · ${session.session.label}` : `${session.session.label} in ${session.countdown}`) : STATUS_LABEL[status];
  const tone =
    status === "completed"
      ? "text-neutral-400 border-white/[0.12]"
      : status === "live" && (running || !session)
        ? "text-brand-text border-[var(--f1-red)]/40"
        : status === "cancelled" || status === "postponed"
          ? "text-amber-400 border-amber-400/35"
          : "text-neutral-300 border-white/[0.16]";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-caption font-semibold uppercase tracking-[0.12em] ${tone}`}>
      {running && <span aria-hidden className="pulse-ring h-1.5 w-1.5 rounded-full bg-[var(--f1-red)]" />}
      {label}
    </span>
  );
}
