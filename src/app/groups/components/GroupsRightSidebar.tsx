"use client";

import Image from "next/image";
import Link from "next/link";
// predictionTypeLabels from the pure groupPredictionTypes.ts, not groupPredictions.ts - the same
// nodemailer-in-client-bundle crash this session has already hit twice (see that file's own
// comment). FeedPrediction is a type-only import, which is always erased regardless of source.
import { predictionTypeLabels } from "@/lib/groupPredictionTypes";
import type { FeedPrediction } from "@/lib/supabase/groupPredictions";
import type { GroupSummary } from "@/lib/supabase/groups";
import { groupHref, raceHref } from "@/lib/routes";
import { countryFlag } from "@/lib/countryFlag";
import { formatCountdown, parseUtcDateTime } from "@/lib/countdown";
import { useMinuteClock } from "@/hooks/useMinuteClock";
import { RaceWeekendTake } from "./RaceWeekendTake";
import type { CommunityPulseData } from "@/lib/supabase/communityPulse";

export type NextRace = { year: number; round: number; name: string; raceDate: string | null; country: string | null; circuit: string | null; photoUrl: string | null } | null;

/**
 * Race-weekend context, as ONE frosted widget with internal sections - not three cards stacked
 * next to the feed, and not three pieces of bare content either.
 *
 * Every value here is real: the round/name/date/country/photo are the pipeline's own race row, the
 * countdown is that row's real `race_date` run through the same formatCountdown/useMinuteClock pair
 * PredictionCard already uses, the predictions are listMyOpenPredictions' real open rounds, and the
 * pulse widget at the bottom is real weeklyPosts/activePredictions counts getUserGroups already
 * computes for every group on this page (groupActivitySignals - a real 7-day post count off
 * group_posts, not invented). Nothing here is a placeholder; where a field is genuinely absent (a
 * calendar round the pipeline hasn't dated yet, a race with no photo) that piece simply doesn't
 * render.
 */
export function GroupsRightSidebar({
  groups,
  predictions,
  nextRace,
  pulse,
  onDiscover,
}: {
  groups: GroupSummary[];
  predictions: FeedPrediction[];
  nextRace: NextRace;
  pulse: CommunityPulseData;
  onDiscover: () => void;
}) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-white/[0.07] bg-[var(--f1-carbon)]/60 backdrop-blur-sm">
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-hide">
        <RaceWeekend race={nextRace} />

        <div className="border-t border-white/[0.06] px-4 py-3.5">
          <ActivePredictions predictions={predictions} />
        </div>

        <div className="border-t border-white/[0.06] p-3.5">
          <button
            type="button"
            onClick={onDiscover}
            className="group flex w-full items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2.5 text-left transition hover:border-white/20 hover:bg-white/[0.05]"
          >
            <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--f1-red)]/15 text-[var(--f1-red)]">
              <CompassIcon />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-400">Explore communities</span>
              <span className="mt-0.5 block truncate text-[11px] text-neutral-500">Find new communities to join</span>
            </span>
            <span className="shrink-0 text-neutral-600 transition group-hover:text-white">
              <ChevronIcon />
            </span>
          </button>
        </div>

        <div className="border-t border-white/[0.06] p-3.5">
          <CommunityPulse groups={groups} pulse={pulse} />
        </div>
      </div>
    </div>
  );
}

/**
 * A real, computed digest - not a live model call. Every number here (weeklyPosts,
 * activePredictions) is already sitting on the `groups` prop this page fetches with getUserGroups,
 * itself real (group_posts/group_predictions counts, see groupActivitySignals) - so this reuses the
 * exact same data Ask Apex's own community-index grounding builder answers from, rather than
 * standing up a second, parallel "AI summary" endpoint that fires unprompted on every homepage
 * load. Framed as Apex's own digest (its accent mark, its name) because it IS Apex's data - just
 * rendered directly instead of paraphrased through a model call nobody asked a question of yet.
 * Genuinely quiet communities get the honest "no major changes" state, never a manufactured one.
 */
