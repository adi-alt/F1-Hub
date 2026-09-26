"use client";

import Link from "next/link";
import { useMinuteClock } from "@/hooks/useMinuteClock";
import { formatCountdown, parseUtcDateTime } from "@/lib/countdown";
import { liveSession, nextSession, sessionCode } from "@/lib/sessionCode";
import { EntityAvatar } from "@/components/EntityAvatar";
import { groupHref } from "@/lib/routes";
import type { RaceCommunityCard } from "@/lib/groupPredictionTypes";
import type { CalendarEntry } from "@/lib/supabase/calendar";
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
function Divider() {
  return <div className="my-3 border-t border-white/[0.06]" />;
}

/**
 * The race page's own context rail - deliberately NOT a second copy of the countdown, schedule and
 * circuit stats the main column already owns (RaceWeekendPanel, Race History & Records). Three
 * modules, each something the main column genuinely doesn't already say:
 *   1. "Your race" - one merged card (not several) for the single most current fact (countdown/
 *      live/result) plus this specific person's own stake in it (their prediction, their
 *      accuracy here, their favorite driver/team's record here) - real user data only, see
 *      personalRaceBriefing.ts's own comment on why nothing here is ever a guessed favorite.
 *   2. "Trending in this race" - a compact preview of the SAME real communities data
 *      RaceCommunitiesSection renders in full below (passed down from the same server fetch, not
 *      a second query), so this rail surfaces it without requiring a scroll past Race Story first.
 *   3. Ask Apex - the one action, not information; a nudge toward the floating launcher already on
 *      this page rather than a second chat surface.
 * There is no "friends' picks" module: this app has no per-user following/friends system, only
 * community membership - inventing one here would be exactly the fabricated-data problem this
 * page's personalization already goes out of its way to avoid elsewhere.
 *
 * The sticky positioning itself lives on the caller's own `<aside>` wrapper (SeasonRaceDashboard),
 * not here - this component only ever renders the cards, and only applies at `lg:` and up; below
 * that breakpoint the caller's grid already places this in normal document flow after the main
 * column, not as a separate sticky/narrow panel.
 */
