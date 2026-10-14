"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { Calendar, Check, ChevronRight, Clock, MessageSquare, Reply, Sparkles, TrendingUp } from "lucide-react";
// predictionTypeLabels from the pure groupPredictionTypes.ts, not groupPredictions.ts - the same
// nodemailer-in-client-bundle crash this session has already hit twice (see that file's own
// comment). FeedPrediction is a type-only import, which is always erased regardless of source.
import { predictionStateAt, predictionTypeLabels } from "@/lib/groupPredictionTypes";
import type { FeedPrediction } from "@/lib/supabase/groupPredictions";
import type { GroupSummary } from "@/lib/supabase/groups";
import { groupHref, raceHref } from "@/lib/routes";
import { countryFlag } from "@/lib/countryFlag";
import { formatCountdown, parseUtcDateTime } from "@/lib/countdown";
import { useMinuteClock } from "@/hooks/useMinuteClock";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { RaceWeekendTake } from "./RaceWeekendTake";
import { PredictionTrendBars } from "./post/PredictionTrendBars";
import type { CommunityPulseData } from "@/lib/supabase/communityPulse";

export type NextRace = { year: number; round: number; name: string; raceDate: string | null; country: string | null; circuit: string | null; photoUrl: string | null } | null;

/**
 * Race-weekend context, as ONE frosted widget with internal sections - not three cards stacked
 * next to the feed, and not three pieces of bare content either.
 *
 * Every value here is real: the round/name/date/country/photo are the pipeline's own race row, the
 * countdown is that row's real `race_date` run through the same formatCountdown/useMinuteClock pair
 * PredictionCard already uses, the predictions are listMyPredictions' real open (and recently-resolved) rounds, and the
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
}: {
  groups: GroupSummary[];
  predictions: FeedPrediction[];
  nextRace: NextRace;
  pulse: CommunityPulseData;
}) {
  return (
    // One surface with internal rules, not five floating cards: the rail reads as a single column
    // of race context whose sections are separated by hairlines, the same way the rest of F1 HUB
    // groups related blocks. Explore sits last because it leaves the page - everything above it is
    // about what's already happening.
    <div data-tour="race-weekend" className="surface-glass flex flex-col overflow-hidden rounded-card border border-white/10 xl:max-h-[calc(100dvh-6rem)]">
      <div className="min-h-0 overflow-y-auto scrollbar-hide">
        <RaceWeekend race={nextRace} />
        <div className="border-t border-white/10 p-4">
          <ActivePredictions predictions={predictions} />
        </div>
        <div className="border-t border-white/10 p-4">
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

  // Two genuinely different digests, and which one shows depends on whether there IS a previous
  // visit to diff against - not on which reads better. A returning viewer gets the delta since they
  // were last here; a first-time one gets the standing picture, because "nothing has changed since
  // your last visit" would be a claim about a visit that never happened.
  //
  // Every row is {count, label} rather than a sentence: the number is the thing being scanned, so
  // it gets the weight and a column of its own, and rows with a zero count are dropped entirely
  // rather than rendered as "0 new discussions".
  const rows = pulse.hasPriorVisit
    ? [
        { key: "posts", tone: "sky" as const, icon: <Icon icon={MessageSquare} size={16} className="size-3" />, count: pulse.newPosts, label: pulse.newPosts === 1 ? "new discussion" : "new discussions" },
        { key: "replies", tone: "emerald" as const, icon: <Icon icon={Reply} size={16} className="size-3" />, count: pulse.repliesToYou, label: pulse.repliesToYou === 1 ? "reply to your posts" : "replies to your posts" },
        { key: "entries", tone: "amber" as const, icon: <Icon icon={TrendingUp} size={16} className="size-3" />, count: pulse.newPredictionEntries, label: pulse.newPredictionEntries === 1 ? "new prediction entry" : "new prediction entries" },
      ].filter((r) => r.count > 0)
    : [
        { key: "posts", tone: "sky" as const, icon: <Icon icon={MessageSquare} size={16} className="size-3" />, count: weeklyPosts, label: weeklyPosts === 1 ? "discussion this week" : "discussions this week" },
        { key: "open", tone: "amber" as const, icon: <Icon icon={TrendingUp} size={16} className="size-3" />, count: openPredictions, label: openPredictions === 1 ? "open prediction" : "open predictions" },
      ].filter((r) => r.count > 0);

  const trending = pulse.hasPriorVisit ? pulse.mostActive : weeklyMostActive ? { id: weeklyMostActive.id, name: weeklyMostActive.name } : null;

  return (
    <div>
      <h3 className="flex items-center gap-1.5 text-body-sm font-semibold text-primary">
        <Icon icon={Sparkles} size={16} className="text-tertiary" />
        Community pulse
      </h3>
      <p className="mt-0.5 text-caption text-tertiary">{pulse.hasPriorVisit ? "Since you were last here" : "Across your communities"}</p>

      {rows.length === 0 && !trending && !pulse.mostDiscussed && !pulse.predictionPulse ? (
        <p className="mt-3 text-caption text-secondary">
          {pulse.hasPriorVisit ? "You're caught up. No major changes since your last visit." : "No activity across your communities yet."}
        </p>
      ) : (
        <>
          {rows.length > 0 && (
            <ul className="mt-3 space-y-2">
              {/* Staggered, not all at once: the rows are a short list of counts, and letting
                  them arrive in order is what makes the widget read as being filled in rather
                  than as having always been there. 40ms apart - enough to see, not enough to
                  wait for. */}
              {rows.map((r, i) => (
                <motion.li
                  key={r.key}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.28, ease: [0.2, 0, 0, 1], delay: i * 0.04 }}
                  className="flex items-center gap-2"
                >
                  <span aria-hidden className={`flex size-6 shrink-0 items-center justify-center rounded-control ${TONE[r.tone]}`}>
                    {r.icon}
                  </span>
                  <span className="text-body-sm font-semibold tabular text-primary">{r.count}</span>
                  <span className="min-w-0 flex-1 truncate text-caption text-secondary">{r.label}</span>
                </motion.li>
              ))}
              {trending && (
                <motion.li
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.28, ease: [0.2, 0, 0, 1], delay: rows.length * 0.04 }}
                  className="flex items-center gap-2"
                >
                  <span aria-hidden className="flex size-6 shrink-0 items-center justify-center rounded-control bg-surface-3 text-secondary">
                    <Icon icon={TrendingUp} size={16} className="size-3" />
                  </span>
                  <Link href={groupHref(trending.id)} className="min-w-0 flex-1 truncate text-caption text-secondary underline-offset-2 hover:text-primary hover:underline">
                    {trending.name} is trending
                  </Link>
                </motion.li>
              )}
            </ul>
          )}

          {/* Named, not counted: the widget points at one real conversation to go and read. The
              link opens that post's own discussion on its community page. */}
          {pulse.mostDiscussed && (
            <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: [0.2, 0, 0, 1], delay: (rows.length + 1) * 0.04 }}>
            <Link href={`${groupHref(pulse.mostDiscussed.groupId)}?post=${pulse.mostDiscussed.postId}`} className="mt-3 block border-t border-white/10 pt-3 transition-opacity duration-fast hover:opacity-80">
              <p className="text-caption text-tertiary">Most discussed</p>
              <p className="mt-0.5 line-clamp-2 text-body-sm text-primary">{pulse.mostDiscussed.excerpt}</p>
              <p className="mt-0.5 text-caption tabular text-tertiary">
                {pulse.mostDiscussed.comments} {pulse.mostDiscussed.comments === 1 ? "reply" : "replies"}
              </p>
            </Link>
            </motion.div>
          )}

          {/* A real split from real entries - the leading pick and its actual share, only once
              enough people have entered for that to mean anything. */}
          {pulse.predictionPulse && (
            <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: [0.2, 0, 0, 1], delay: (rows.length + 2) * 0.04 }}>
            <Link href={`${groupHref(pulse.predictionPulse.groupId)}?tab=predictions`} className="mt-3 block border-t border-white/10 pt-3 transition-opacity duration-fast hover:opacity-80">
              <p className="text-caption text-tertiary">Prediction activity</p>
              <p className="mt-0.5 text-body-sm text-secondary">
                <span className="font-semibold text-primary">{pulse.predictionPulse.pct}%</span> backing {pulse.predictionPulse.leader}
              </p>
              {/* The share, drawn - the same bar language the prediction cards in the feed use,
                  so "62% backing Norris" is something you can see the size of rather than only
                  read. It grows from zero on arrival, which is the motion this widget was
                  missing entirely. */}
              <span className="mt-2 block h-1 overflow-hidden rounded-full bg-surface-3" role="presentation">
                <motion.span
                  initial={{ width: 0 }}
                  animate={{ width: `${pulse.predictionPulse.pct}%` }}
                  transition={{ duration: 0.5, ease: [0.2, 0, 0, 1], delay: (rows.length + 2) * 0.04 + 0.1 }}
                  className="block h-full rounded-full bg-primary/80"
                />
              </span>
              <p className="mt-1 truncate text-caption text-tertiary">
                {pulse.predictionPulse.raceName} · {pulse.predictionPulse.total} entries
              </p>
            </Link>
            </motion.div>
          )}
        </>
      )}
    </div>
  );
}