function CommunityPulse({ groups, pulse }: { groups: GroupSummary[]; pulse: CommunityPulseData }) {
  const weeklyPosts = groups.reduce((sum, g) => sum + g.weeklyPosts, 0);
  const openPredictions = groups.reduce((sum, g) => sum + g.activePredictions, 0);
  const weeklyMostActive = groups.reduce<GroupSummary | null>((best, g) => (g.weeklyPosts > 0 && (!best || g.weeklyPosts > best.weeklyPosts) ? g : best), null);
  const hasActivity = weeklyPosts > 0 || openPredictions > 0;

  // Two genuinely different digests, and which one shows depends on whether there IS a previous
  // visit to diff against - not on which reads better. A returning viewer gets the delta since they
  // were last here; a first-time one gets the standing picture, because "nothing has changed since
  // your last visit" would be a claim about a visit that never happened.
  const sinceLines = pulse.hasPriorVisit
    ? [
        pulse.newPosts > 0 ? `${pulse.newPosts} new ${pulse.newPosts === 1 ? "discussion" : "discussions"}` : null,
        pulse.repliesToYou > 0 ? `${pulse.repliesToYou} new ${pulse.repliesToYou === 1 ? "reply" : "replies"} to your posts` : null,
        pulse.newPredictionEntries > 0 ? `${pulse.newPredictionEntries} new prediction ${pulse.newPredictionEntries === 1 ? "entry" : "entries"}` : null,
      ].filter((line): line is string => line !== null)
    : [];

  return (
    <div>
      <div className="flex items-center gap-1.5">
        <span aria-hidden className="text-[var(--f1-red)]">
          ✦
        </span>
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-500">Community pulse</p>
      </div>

      {pulse.hasPriorVisit ? (
        <>
          <p className="mt-2 text-[11px] text-neutral-600">Since you were last here</p>
          {sinceLines.length === 0 ? (
            <p className="mt-1.5 text-xs leading-relaxed text-neutral-600">No major changes since your last visit.</p>
          ) : (
            <ul className="mt-1.5 space-y-1.5">
              {sinceLines.map((line) => (
                <PulseLine key={line}>{line}</PulseLine>
              ))}
              {pulse.mostActive && (
                <PulseLine>
                  <Link href={groupHref(pulse.mostActive.id)} className="text-neutral-300 underline-offset-2 hover:text-white hover:underline">
                    {pulse.mostActive.name}
                  </Link>{" "}
                  has been the most active
                </PulseLine>
              )}
            </ul>
          )}
          {pulse.openPredictions > 0 && (
            <p className="mt-2 border-t border-white/[0.06] pt-2 text-xs text-neutral-500">
              {pulse.openPredictions} open prediction{pulse.openPredictions === 1 ? "" : "s"} waiting for entries
            </p>
          )}
        </>
      ) : !hasActivity ? (
        <p className="mt-2 text-xs leading-relaxed text-neutral-600">No major activity across your communities this week.</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {weeklyPosts > 0 && (
            <PulseLine>
              {weeklyPosts} new {weeklyPosts === 1 ? "discussion" : "discussions"} this week across your {groups.length === 1 ? "community" : "communities"}
            </PulseLine>
          )}
          {openPredictions > 0 && (
            <PulseLine>
              {openPredictions} open prediction{openPredictions === 1 ? "" : "s"} waiting for entries
            </PulseLine>
          )}
          {weeklyMostActive && (
            <PulseLine>
              <Link href={groupHref(weeklyMostActive.id)} className="text-neutral-300 underline-offset-2 hover:text-white hover:underline">
                {weeklyMostActive.name}
              </Link>{" "}
              is the most active community right now
            </PulseLine>
          )}
        </ul>
      )}
    </div>
  );
}

function PulseLine({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-baseline gap-2 text-xs leading-relaxed text-neutral-400">
      <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-neutral-600" />
      <span className="min-w-0">{children}</span>
    </li>
  );
}

/** The header module: the real next race, over its own real photo where the pipeline has one. The
 * countdown counts to the race itself, which is the one session time this row actually carries -
 * there is no per-session (qualifying/sprint) start time on a race row to count to, so none is
 * claimed. */
