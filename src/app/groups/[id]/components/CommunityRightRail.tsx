"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/providers/AuthProvider";
import { useMinuteClock } from "@/hooks/useMinuteClock";
import { useCommunityPresence } from "@/hooks/useCommunityPresence";
import { formatCountdown, parseUtcDateTime } from "@/lib/countdown";
import { countryFlag } from "@/lib/countryFlag";
import { compactCount } from "@/lib/format";
import { predictionTypeLabels, type GroupPrediction } from "@/lib/groupPredictionTypes";
import type { PredictionTrend } from "@/lib/supabase/groupPredictions";
import type { GroupPulse, GroupStats } from "@/lib/supabase/groupStats";
import type { NextRaceSummary } from "@/lib/supabase/nextRace";
import { raceHref, seasonHref } from "@/lib/routes";
import { PredictionTrendBars } from "../../components/post/PredictionTrendBars";

/** One open round plus the aggregate that was fetched for it server-side, so the rail draws its
 * bars on first paint instead of firing a request per card after mount. */
export type RailPrediction = { prediction: GroupPrediction; trend: PredictionTrend | null };

/**
 * The community page's context rail: what's next on the calendar, how big and busy this place is,
 * what's open to predict, and what's changed since you were last here.
 *
 * Every card here is either real or absent. Specifically:
 *  - Upcoming Race renders only for a community whose own type is about Formula 1. A Photography
 *    community has no business being told when lights go out, and the page never fetches a race for
 *    one (see page.tsx).
 *  - Active Predictions renders only where the predictions module is genuinely on.
 *  - Online is a live presence count and is omitted entirely when presence never connected - never
 *    shown as 0 (see lib/realtime/presence.ts).
 *  - The pulse shows a diff only when there is a real previous visit to diff against.
 */
export function CommunityRightRail({
  groupId,
  stats,
  pulse,
  race,
  predictions,
  showRace,
  showPredictions,
  onOpenTab,
}: {
  groupId: string;
  stats: GroupStats;
  pulse: GroupPulse;
  race: NextRaceSummary;
  predictions: RailPrediction[];
  showRace: boolean;
  showPredictions: boolean;
  /** Switches the page's own tab rather than navigating - the rail sits beside the panel it
   * points at, and a full navigation to re-render data already on screen would be a waste. */
  onOpenTab: (tab: "predictions" | "members" | "about" | "feed") => void;
}) {
  return (
    <div className="space-y-3">
      {showRace && <UpcomingRaceCard race={race} />}
      <CommunityStatsCard groupId={groupId} stats={stats} onOpenTab={onOpenTab} />
      {showPredictions && <ActivePredictionsCard predictions={predictions} onOpenTab={onOpenTab} />}
      <CommunityPulseCard pulse={pulse} stats={stats} onOpenTab={onOpenTab} />
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <section className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[var(--f1-carbon)]/60 backdrop-blur-sm">{children}</section>;
}

function CardHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 px-4 pt-3.5">
      <h2 className="text-[13px] font-semibold text-white">{title}</h2>
      {action}
    </div>
  );
}

