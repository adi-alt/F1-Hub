"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import { EntityAvatar } from "@/components/EntityAvatar";
import { useHomepageIntelligence } from "@/components/home/ai/HomepageIntelligenceProvider";
import { tiltProps } from "@/components/motion/useTilt";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Section } from "@/components/ui/Section";
import { Skeleton } from "@/components/ui/Skeleton";
import { Surface } from "@/components/ui/Surface";
import { useMinuteClock } from "@/hooks/useMinuteClock";
import { useViewerTimeZone } from "@/hooks/useViewerTimeZone";
import { formatCountdown, formatLocalTime, formatLocalWeekday, parseUtcDateTime } from "@/lib/countdown";
import { insightFor } from "@/lib/favoriteInsights";
import { MAX_PICK_POINTS, scorePick } from "@/lib/pickScoring";
import type { PersonalHomeData, PublicHomeData } from "@/lib/homeData";
import { raceHref } from "@/lib/routes";
import { teamColor } from "@/lib/teamColors";
import { weekendSessionsFor, type WeekendSession } from "@/lib/weekendSessions";

type Props = { publicData: PublicHomeData; personalData: PersonalHomeData };

const SESSION_SHORT: Record<WeekendSession["key"], string> = { FP1: "FP1", FP2: "FP2", FP3: "FP3", SQ: "Sprint quali", S: "Sprint", Q: "Qualifying", R: "Race" };

/** The signed-in home's own version of the landing page's windows: a title bar with the three (quiet) window dots
 * and a name, and the content under it. Static here: these hold your data, so they don't drift. */