function RaceWeekend({ race }: { race: NextRace }) {
  const now = useMinuteClock();
  const raceAt = race?.raceDate ? parseUtcDateTime(race.raceDate).getTime() : null;
  const countdown = raceAt && raceAt > now ? formatCountdown(raceAt, now) : null;
  const flag = countryFlag(race?.country);

  return (
    <div className="relative">
      {race?.photoUrl && (
        <div aria-hidden className="absolute inset-0 overflow-hidden">
          <Image src={race.photoUrl} alt="" fill sizes="320px" className="object-cover opacity-45" />
          {/* Scrim, so the type on top keeps real contrast against whatever the photo happens to
              be - not a decorative gradient for its own sake. */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/75 to-[var(--f1-carbon)]" />
        </div>
      )}

      <div className="relative px-4 pb-3.5 pt-3.5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/90">Race weekend</p>

        {!race ? (
          <p className="mt-2 text-xs leading-relaxed text-neutral-500">No upcoming race is scheduled yet.</p>
        ) : (
          <>
            <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-400">Round {race.round}</p>
            <h2 className="mt-1 flex items-start gap-2 text-[17px] font-bold leading-tight tracking-[-0.01em] text-white">
              {flag && (
                <span aria-hidden className="shrink-0 text-base leading-tight">
                  {flag}
                </span>
              )}
              <span className="min-w-0">{race.name}</span>
            </h2>
            {race.raceDate && (
              <p className="mt-1 text-xs text-neutral-400">
                {new Date(race.raceDate).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
              </p>
            )}

            {countdown && (
              <p className="mt-2.5 inline-flex items-center gap-1.5 rounded-full border border-[var(--f1-red)]/30 bg-[var(--f1-red)]/[0.12] px-2.5 py-1 text-[11px] font-semibold text-[var(--f1-red)]">
                <ClockIcon />
                Lights out in {countdown}
              </p>
            )}

            <Link
              href={raceHref(race.year, race.round, race.name)}
              className="mt-3.5 flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.12] bg-white/[0.04] px-3 py-2.5 text-[13px] font-medium text-neutral-100 transition hover:border-white/25 hover:bg-white/[0.08] hover:text-white"
            >
              <CalendarIcon />
              View race
            </Link>

            {race.circuit && <RaceWeekendTake location={race.circuit} year={race.year} />}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Every prediction gets its own surface and three real lines - what it is, where it lives, and
 * what its actual state is - instead of one cramped row that put the type, the community and the
 * countdown on a single truncating line, where the countdown (the one time-sensitive thing here)
 * was always the part that got cut off.
 *
 * Nothing here is a fabricated status. listMyOpenPredictions only ever returns rows that really
 * are `status: "open"`, so no "Open" badge is claimed on top of that - the useful state is instead
 * the real one derived from data each row already carries: whether the viewer has entered
 * (`hasEntered`, a real group_prediction_entries lookup), how long until the race locks it
 * (`raceDate`, through the same formatCountdown/useMinuteClock pair PredictionCard uses), and - for
 * a round whose race has already started - that it is waiting on a result rather than still
 * counting down. A row with no raceDate makes no timing claim at all.
 */
function ActivePredictions({ predictions }: { predictions: FeedPrediction[] }) {
  const now = useMinuteClock();

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-500">Active predictions</p>
        {predictions.length > 0 && <span className="text-[11px] tabular-nums text-neutral-600">{predictions.length}</span>}
      </div>

      {predictions.length === 0 ? (
        <p className="mt-2 text-xs leading-relaxed text-neutral-600">No active predictions. New rounds open as a race weekend approaches.</p>
      ) : (
        <div className="mt-2 space-y-1.5">
          {predictions.map((p) => {
            const raceAt = p.raceDate ? parseUtcDateTime(p.raceDate).getTime() : null;
            const countdown = raceAt && raceAt > now ? formatCountdown(raceAt, now) : null;
            const awaitingResult = !!raceAt && raceAt <= now;
            // Under a day left is the point at which "when" stops being background information.
            const urgent = !!raceAt && raceAt > now && raceAt - now < 24 * 60 * 60 * 1000;
            return (
              // Deep-links straight to that community's Predictions tab - CommunityTabs puts the
              // active tab in ?tab=, so there is a real target to link to.
              <Link
                key={p.id}
                href={`${groupHref(p.groupId)}?tab=predictions`}
                className="group block rounded-xl border border-white/[0.06] bg-white/[0.03] px-2.5 py-2 transition hover:border-white/[0.14] hover:bg-white/[0.06]"
              >
                <div className="flex items-start gap-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold leading-tight text-white">{p.raceName}</span>
                    <span className="mt-0.5 block truncate text-[11px] leading-tight text-neutral-500">
                      {predictionTypeLabels[p.type]} · {p.groupName}
                    </span>
                  </span>
                  <span className="shrink-0 whitespace-nowrap rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-neutral-200">{p.entryPoints} pts</span>
                </div>

                <div className="mt-1.5 flex items-center gap-2">
                  {p.hasEntered ? (
                    <span className="flex min-w-0 items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-400/90">
                      <CheckIcon />
                      <span className="shrink-0">Entered</span>
                      {/* The pick itself, resolved to a real driver name server-side - "Entered"
                          alone doesn't tell you what you actually put money on. */}
                      {p.myGuessLabel && <span className="min-w-0 truncate font-medium normal-case tracking-normal text-neutral-400">· {p.myGuessLabel}</span>}
                    </span>
                  ) : (
                    <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Not entered</span>
                  )}

                  {countdown ? (
                    <span className={`flex min-w-0 items-center gap-1 text-[11px] tabular-nums ${urgent ? "font-semibold text-[var(--f1-red)]" : "text-neutral-500"}`}>
                      <ClockIcon />
                      <span className="truncate">Closes in {countdown}</span>
                    </span>
                  ) : awaitingResult ? (
                    <span className="min-w-0 truncate text-[11px] text-neutral-500">Awaiting result</span>
                  ) : null}

                  <span className="ml-auto shrink-0 text-neutral-700 transition group-hover:text-neutral-300">
                    <ChevronIcon />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 14 14" width="10" height="10" fill="none" aria-hidden>
      <path d="m2.8 7.4 2.6 2.6 5.8-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 12 12" width="10" height="10" fill="none" aria-hidden>
      <path d="M4.5 2.5 8 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 14 14" width="11" height="11" fill="none" aria-hidden>
      <circle cx="7" cy="7" r="5.2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M7 4.2V7l1.9 1.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden>
      <rect x="2.2" y="3.4" width="11.6" height="10.4" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M2.2 6.6h11.6M5.5 2v2.6M10.5 2v2.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function CompassIcon() {
  return (
    <svg viewBox="0 0 20 20" width="14" height="14" fill="none" aria-hidden>
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path d="m13 7-1.8 4.4a1 1 0 0 1-.6.6L6.5 13.5l1.8-4.4a1 1 0 0 1 .6-.6L13 7Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}
