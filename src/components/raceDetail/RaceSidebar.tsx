"use client";

import { useMinuteClock } from "@/hooks/useMinuteClock";
import { formatCountdown, parseUtcDateTime } from "@/lib/countdown";
import { nextSession, sessionCode } from "@/lib/sessionCode";
import { buildCircuitTimeline, computeTrackRecords, computeTopWinners, joinNames } from "@/lib/circuitIntelligence";
import { formatLapTime } from "@/lib/format";
import type { CalendarEntry } from "@/lib/supabase/calendar";
import type { ArchiveRaceDoc } from "@/lib/supabase/archive";
import type { RaceHighlights } from "@/lib/highlights";
import type { PredictionAccuracy } from "@/lib/predictionAccuracy";
import type { PersonalRaceContext } from "@/lib/personalRaceBriefing";
import type { RaceDoc } from "@/lib/types/race";

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/60 p-4">{children}</div>;
}
function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-500">{children}</p>;
}
function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-sm">
      <span className="text-neutral-500">{label}</span>
      <span className="truncate text-right font-medium text-neutral-200">{value}</span>
    </div>
  );
}

/**
 * The race page's own context rail - what complements the main column instead of repeating it.
 * Nothing here duplicates the full Race Weekend/Track Intelligence/prediction sections below it;
 * each card is a compact pointer INTO that content (a next-session countdown, not the whole
 * schedule; one circuit fact, not the full historical breakdown; a one-line prediction, not the
 * panel itself) with an anchor link down to the real thing for whoever wants it.
 *
 * Deliberately not `position: sticky` - this rail's own height varies a lot by race phase (a
 * completed race's is much shorter than an upcoming one's, which adds the schedule/prediction
 * cards below), and this page has no dedicated scroll container of its own to measure a safe
 * sticky offset against. A sticky rail that gets that wrong either overlaps the header or trails
 * off the bottom of a short viewport - both worse than a rail that simply scrolls with the page,
 * which is never wrong.
 */