/** Restrained, fixed tones - one per kind of activity, so a row is identifiable by its colour
 * without the widget turning into a palette. */
const TONE = {
  sky: "bg-sky-500/[0.14] text-sky-400",
  emerald: "bg-emerald-500/[0.14] text-emerald-400",
  amber: "bg-amber-500/[0.14] text-amber-400",
} as const;

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
          {/* Near-full opacity: the photo is allowed to look like a photo, because the two
              gradients below - not a washed-out image - are what guarantee the text stays legible.
              Dimming the image instead costs the picture AND still can't promise contrast against
              a bright patch. */}
          <Image src={race.photoUrl} alt="" fill sizes="320px" className="object-cover opacity-90" />
          {/* Vertical ramp: transparent at the top so the image reads, solid carbon by the bottom
              where the round/name/date sit. */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/70 to-surface-1" />
          {/* Left-weighted wash: every line of type in this widget starts at the left edge, so
              that column gets its own guaranteed floor regardless of what the photo is doing. */}
          <div className="absolute inset-0 bg-gradient-to-r from-surface-1/90 via-surface-1/35 to-transparent" />
        </div>
      )}

      <div className="relative p-4">
        <h3 className="text-body-sm font-semibold text-primary">Race weekend</h3>

        {!race ? (
          <p className="mt-2 text-caption text-secondary">No upcoming race is scheduled yet.</p>
        ) : (
          <>
            <p className="mt-3 text-caption text-secondary">Round {race.round}</p>
            <p className="mt-0.5 flex items-start gap-1.5 text-title-md font-semibold text-primary">
              {flag && (
                <span aria-hidden className="shrink-0 text-base leading-tight">
                  {flag}
                </span>
              )}
              <span className="min-w-0">{race.name}</span>
            </p>
            {race.raceDate && (
              <p className="mt-0.5 text-caption text-secondary">
                {new Date(race.raceDate).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
              </p>
            )}

            {countdown && (
              <p className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-surface-2/80 px-2.5 py-0.5 text-caption font-medium tabular text-primary">
                <Icon icon={Clock} size={16} className="size-3 text-tertiary" />
                Lights out in {countdown}
              </p>
            )}

            <Button variant="secondary" size="sm" iconStart={Calendar} asChild className="mt-3 w-full">
              <Link href={raceHref(race.year, race.round, race.name)}>View race</Link>
            </Button>

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
 * Nothing here is a fabricated status. listMyPredictions also returns locked and recently-resolved
 * rounds (the main feed wants those), so this widget filters back down to rounds still taking
 * entries itself - by the server's own deadline (`lockAt`, the start of the weekend's Qualifying
 * session) against the ticking clock, so a round leaves "Active" the minute it closes. No "Open"
 * badge is claimed on top of that filter; the useful state is the real one each row carries: whether
 * the viewer has entered (`hasEntered`, a real group_prediction_entries lookup) and how long until
 * entries close (`lockAt`, through the same formatCountdown/useMinuteClock pair PredictionCard uses).
 */
function ActivePredictions({ predictions: allPredictions }: { predictions: FeedPrediction[] }) {
  const now = useMinuteClock();
  // Open by the server's deadline (lockAt), re-evaluated against the ticking clock so a round drops
  // out of "Active" the minute it closes rather than lingering until the next refresh.
  const predictions = allPredictions.filter((p) => predictionStateAt(p.status, p.lockAt, now) === "open");

  return (
    <div>
      <div className="flex items-center justify-between">
        <h3 className="text-body-sm font-semibold text-primary">Open prediction rounds</h3>
        {predictions.length > 0 && <span className="text-caption tabular text-tertiary">{predictions.length}</span>}
      </div>

      {predictions.length === 0 ? (
        <p className="mt-2 text-caption text-secondary">None open right now. New rounds open as a race weekend approaches.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {predictions.map((p) => {
            const lockMs = p.lockAt ? Date.parse(p.lockAt) : null;
            // Only open rounds reach here (filtered above), so there is no "awaiting result" case.
            const countdown = lockMs !== null ? formatCountdown(lockMs, now) : null;
            // Under a day left is the point at which "when" stops being background information.
            const urgent = lockMs !== null && lockMs - now < 24 * 60 * 60 * 1000;
            return (
              // Deep-links straight to that community's Predictions tab - CommunityTabs puts the
              // active tab in ?tab=, so there is a real target to link to.
              <Link
                key={p.id}
                href={`${groupHref(p.groupId)}?tab=predictions`}
                className="group block rounded-control bg-surface-2/60 p-3 transition-colors duration-fast hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
              >
                <div className="flex items-start gap-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body-sm font-semibold text-primary">{p.raceName}</span>
                    <span className="mt-0.5 block truncate text-caption text-secondary">
                      {predictionTypeLabels[p.type]} · {p.groupName}
                    </span>
                  </span>
                  <span className="shrink-0 whitespace-nowrap rounded-full bg-surface-3 px-2 py-0.5 text-caption font-medium tabular text-primary">{p.entryPoints} pts</span>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                  {p.hasEntered ? (
                    <span className="flex min-w-0 items-center gap-1 text-caption font-medium text-success">
                      <Icon icon={Check} size={16} className="size-3" />
                      <span className="shrink-0">Entered</span>
                      {/* The pick itself, resolved to a real driver name server-side - "Entered"
                          alone doesn't tell you what you actually put money on. */}
                      {p.myGuessLabel && <span className="min-w-0 truncate font-normal text-secondary">· {p.myGuessLabel}</span>}
                    </span>
                  ) : (
                    <span className="shrink-0 text-caption text-secondary">Not entered</span>
                  )}

                  {countdown ? (
                    <span className={`flex min-w-0 items-center gap-1 text-caption tabular ${urgent ? "font-medium text-warning" : "text-tertiary"}`}>
                      <Icon icon={Clock} size={16} className="size-3" />
                      <span className="truncate">Closes in {countdown}</span>
                    </span>
                  ) : null}

                  <span className="ml-auto shrink-0 text-tertiary transition-colors duration-fast group-hover:text-primary">
                    <Icon icon={ChevronRight} size={16} className="size-3" />
                  </span>
                </div>

                {/* What the community has actually entered, so the rail answers "which way is this
                    going" and not just "this exists". Real aggregate only - below three entries it
                    says how many there are rather than drawing a consensus from two people. */}
                <PredictionTrendBars groupId={p.groupId} predictionId={p.id} isPodium={p.type === "podium"} compact />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