function WindowPanel({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <div className="surface-glass flex h-full min-w-0 flex-col overflow-hidden rounded-card border border-white/10">
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5">
        <span aria-hidden className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-white/15" />
          <span className="size-2.5 rounded-full bg-white/15" />
          <span className="size-2.5 rounded-full bg-white/15" />
        </span>
        <h3 className="ml-1 truncate text-caption font-medium text-secondary">{title}</h3>
        {aside && <span className="ml-auto shrink-0 text-caption tabular text-tertiary">{aside}</span>}
      </div>
      <div className="flex flex-1 flex-col p-4">{children}</div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------ your weekend

function nameFor(publicData: PublicHomeData, code: string) {
  return publicData.nextRace?.inputs?.find((i) => i.driver === code)?.driverName ?? publicData.currentDrivers.find((d) => d.code === code)?.name ?? code;
}
function teamFor(publicData: PublicHomeData, code: string) {
  return publicData.nextRace?.inputs?.find((i) => i.driver === code)?.team ?? publicData.currentDrivers.find((d) => d.code === code)?.team ?? "";
}

/** A podium of three steps (P2, P1, P3), each in its driver's team colour, or dashed and empty before a pick. */
function MiniPodium({ codes, publicData }: { codes: readonly (string | null)[]; publicData: PublicHomeData }) {
  const order = [1, 0, 2] as const;
  const heights = ["h-20", "h-14", "h-10"];
  return (
    <ol className="grid grid-cols-3 items-end gap-2" aria-label="Podium">
      {order.map((i) => {
        const code = codes[i] ?? null;
        const color = code ? teamColor(teamFor(publicData, code)) : null;
        return (
          <li key={i} className="min-w-0 text-center" aria-label={`P${i + 1}: ${code ? nameFor(publicData, code) : "not picked"}`}>
            <p className={`truncate text-caption font-semibold tabular ${code ? "text-primary" : "text-tertiary"}`}>{code ?? "?"}</p>
            <div
              aria-hidden
              className={`mt-1.5 flex items-start justify-center rounded-t-control pt-1.5 text-body-sm font-semibold tabular ${heights[i]} ${code ? "border-x border-t border-white/15 text-primary" : "border-x border-t border-dashed border-subtle text-tertiary"}`}
              style={color ? { background: `linear-gradient(180deg, ${color}66, ${color}12)` } : undefined}
            >
              {i + 1}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** The weekend as a line of sessions: done, live (pulsing) or still to come, in the viewer's own time. */
function WeekendTimeline({ sessions: raw, tz, now }: { sessions: WeekendSession[]; tz: string | undefined; now: number }) {
  if (!raw.length) return null;
  // A session still to start is upcoming here, whatever data the race already has (a grid can exist before
  // qualifying has run).
  const sessions = raw.map((s) => (s.startsAt && parseUtcDateTime(s.startsAt).getTime() > now ? { ...s, state: "upcoming" as const } : s));
  const nextIndex = sessions.findIndex((s) => s.state === "upcoming" || s.state === "live");
  return (
    // Focusable so keyboard users can scroll it sideways.
    <div tabIndex={0} role="region" aria-label="Weekend sessions" className="overflow-x-auto pb-1 focus-visible:outline-2 focus-visible:outline-focus-ring">
      <ol className="relative grid min-w-[34rem] auto-cols-fr grid-flow-col" aria-label="This weekend's sessions">
        <span aria-hidden className="absolute inset-x-6 top-[7px] h-px bg-white/10" />
        {sessions.map((s, i) => {
          const done = s.state === "completed" || s.state === "awaiting";
          const live = s.state === "live";
          const next = i === nextIndex;
          return (
            <li key={s.key} className="relative flex flex-col items-center px-1 text-center">
              <span
                aria-hidden
                className={`relative z-10 size-3.5 rounded-full border-2 ${live ? "border-brand bg-brand motion-safe:animate-pulse" : done ? "border-primary bg-primary" : next ? "border-primary bg-surface-1" : "border-white/25 bg-surface-1"}`}
              />
              <span className={`mt-2 text-caption font-medium ${next || live ? "text-primary" : "text-secondary"}`}>{SESSION_SHORT[s.key]}</span>
              <span suppressHydrationWarning className="text-caption tabular text-tertiary">
                {live ? "Live now" : s.startsAt ? `${formatLocalWeekday(s.startsAt, tz)} ${formatLocalTime(s.startsAt, tz, false)}` : "TBC"}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/**
 * "Your weekend": the race weekend as a line of sessions with the predictions' own clock, then three windows of the
 * same height: your pick (a podium, or an empty one with the way in), the model's podium with each driver's chance to
 * win, and your record as meters. Apex's read on your pick sits under them once you've made one.
 */
export function YourWeekendSection({ publicData, personalData, onPredict }: Props & { onPredict?: () => void }) {
  const { intelligence } = useHomepageIntelligence();
  const now = useMinuteClock();
  const tz = useViewerTimeZone();
  const race = publicData.nextRace;
  const calendar = publicData.calendarEntry?.sessions ?? [];
  const pick = personalData.myPick;
  const perf = personalData.predictionPerformance;
  const sessions = race ? weekendSessionsFor(calendar, race, [], now) : [];

  // The predictions' clock: open 24h before the first session, lock at lights out (save_pick enforces both).
  const starts = calendar.map((s) => parseUtcDateTime(s.date).getTime()).filter((t) => !Number.isNaN(t));
  const opensAt = starts.length ? Math.min(...starts) - 24 * 3600 * 1000 : null;
  const raceSession = calendar.find((s) => /^(race|grand prix)$/i.test(s.label.trim()));
  const locksAt = raceSession ? parseUtcDateTime(raceSession.date).getTime() : null;
  const clock =
    race?.status === "completed" || (locksAt !== null && now >= locksAt)
      ? "Predictions locked"
      : opensAt !== null && now < opensAt
        ? `Predictions open in ${formatCountdown(opensAt, now)}`
        : locksAt !== null
          ? `Locks in ${formatCountdown(locksAt, now)}`
          : null;

  const sim = race?.simulation?.drivers?.length ? [...race.simulation.drivers].sort((a, b) => b.p1 - a.p1).slice(0, 3) : null;
  const order = race?.prediction?.finishOrder?.slice().sort((a, b) => a.predictedPosition - b.predictedPosition).slice(0, 3).map((o) => o.driver) ?? [];
  const quali = sessions.find((s) => s.key === "Q");
  const challenge = intelligence?.predictionChallenge;
  const canPredict = !!race && race.status !== "completed";
  const pickScore = pick ? scorePick(pick, race) : null;

  return (
    <Section id="your-weekend" level={2} title="Your weekend" description={race ? `${race.name}, round ${race.round}.` : undefined}>
      {race && (sessions.length > 0 || clock) && (
        <div className="mb-4 flex flex-col gap-4 rounded-card border border-white/10 bg-surface-1/60 px-4 py-4 md:flex-row md:items-center md:gap-6">
          <div className="min-w-0 flex-1">
            <WeekendTimeline sessions={sessions} tz={tz} now={now} />
          </div>
          {clock && (
            <p suppressHydrationWarning className="shrink-0 self-start rounded-full border border-white/10 bg-surface-2 px-3 py-1 text-caption font-medium tabular text-primary md:self-center">
              {clock}
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <WindowPanel title="Your pick" aside={pick ? "Saved" : undefined}>
          <MiniPodium codes={pick ? pick.predictedPodium : [null, null, null]} publicData={publicData} />
          <div className="mt-auto pt-4">
            {pick ? (
              <p className="text-caption text-secondary">
                {pickScore && (pickScore.scored ? (
                  <span className="mb-1 block text-body-sm text-primary">
                    You scored <span className="font-semibold tabular">{pickScore.earned}</span> of {pickScore.possible} pts
                  </span>
                ) : (
                  <span className="mb-1 block text-body-sm text-primary">
                    Worth up to <span className="font-semibold tabular">{pickScore.possible}</span> of {MAX_PICK_POINTS} pts if it&apos;s all right
                  </span>
                ))}
                {nameFor(publicData, pick.predictedPodium[0])} to win.{" "}
                {canPredict && onPredict && (
                  <button type="button" onClick={onPredict} className="font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring">
                    Edit
                  </button>
                )}
              </p>
            ) : canPredict ? (
              onPredict ? (
                <Button variant="primary" size="md" onClick={onPredict} className="w-full">
                  Make your predictions
                  <Icon icon={ArrowRight} size={16} />
                </Button>
              ) : (
                <Button variant="primary" size="md" asChild className="w-full">
                  <Link href={`${raceHref(race.year, race.round, race.name)}#pick`}>
                    Make your predictions
                    <Icon icon={ArrowRight} size={16} />
                  </Link>
                </Button>
              )
            ) : (
              <p className="text-caption text-secondary">No pick for this race.</p>
            )}
          </div>
        </WindowPanel>

        <WindowPanel title="Apex model" aside={sim ? "chance to win" : undefined}>
          {sim ? (
            <ol className="space-y-3">
              {sim.map((d) => {
                const color = teamColor(teamFor(publicData, d.driver));
                return (
                  <li key={d.driver} className="min-w-0">
                    <div className="flex items-baseline justify-between gap-2 text-body-sm">
                      <span className="truncate text-primary">
                        <span className="font-semibold tabular">{d.driver}</span> <span className="text-secondary">{nameFor(publicData, d.driver)}</span>
                      </span>
                      <span className="tabular text-primary">{Math.round(d.p1 * 100)}%</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-3">
                      <div className="h-full rounded-full" style={{ width: `${Math.max(3, d.p1 * 100)}%`, background: color }} />
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : order.length ? (
            <MiniPodium codes={order} publicData={publicData} />
          ) : (
            <>
              <div aria-hidden className="space-y-3 opacity-40">
                {[78, 54, 36].map((w) => (
                  <div key={w}>
                    <div className="h-2.5 w-24 rounded-full bg-surface-3" />
                    <div className="mt-1.5 h-1.5 rounded-full bg-surface-3">
                      <div className="h-full rounded-full bg-white/20" style={{ width: `${w}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-auto pt-4 text-caption text-secondary">
                Publishes after qualifying, frozen before the start.
                {quali?.startsAt && quali.state === "upcoming" && (
                  <>
                    {" "}
                    Qualifying: <span suppressHydrationWarning>{`${formatLocalWeekday(quali.startsAt, tz)} ${formatLocalTime(quali.startsAt, tz)}`}</span>.
                  </>
                )}
              </p>
            </>
          )}
        </WindowPanel>

        <WindowPanel title="Your record" aside={perf.winner.total > 0 ? `${perf.winner.total} race${perf.winner.total === 1 ? "" : "s"}` : undefined}>
          {perf.winner.total > 0 ? (
            <dl className="space-y-3">
              <div className="flex items-baseline justify-between">
                <dt className="text-body-sm text-secondary">Race-pick points</dt>
                <dd className="text-title-md font-semibold tabular text-primary">{perf.points.earned}</dd>
              </div>
              {[
                { label: "Winners", correct: perf.winner.correct, total: perf.winner.total },
                { label: "Podium places", correct: perf.podiumSlots.correct, total: perf.podiumSlots.total },
              ].map((m) => (
                // dt and dd directly in the row's div, as a <dl> requires; the bar is drawn under them by the grid.
                <div key={m.label} className="grid grid-cols-[1fr_auto] items-baseline gap-y-1.5 text-body-sm">
                  <dt className="text-secondary">{m.label}</dt>
                  <dd className="tabular text-primary">
                    {m.correct}/{m.total}
                  </dd>
                  <dd aria-hidden className="col-span-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
                    <div className="h-full rounded-full bg-primary/80" style={{ width: `${m.total ? Math.max(3, (m.correct / m.total) * 100) : 0}%` }} />
                  </dd>
                </div>
              ))}
              {perf.avgPositionError !== null && (
                <div className="flex items-baseline justify-between text-body-sm">
                  <dt className="text-secondary">Off by, on average</dt>
                  <dd className="tabular text-primary">{perf.avgPositionError.toFixed(1)} places</dd>
                </div>
              )}
            </dl>
          ) : (
            <p className="text-body-sm text-secondary">Starts with your first pick.</p>
          )}
          {personalData.latestPrediction?.status === "resolved" && (
            <p className="mt-auto pt-4 text-caption text-secondary">
              Last time, {personalData.latestPrediction.raceName.replace(/ Grand Prix$/, "")}: you picked {nameFor(publicData, personalData.latestPrediction.predictedWinner)}
              {personalData.latestPrediction.actualWinner ? `; ${nameFor(publicData, personalData.latestPrediction.actualWinner)} won.` : "."}
            </p>
          )}
        </WindowPanel>
      </div>

      {pick && challenge && challenge.status !== "NO_PICK" && (
        <div className="mt-3 rounded-card border border-white/10 bg-surface-1/60 px-4 py-3">
          <p className="flex items-center gap-1.5 text-caption text-tertiary">
            <Icon icon={Sparkles} size={16} className="text-brand-text" />
            Apex on your pick · {challenge.status === "AGREE" ? "agrees" : "disagrees"} · AI summary
          </p>
          <p className="mt-1 text-body-sm text-secondary">{challenge.explanation}</p>
        </div>
      )}
    </Section>
  );
}

// ------------------------------------------------------------------------------------ your drivers/teams

type Here = { appearances: number; wins: number; podiums: number } | undefined;

/** "6 starts · 2 podiums · 1 win" at this circuit, as one line. */
function hereLine(here: Here): string | null {
  if (!here) return null;
  const n = (count: number, one: string) => `${count} ${one}${count === 1 ? "" : "s"}`;
  return [n(here.appearances, "start"), n(here.podiums, "podium"), ...(here.wins ? [n(here.wins, "win")] : [])].join(" · ");
}

/**
 * Your favourites, one compact card each: the team colour along the top, the championship position, the points
 * against the leader as a bar, the record at this weekend's circuit in one line, and Apex's insight for that driver
 * or team (each card its own: lib/favoriteInsights.ts). Cards keep their own height, so one without an insight
 * isn't stretched into an empty box.
 */
export function YourDriversSection({ publicData, personalData }: Props) {
  const { intelligence, isLoading } = useHomepageIntelligence();
  const recap = publicData.seasonRecap;
  const history = publicData.trackHistory;
  const circuit = publicData.nextRace?.circuit ?? "this circuit";
  const headshot = (code: string | null) => publicData.currentDrivers.find((d) => d.code === code)?.headshotUrl ?? null;
  const driverLeader = recap.driverLeader?.points ?? null;
  const teamLeader = recap.teamLeader?.points ?? null;

  const cards = [
    ...personalData.favoriteDrivers.map((d) => {
      const rank = recap.favoriteDriverRanks.find((r) => r.id === d.driverId || r.code === d.code);
      const team = d.team || publicData.currentDrivers.find((x) => x.code === d.code)?.team || "";
      return {
        key: `d-${d.driverId}`,
        kind: "driver" as const,
        name: d.name,
        subtitle: team || (d.isActiveThisSeason ? "" : `Raced ${d.firstYear}–${d.lastYear}`),
        color: team ? teamColor(team) : null,
        href: d.href,
        image: d.headshotUrl ?? headshot(d.code),
        logo: false,
        rank: rank?.rank ?? null,
        points: rank?.points ?? null,
        leader: driverLeader,
        here: history?.favoriteDriverCircuitStatsList.find((s) => s.driverId === d.driverId),
        insight: insightFor(intelligence, "driver", d.name),
      };
    }),
    ...personalData.favoriteTeams.map((t) => {
      const rank = recap.favoriteTeamRanks.find((r) => r.id === t.teamId);
      const team = t.currentName ?? t.name;
      return {
        key: `t-${t.teamId}`,
        kind: "team" as const,
        name: t.name,
        subtitle: rank ? "Constructors' championship" : "Not on the grid this season",
        color: teamColor(team),
        href: t.href,
        image: t.logoUrl,
        logo: true,
        rank: rank?.rank ?? null,
        points: rank?.points ?? null,
        leader: teamLeader,
        here: history?.favoriteTeamCircuitStatsList.find((s) => s.teamId === t.teamId),
        insight: insightFor(intelligence, "team", t.name),
      };
    }),
  ];

  return (
    <Section id="your-favourites" level={2} title="Your drivers and teams" description={cards.length ? `Their season, and their record at ${circuit}.` : undefined}>
      {cards.length === 0 ? (
        <p className="text-body-sm text-secondary">
          Choose favourite drivers and teams to follow them here.{" "}
          <Link href="/profile/personalisation" className="font-medium text-primary underline-offset-4 hover:underline">
            Choose favourites
          </Link>
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {cards.map((c) => {
            const behind = c.points !== null && c.leader !== null ? c.leader - c.points : null;
            const share = c.points !== null && c.leader ? c.points / c.leader : null;
            const here = hereLine(c.here);
            return (
              <li key={c.key} className="min-w-0">
                <div {...tiltProps(c.color)} className="tilt h-full rounded-card">
                  <Surface level={1} padding="sm" interactive href={c.href} linkLabel={c.name} className="relative flex h-full flex-col overflow-hidden">
                    <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-0.5" style={c.color ? { background: c.color } : undefined} />
                    <span aria-hidden className="pointer-events-none absolute -right-10 -top-14 size-32 rounded-full opacity-15 blur-2xl" style={c.color ? { background: c.color } : undefined} />
                    <div className="relative flex items-center gap-3">
                      <EntityAvatar imageUrl={c.image} name={c.name} size={36} shape={c.logo ? "square" : "circle"} fit={c.logo ? "contain" : "cover"} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-body-sm font-semibold text-primary">{c.name}</p>
                        {c.subtitle && <p className="truncate text-caption text-secondary">{c.subtitle}</p>}
                      </div>
                      {c.rank !== null && (
                        <p className="shrink-0 text-right">
                          <span className="block text-title-md font-semibold leading-none tabular text-primary">P{c.rank}</span>
                          <span className="mt-1 block text-caption tabular text-secondary">{c.points} pts</span>
                        </p>
                      )}
                    </div>

                    {share !== null && (
                      <div className="relative mt-3 flex items-center gap-3">
                        <span className="w-24 shrink-0 text-caption tabular text-secondary">{behind === 0 ? "Leads" : `${behind} behind`}</span>
                        <div aria-hidden className="h-1 flex-1 overflow-hidden rounded-full bg-surface-3">
                          <div className="h-full rounded-full" style={{ width: `${Math.max(2, share * 100)}%`, background: c.color ?? "var(--color-primary)" }} />
                        </div>
                      </div>
                    )}

                    <p className="relative mt-2 text-caption text-secondary">
                      <span className="text-tertiary">{circuit}: </span>
                      {here ?? "first visit"}
                    </p>

                    {(c.insight || (isLoading && !intelligence)) && (
                      <div className="relative mt-3 border-t border-subtle pt-3">
                        {c.insight ? (
                          <p className="line-clamp-2 text-caption text-secondary">
                            <Icon icon={Sparkles} size={16} className="mr-1 inline align-[-3px] text-tertiary" label="Apex, AI" />
                            {c.insight}
                          </p>
                        ) : (
                          <div className="space-y-1.5" aria-hidden>
                            <Skeleton shape="text" className="w-full" />
                            <Skeleton shape="text" className="w-3/4" />
                          </div>
                        )}
                      </div>
                    )}
                  </Surface>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}