export function RaceSidebar({
  race,
  isCompleted,
  calendarEntry,
  trackHistory,
  highlights,
  accuracy,
  personalContext,
}: {
  race: RaceDoc;
  isCompleted: boolean;
  calendarEntry?: CalendarEntry | null;
  trackHistory?: { liveRaces: RaceDoc[]; archiveRaces: ArchiveRaceDoc[] };
  highlights: RaceHighlights | null;
  accuracy: PredictionAccuracy | null;
  personalContext: PersonalRaceContext;
}) {
  const now = useMinuteClock();
  const upcoming = calendarEntry ? nextSession(calendarEntry.sessions, now) : null;
  const countdown = upcoming ? formatCountdown(parseUtcDateTime(upcoming.date).getTime(), now) : "";
  const remainingSessions = calendarEntry ? calendarEntry.sessions.filter((s) => parseUtcDateTime(s.date).getTime() > now) : [];

  const timeline = trackHistory ? buildCircuitTimeline(trackHistory.liveRaces, trackHistory.archiveRaces) : [];
  const records = timeline.length > 0 ? computeTrackRecords(timeline) : null;
  const topWinner = timeline.length > 0 ? computeTopWinners(timeline, 1)[0] : null;

  const winner = isCompleted ? race.results?.find((r) => r.finishPosition === 1) : undefined;
  const nameFor = (code: string) => race.inputs?.find((i) => i.driver === code)?.driverName ?? race.results?.find((r) => r.driver === code)?.driverName ?? code;
  const predictedWinner = !isCompleted && race.prediction ? [...race.prediction.finishOrder].sort((a, b) => a.predictedPosition - b.predictedPosition)[0] : null;
  const predictedPole = !isCompleted && !race.prediction && race.polePrediction ? [...race.polePrediction.order].sort((a, b) => a.predictedQualiPosition - b.predictedQualiPosition)[0] : null;

  return (
    <div className="space-y-4">
      {/* 1. Countdown / result - the one thing worth seeing without scrolling at all. */}
      <Card>
        {isCompleted ? (
          <>
            <Label>Result</Label>
            <p className="mt-1.5 text-sm text-neutral-300">{winner ? <>Winner: <span className="font-semibold text-white">{winner.driverName}</span></> : "Results posted"}</p>
          </>
        ) : upcoming ? (
          <>
            <Label>{sessionCode(upcoming.label) === "R" ? "Lights out in" : `${upcoming.label} in`}</Label>
            <p className="mt-1 font-mono text-2xl font-semibold text-white">{countdown}</p>
            <p className="mt-0.5 text-xs text-neutral-500">
              {parseUtcDateTime(upcoming.date).toLocaleString(undefined, { weekday: "long", hour: "numeric", minute: "2-digit" })} your time
            </p>
          </>
        ) : (
          <>
            <Label>Race weekend</Label>
            <p className="mt-1.5 text-sm text-neutral-500">Session schedule not yet confirmed.</p>
          </>
        )}
      </Card>

      {/* 2. Compact schedule - a pointer to the real one, not a second copy of it. */}
      {!isCompleted && remainingSessions.length > 0 && (
        <Card>
          <Label>Up next</Label>
          <div className="mt-2 space-y-1">
            {remainingSessions.slice(0, 3).map((s) => (
              <FactRow key={s.label} label={s.label} value={parseUtcDateTime(s.date).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })} />
            ))}
          </div>
          <a href="#weekend" className="mt-2 inline-block text-xs font-medium text-neutral-400 transition hover:text-white">
            Full schedule ↓
          </a>
        </Card>
      )}

      {/* 3. Key circuit facts - one or two real numbers, not the whole Track Intelligence
          breakdown that's already its own section below. */}
      <Card>
        <Label>{race.circuit}</Label>
        <div className="mt-2">
          <FactRow label="Country" value={race.country ?? "—"} />
          {isCompleted && highlights?.poleSitter && <FactRow label="Pole" value={nameFor(highlights.poleSitter)} />}
          {isCompleted && highlights?.fastestLap && <FactRow label="Fastest lap" value={formatLapTime(highlights.fastestLap.timeSec)} />}
          {!isCompleted && records?.mostWins && <FactRow label="Most wins here" value={`${joinNames(records.mostWins.drivers)} (${records.mostWins.count}x)`} />}
          {!isCompleted && !records?.mostWins && topWinner && <FactRow label="Most wins here" value={`${topWinner.driver} (${topWinner.wins}x)`} />}
        </div>
        {!isCompleted && (
          <a href="#overview" className="mt-2 inline-block text-xs font-medium text-neutral-400 transition hover:text-white">
            Full track history ↓
          </a>
        )}
      </Card>

      {/* 4. A nudge toward the real thing - the floating Ask Apex launcher (bottom-left), not a
          second chat surface. This page has already registered its own scope (RaceApexScope), so
          the launcher answers from this exact race/circuit the moment it's opened. */}
      <Card>
        <Label>Ask Apex</Label>
        <p className="mt-1.5 text-sm text-neutral-300">
          “{isCompleted ? "What decided this race?" : "Who has historically performed well here?"}”
        </p>
        <p className="mt-1 text-xs text-neutral-500">Open the Apex button in the corner to ask.</p>
      </Card>

      {/* 5. Real user data, never a guessed favorite or a fabricated accuracy number (see
          personalRaceBriefing.ts's own comment) - a useful first-time prompt in place of an empty
          personalization card when there's genuinely nothing to show yet. */}
      {personalContext.isFirstTime ? (
        <Card>
          <Label>Your race</Label>
          <p className="mt-1.5 text-sm text-neutral-300">Set a favorite driver or make a prediction to get a personal briefing here.</p>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
            <a href="/profile?section=personalisation" className="text-xs font-medium text-neutral-400 transition hover:text-white">
              Set favorites →
            </a>
            {!isCompleted && (
              <a href="#prediction" className="text-xs font-medium text-neutral-400 transition hover:text-white">
                Make a prediction →
              </a>
            )}
          </div>
        </Card>
      ) : (
        (personalContext.favoriteDriver || personalContext.favoriteTeam || personalContext.accuracy) && (
          <Card>
            <Label>Your {race.circuit} briefing</Label>
            <div className="mt-2">
              {personalContext.favoriteDriver && (
                <FactRow label={personalContext.favoriteDriver.name} value={`${personalContext.favoriteDriver.winsHere} win${personalContext.favoriteDriver.winsHere === 1 ? "" : "s"} here`} />
              )}
              {personalContext.favoriteTeam && (
                <FactRow label={personalContext.favoriteTeam.name} value={`${personalContext.favoriteTeam.winsHere} win${personalContext.favoriteTeam.winsHere === 1 ? "" : "s"} here`} />
              )}
              {personalContext.accuracy && <FactRow label="Your accuracy here" value={`${personalContext.accuracy.correct}/${personalContext.accuracy.total} correct`} />}
            </div>
          </Card>
        )
      )}

      {/* 6. One line, not the panel - the prediction/simulation/results themselves are already a
          full section in the main column; this is just enough to decide whether to go read it. */}
      {isCompleted && accuracy && (
        <Card>
          <Label>Prediction accuracy</Label>
          <p className="mt-1.5 text-sm text-neutral-300">
            Predicted <span className="font-semibold text-white">{nameFor(accuracy.predictedWinner)}</span> to win
            {accuracy.actualWinner !== accuracy.predictedWinner ? (
              <>
                {" "}
                - <span className="font-semibold text-white">{nameFor(accuracy.actualWinner)}</span> actually won.
              </>
            ) : (
              " - correct."
            )}
          </p>
          <a href="#results" className="mt-2 inline-block text-xs font-medium text-neutral-400 transition hover:text-white">
            Full comparison ↓
          </a>
        </Card>
      )}
      {!isCompleted && predictedWinner && (
        <Card>
          <Label>Model prediction</Label>
          <p className="mt-1.5 text-sm text-neutral-300">
            Favors <span className="font-semibold text-white">{nameFor(predictedWinner.driver)}</span> to win.
          </p>
          <a href="#prediction" className="mt-2 inline-block text-xs font-medium text-neutral-400 transition hover:text-white">
            Full prediction ↓
          </a>
        </Card>
      )}
      {!isCompleted && !predictedWinner && predictedPole && (
        <Card>
          <Label>Pole prediction</Label>
          <p className="mt-1.5 text-sm text-neutral-300">
            Favors <span className="font-semibold text-white">{predictedPole.driver}</span> for pole - grid not yet known.
          </p>
          <a href="#prediction" className="mt-2 inline-block text-xs font-medium text-neutral-400 transition hover:text-white">
            Full prediction ↓
          </a>
        </Card>
      )}
    </div>
  );
}