export function RaceSidebar({
  race,
  isCompleted,
  calendarEntry,
  accuracy,
  personalContext,
  communities,
}: {
  race: RaceDoc;
  isCompleted: boolean;
  calendarEntry?: CalendarEntry | null;
  accuracy: PredictionAccuracy | null;
  personalContext: PersonalRaceContext;
  communities: RaceCommunityCard[];
}) {
  const now = useMinuteClock();
  const upcoming = calendarEntry ? nextSession(calendarEntry.sessions, now) : null;
  const live = calendarEntry ? liveSession(calendarEntry.sessions, now) : null;
  const countdown = upcoming ? formatCountdown(parseUtcDateTime(upcoming.date).getTime(), now) : "";

  const winner = isCompleted ? race.results?.find((r) => r.finishPosition === 1) : undefined;
  const nameFor = (code: string) => race.inputs?.find((i) => i.driver === code)?.driverName ?? race.results?.find((r) => r.driver === code)?.driverName ?? code;
  const predictedWinner = !isCompleted && race.prediction ? [...race.prediction.finishOrder].sort((a, b) => a.predictedPosition - b.predictedPosition)[0] : null;
  const predictedPole = !isCompleted && !race.prediction && race.polePrediction ? [...race.polePrediction.order].sort((a, b) => a.predictedQualiPosition - b.predictedQualiPosition)[0] : null;

  const hasPersonalization = personalContext.favoriteDriver || personalContext.favoriteTeam || personalContext.accuracy;

  return (
    <div className="space-y-4">
      {/* 1. "Your race" - the current moment, this person's own prediction, and their own record
          here, as one card with hairline-divided rows instead of four separate boxes repeating
          the same "Label + value" shape down the rail. Any row with nothing real to show is
          simply omitted, never left as an empty divider. */}
      <Card>
        {isCompleted ? (
          <>
            <Label>Result</Label>
            <p className="mt-1.5 text-sm text-neutral-300">{winner ? <>Winner: <span className="font-semibold text-white">{winner.driverName}</span></> : "Results posted"}</p>
            {/* Real pipeline provenance (race.resultsSource), not a guess - "openf1_preliminary"
                means this came from live timing ahead of the FIA's own official classification,
                and can still change (a post-race steward decision can reorder it). */}
            {race.resultsSource === "openf1_preliminary" && <p className="mt-1 text-xs text-amber-400">Preliminary - pending official classification</p>}
          </>
        ) : live ? (
          <>
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-400">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald-400 motion-safe:animate-pulse" />
              Live now
            </p>
            <p className="mt-1 text-xl font-semibold text-white">{live.label}</p>
            <p className="mt-0.5 text-xs text-neutral-500">Session in progress (estimated) - see Race Weekend below for the full schedule.</p>
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

        {isCompleted && accuracy && (
          <>
            <Divider />
            <Label>Your prediction</Label>
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
            <a href="#results" className="mt-1.5 inline-block text-xs font-medium text-neutral-400 transition hover:text-white">
              Full comparison ↓
            </a>
          </>
        )}
        {!isCompleted && predictedWinner && (
          <>
            <Divider />
            <Label>Model prediction</Label>
            <p className="mt-1.5 text-sm text-neutral-300">
              Favors <span className="font-semibold text-white">{nameFor(predictedWinner.driver)}</span> to win.
            </p>
            <a href="#prediction" className="mt-1.5 inline-block text-xs font-medium text-neutral-400 transition hover:text-white">
              Full prediction ↓
            </a>
          </>
        )}
        {!isCompleted && !predictedWinner && predictedPole && (
          <>
            <Divider />
            <Label>Pole prediction</Label>
            <p className="mt-1.5 text-sm text-neutral-300">
              Favors <span className="font-semibold text-white">{predictedPole.driver}</span> for pole - grid not yet known.
            </p>
            <a href="#prediction" className="mt-1.5 inline-block text-xs font-medium text-neutral-400 transition hover:text-white">
              Full prediction ↓
            </a>
          </>
        )}

        {/* Real user data, never a guessed favorite or a fabricated accuracy number (see
            personalRaceBriefing.ts's own comment) - a useful first-time prompt in place of an
            empty personalization row when there's genuinely nothing to show yet. */}
        {personalContext.isFirstTime ? (
          <>
            <Divider />
            <Label>Your race</Label>
            <p className="mt-1.5 text-sm text-neutral-300">Set a favorite driver or make a prediction to get a personal briefing here.</p>
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
              <Link href="/profile?section=personalisation" className="text-xs font-medium text-neutral-400 transition hover:text-white">
                Set favorites →
              </Link>
              {!isCompleted && (
                <a href="#prediction" className="text-xs font-medium text-neutral-400 transition hover:text-white">
                  Make a prediction →
                </a>
              )}
            </div>
          </>
        ) : (
          hasPersonalization && (
            <>
              <Divider />
              <Label>Your {race.circuit} record</Label>
              <div className="mt-1.5">
                {personalContext.favoriteDriver && (
                  <FactRow label={personalContext.favoriteDriver.name} value={`${personalContext.favoriteDriver.winsHere} win${personalContext.favoriteDriver.winsHere === 1 ? "" : "s"} here`} />
                )}
                {personalContext.favoriteTeam && (
                  <FactRow label={personalContext.favoriteTeam.name} value={`${personalContext.favoriteTeam.winsHere} win${personalContext.favoriteTeam.winsHere === 1 ? "" : "s"} here`} />
                )}
                {personalContext.accuracy && <FactRow label="Your accuracy here" value={`${personalContext.accuracy.correct}/${personalContext.accuracy.total} correct`} />}
              </div>
            </>
          )
        )}
      </Card>

      {/* 2. A compact preview of the SAME real communities data RaceCommunitiesSection renders in
          full further down the main column - not a second fetch, not an invented "trending" signal
          (see that component's own comment on why the underlying list is never fabricated). Only
          ever the top couple of rows; "See all" points at the full section already on this page. */}
      {communities.length > 0 && (
        <Card>
          <div className="flex items-center justify-between gap-2">
            <Label>Trending in this race</Label>
            <a href="#communities" className="text-xs font-medium text-neutral-400 transition hover:text-white">
              See all →
            </a>
          </div>
          <div className="mt-2 space-y-2">
            {communities.slice(0, 2).map((c) => {
              const href = c.prediction ? `${groupHref(c.groupId)}?tab=predictions` : groupHref(c.groupId);
              const actionLabel = c.prediction ? (c.isMember ? "View" : "Join & predict") : c.isMember ? "Open" : "Explore";
              return (
                <Link
                  key={c.groupId}
                  href={href}
                  className="flex items-center gap-2.5 rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5 transition hover:border-white/20 hover:bg-white/[0.05]"
                >
                  <EntityAvatar imageUrl={c.avatarUrl} name={c.name} seed={c.groupId} size={30} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">{c.name}</p>
                    <p className="text-xs text-neutral-500">
                      {c.memberCount} {c.memberCount === 1 ? "member" : "members"}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-medium text-neutral-400">{actionLabel} →</span>
                </Link>
              );
            })}
          </div>
        </Card>
      )}

      {/* 3. A nudge toward the real thing - the floating Ask Apex launcher (bottom-left), not a
          second chat surface. This page has already registered its own scope (RaceApexScope), so
          the launcher answers from this exact race/circuit the moment it's opened. */}
      <Card>
        <Label>Ask Apex</Label>
        <p className="mt-1.5 text-sm text-neutral-300">
          “{isCompleted ? "What decided this race?" : "Who has historically performed well here?"}”
        </p>
        <p className="mt-1 text-xs text-neutral-500">Open the Apex button in the corner to ask.</p>
      </Card>
    </div>
  );
}