function ViewAllLink({ href, onClick }: { href?: string; onClick?: () => void }) {
  const className = "shrink-0 text-[11px] font-medium text-neutral-500 transition hover:text-white";
  if (href) {
    return (
      <Link href={href} className={className}>
        View all
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      View all
    </button>
  );
}

// ---------------------------------------------------------------- upcoming race

/**
 * The real next round, over its own real photo where the pipeline has one.
 *
 * The countdown counts to the race itself, which is the one session time a race row actually
 * carries - there's no per-session (qualifying/sprint) start time to count to, so none is claimed.
 * Once that instant passes, the card stops counting and says the weekend is underway instead of
 * running the clock backwards or silently dropping the badge.
 */
function UpcomingRaceCard({ race }: { race: NextRaceSummary }) {
  const now = useMinuteClock();
  const raceAt = race?.raceDate ? parseUtcDateTime(race.raceDate).getTime() : null;
  const countdown = raceAt && raceAt > now ? formatCountdown(raceAt, now) : null;
  const underway = !!raceAt && raceAt <= now;
  const flag = countryFlag(race?.country);

  return (
    <Card>
      <CardHeader title="Upcoming Race" action={<ViewAllLink href={seasonHref(new Date().getFullYear())} />} />

      {!race ? (
        <p className="px-4 pb-4 pt-2 text-xs leading-relaxed text-neutral-500">No upcoming race is scheduled yet.</p>
      ) : (
        <div className="px-3 pb-3.5 pt-2.5">
          <Link href={raceHref(race.year, race.round, race.name)} className="group block">
            <div className="relative aspect-[16/7] w-full overflow-hidden rounded-xl bg-white/[0.04]">
              {/* `priority` because Next measured this as the page's Largest Contentful Paint - the rail sits
                  above the fold and this is the only real photo on it, so lazy-loading it is what
                  makes the page's headline paint wait on a second round trip. */}
              {race.photoUrl && <Image src={race.photoUrl} alt="" fill priority sizes="320px" className="object-cover transition duration-500 group-hover:scale-[1.03]" />}
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-black/35" />
              <span className="absolute left-2 top-2 rounded-md bg-black/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white backdrop-blur-sm">
                Round {race.round}
              </span>
            </div>
          </Link>

          <div className="mt-2.5 flex items-start gap-2.5">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-[13px] font-bold leading-tight text-white">
                {flag && (
                  <span aria-hidden className="shrink-0">
                    {flag}
                  </span>
                )}
                <span className="min-w-0 truncate">{race.name}</span>
              </p>
              {race.circuit && <p className="mt-0.5 truncate text-[11px] text-neutral-500">{race.circuit}</p>}
              {race.raceDate && (
                <p className="mt-0.5 text-[11px] text-neutral-500">
                  {parseUtcDateTime(race.raceDate).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                </p>
              )}
              {/* A calendar round the pipeline hasn't dated yet is a real state - it says so rather
                  than inventing a date or quietly showing nothing where a date belongs. */}
              {!race.raceDate && <p className="mt-0.5 text-[11px] text-neutral-600">Date to be confirmed</p>}
            </div>

            {(countdown || underway) && (
              <div className="shrink-0 rounded-lg border border-[var(--f1-red)]/25 bg-[var(--f1-red)]/[0.1] px-2 py-1 text-center">
                <p className="text-[13px] font-bold leading-none tabular-nums text-[var(--f1-red)]">{countdown ?? "Live"}</p>
                <p className="mt-0.5 text-[9px] font-medium uppercase tracking-wide text-[var(--f1-red)]/80">{underway ? "Underway" : "Race weekend"}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------- stats

function CommunityStatsCard({ groupId, stats, onOpenTab }: { groupId: string; stats: GroupStats; onOpenTab: (tab: "members") => void }) {
  const { user } = useAuth();
  const online = useCommunityPresence(groupId, user?.uid ?? null);

  return (
    <Card>
      <CardHeader title="Community Stats" action={<ViewAllLink onClick={() => onOpenTab("members")} />} />
      <div className="flex items-start gap-3 px-4 pb-4 pt-3">
        <Stat icon={<MembersIcon />} value={compactCount(stats.members)} label="Members" />
        {/* Omitted entirely, not zeroed, when presence hasn't connected - see useCommunityPresence. */}
        {online !== null && <Stat icon={<OnlineDot />} value={compactCount(online)} label="Online" />}
        <Stat icon={<PostsIcon />} value={compactCount(stats.posts)} label={stats.posts === 1 ? "Post" : "Posts"} />
      </div>
    </Card>
  );
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="flex items-center gap-1.5 text-[15px] font-bold leading-none text-white">
        <span className="shrink-0 text-neutral-500">{icon}</span>
        <span className="truncate tabular-nums">{value}</span>
      </p>
      <p className="mt-1 truncate text-[11px] text-neutral-500">{label}</p>
    </div>
  );
}

// ---------------------------------------------------------------- predictions

function ActivePredictionsCard({ predictions, onOpenTab }: { predictions: RailPrediction[]; onOpenTab: (tab: "predictions") => void }) {
  const now = useMinuteClock();

  return (
    <Card>
      <CardHeader title="Active Predictions" action={<ViewAllLink onClick={() => onOpenTab("predictions")} />} />

      {predictions.length === 0 ? (
        <p className="px-4 pb-4 pt-2 text-xs leading-relaxed text-neutral-500">No open rounds right now. New ones appear as a race weekend approaches.</p>
      ) : (
        <div className="space-y-3 px-4 pb-4 pt-2.5">
          {predictions.map(({ prediction, trend }) => {
            const raceAt = prediction.raceDate ? parseUtcDateTime(prediction.raceDate).getTime() : null;
            const countdown = raceAt && raceAt > now ? formatCountdown(raceAt, now) : null;
            // A round left open past its own race is a real state (nobody has resolved it yet) and
            // is named as such rather than counting down to a time that has been and gone.
            const awaitingResult = !!raceAt && raceAt <= now;
            const urgent = !!raceAt && raceAt > now && raceAt - now < 24 * 60 * 60 * 1000;

            return (
              <div key={prediction.id}>
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold leading-tight text-white">{prediction.raceName}</p>
                    <p className="mt-0.5 truncate text-[11px] text-neutral-500">{predictionTypeLabels[prediction.type]}</p>
                  </div>
                  <span className="shrink-0 rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-neutral-200">{prediction.entryPoints} pts</span>
                </div>

                <p className={`mt-1 text-[11px] tabular-nums ${urgent ? "font-semibold text-[var(--f1-red)]" : "text-neutral-500"}`}>
                  {countdown ? `Closes in ${countdown}` : awaitingResult ? "Awaiting result" : "Open"}
                  {prediction.myEntry && <span className="ml-1.5 font-medium normal-case text-emerald-400/90">· Entered</span>}
                </p>

                <PredictionTrendBars groupId={prediction.groupId} predictionId={prediction.id} isPodium={prediction.type === "podium"} trend={trend} compact />
              </div>
            );
          })}

          <button
            type="button"
            onClick={() => onOpenTab("predictions")}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.12] bg-white/[0.04] px-3 py-2.5 text-[13px] font-medium text-neutral-100 transition hover:border-white/25 hover:bg-white/[0.08] hover:text-white"
          >
            <ChartIcon />
            {/* "Enter" only where entering is actually still possible - a round waiting on a result
                takes you to the same panel, but the label doesn't promise an entry it won't accept. */}
            {predictions.every(({ prediction }) => prediction.myEntry) ? "Review your predictions" : "Enter prediction"}
          </button>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------- pulse

/**
 * A computed digest, not a model call - every line is a count over this community's own tables.
 *
 * There is deliberately no "sentiment" line. Nothing in this app measures the mood of a community's
 * posts, and a percentage next to the word "sentiment" would be the one invented number on a page
 * of real ones. What sits in its place is a real, checkable figure: this week's published posts
 * against last week's.
 */
function CommunityPulseCard({ pulse, stats, onOpenTab }: { pulse: GroupPulse; stats: GroupStats; onOpenTab: (tab: "feed") => void }) {
  const [expanded, setExpanded] = useState(false);

  type PulseLine = { icon: React.ReactNode; text: string };
  const lines: PulseLine[] = pulse.hasPriorVisit
    ? ([
        pulse.newPosts > 0 ? { icon: <DiscussionIcon />, text: `${pulse.newPosts} new ${pulse.newPosts === 1 ? "discussion" : "discussions"}` } : null,
        pulse.repliesToYou > 0 ? { icon: <ReplyIcon />, text: `${pulse.repliesToYou} new ${pulse.repliesToYou === 1 ? "reply" : "replies"} to your posts` } : null,
        pulse.newPredictionEntries > 0
          ? { icon: <ChartIcon />, text: `${pulse.newPredictionEntries} prediction ${pulse.newPredictionEntries === 1 ? "entry" : "entries"}` }
          : null,
        pulse.newMembers > 0 ? { icon: <MembersIcon />, text: `${pulse.newMembers} new ${pulse.newMembers === 1 ? "member" : "members"}` } : null,
      ] satisfies (PulseLine | null)[]).filter((line) => line !== null)
    : [];

  return (
    <Card>
      <div className="px-4 pb-4 pt-3.5">
        <div className="flex items-center gap-1.5">
          <span aria-hidden className="text-[var(--f1-red)]">
            ✦
          </span>
          <h2 className="text-[13px] font-semibold text-white">Community Pulse</h2>
        </div>

        {pulse.hasPriorVisit ? (
          <>
            <p className="mt-1.5 text-[11px] text-neutral-500">Since you were last here</p>
            {lines.length === 0 ? (
              <p className="mt-2 text-xs leading-relaxed text-neutral-600">Nothing new since your last visit.</p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {lines.map((line) => (
                  <li key={line.text} className="flex items-center gap-2 text-xs text-neutral-300">
                    <span aria-hidden className="shrink-0 text-neutral-500">
                      {line.icon}
                    </span>
                    <span className="min-w-0 truncate">{line.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          // A first visit has nothing to diff against, so it gets the standing picture instead of
          // "no changes since your last visit" - a claim about a visit that never happened.
          <>
            <p className="mt-1.5 text-[11px] text-neutral-500">This week here</p>
            <ul className="mt-2 space-y-1.5">
              <li className="flex items-center gap-2 text-xs text-neutral-300">
                <span aria-hidden className="shrink-0 text-neutral-500">
                  <DiscussionIcon />
                </span>
                <span>
                  {stats.weeklyPosts} {stats.weeklyPosts === 1 ? "discussion" : "discussions"}
                </span>
              </li>
              <li className="flex items-center gap-2 text-xs text-neutral-300">
                <span aria-hidden className="shrink-0 text-neutral-500">
                  <MembersIcon />
                </span>
                <span>
                  {stats.activeMembers} {stats.activeMembers === 1 ? "member" : "members"} active
                </span>
              </li>
            </ul>
          </>
        )}

        <WeeklyTrendLine stats={stats} />

        {expanded && (
          <dl className="mt-3 space-y-1.5 border-t border-white/[0.06] pt-3">
            <RecapRow label="Posts this week" value={String(stats.weeklyPosts)} />
            <RecapRow label="Posts the week before" value={String(stats.previousWeeklyPosts)} />
            <RecapRow label="Members active this week" value={String(stats.activeMembers)} />
            <RecapRow label="Members" value={String(stats.members)} />
            <RecapRow label="Posts all time" value={String(stats.posts)} />
          </dl>
        )}

        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/[0.1] bg-white/[0.03] px-3 py-2 text-[12px] font-medium text-neutral-300 transition hover:border-white/20 hover:text-white"
          >
            {expanded ? "Hide recap" : "View full recap"}
            <span aria-hidden className={expanded ? "rotate-90 transition-transform" : "transition-transform"}>
              <ChevronIcon />
            </span>
          </button>
          {pulse.hasPriorVisit && lines.length > 0 && (
            <button
              type="button"
              onClick={() => onOpenTab("feed")}
              className="shrink-0 rounded-xl border border-white/[0.1] bg-white/[0.03] px-3 py-2 text-[12px] font-medium text-neutral-300 transition hover:border-white/20 hover:text-white"
            >
              Feed
            </button>
          )}
        </div>
      </div>
    </Card>
  );
}

/** This week's published posts against last week's. Only ever a percentage where a percentage is
 * defined: a week that follows a silent one has no meaningful "up 400%", so that case states the
 * raw figure instead, and two silent weeks state nothing at all. */
function WeeklyTrendLine({ stats }: { stats: GroupStats }) {
  const { weeklyPosts, previousWeeklyPosts } = stats;
  if (weeklyPosts === 0 && previousWeeklyPosts === 0) return null;

  if (previousWeeklyPosts === 0) {
    return (
      <p className="mt-2.5 border-t border-white/[0.06] pt-2.5 text-xs text-neutral-400">
        {weeklyPosts} {weeklyPosts === 1 ? "post" : "posts"} this week, after a quiet one
      </p>
    );
  }

  const delta = Math.round(((weeklyPosts - previousWeeklyPosts) / previousWeeklyPosts) * 100);
  const flat = delta === 0;
  return (
    <p className="mt-2.5 flex items-center gap-1.5 border-t border-white/[0.06] pt-2.5 text-xs text-neutral-400">
      <span aria-hidden className="text-neutral-500">
        <ActivityIcon />
      </span>
      <span className="min-w-0">
        Activity{" "}
        {flat ? (
          <span className="text-neutral-300">level with last week</span>
        ) : (
          <>
            <span className={delta > 0 ? "font-semibold text-emerald-400" : "font-semibold text-neutral-300"}>
              {delta > 0 ? "↑" : "↓"} {Math.abs(delta)}%
            </span>{" "}
            this week
          </>
        )}
      </span>
    </p>
  );
}

function RecapRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="min-w-0 truncate text-[11px] text-neutral-500">{label}</dt>
      <dd className="shrink-0 text-[11px] font-semibold tabular-nums text-neutral-300">{value}</dd>
    </div>
  );
}

// ---------------------------------------------------------------- icons

function MembersIcon() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" fill="none" aria-hidden>
      <circle cx="6" cy="5.5" r="2.6" stroke="currentColor" strokeWidth="1.3" />
      <path d="M1.8 13.4c.5-2.2 2.2-3.5 4.2-3.5s3.7 1.3 4.2 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M11 3.3a2.4 2.4 0 0 1 0 4.5M12.2 10.3c1.1.5 1.9 1.6 2.2 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function OnlineDot() {
  return <span aria-hidden className="block h-2 w-2 rounded-full bg-emerald-400" />;
}

function PostsIcon() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" fill="none" aria-hidden>
      <rect x="2.2" y="2.6" width="11.6" height="10.8" rx="2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5 6h6M5 9h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function DiscussionIcon() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" fill="none" aria-hidden>
      <path d="M2.4 3.6h11.2v7H6.6L3.6 13v-2.4H2.4v-7Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}

function ReplyIcon() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" fill="none" aria-hidden>
      <path d="M6.2 4.2 2.8 7.4l3.4 3.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2.8 7.4h6.4a3.6 3.6 0 0 1 3.6 3.6v1.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" fill="none" aria-hidden>
      <path d="M2.6 13.4V9.2M6.6 13.4V4.4M10.6 13.4V7M14 13.4V2.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function ActivityIcon() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" fill="none" aria-hidden>
      <path d="M1.8 9.4h2.6L6.2 5l2.4 6.6L10.4 8h3.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
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
