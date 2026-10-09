"use client";

import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { EntityAvatar } from "@/components/EntityAvatar";
import { useHomepageIntelligence } from "@/components/home/ai/HomepageIntelligenceProvider";
import { LandingHero } from "@/components/home/landing/LandingHero";
import { CountUp } from "@/components/motion/CountUp";
import { Typewriter } from "@/components/motion/Typewriter";
import { tiltProps } from "@/components/motion/useTilt";
import { teamColor } from "@/lib/teamColors";
import { Button } from "@/components/ui/Button";
import { DriverIdentity } from "@/components/ui/DriverIdentity";
import { Icon } from "@/components/ui/Icon";
import { ProvenanceLine } from "@/components/ui/ProvenanceLine";
import { Section } from "@/components/ui/Section";
import { Skeleton, SkeletonGroup } from "@/components/ui/Skeleton";
import { Surface } from "@/components/ui/Surface";
import { Table, type TableColumn } from "@/components/ui/Table";
import type { LandingSeason, PersonalHomeData, PublicHomeData } from "@/lib/homeData";
import { groupHref, raceHref, seasonHref } from "@/lib/routes";
import type { RaceDoc } from "@/lib/types/race";

const TEXT_LINK =
  "inline-flex items-center gap-1 rounded-control text-body-sm font-medium text-secondary underline-offset-4 transition-colors duration-fast hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring";

type Props = { publicData: PublicHomeData; personalData: PersonalHomeData };

/** A driver code's display name: the race's own grid first, then this season's roster, else the code. */
function useNameOf(publicData: PublicHomeData) {
  const race = publicData.nextRace;
  return (code: string) => race?.inputs?.find((i) => i.driver === code)?.driverName ?? publicData.currentDrivers.find((d) => d.code === code)?.name ?? code;
}
function teamOf(publicData: PublicHomeData, code: string) {
  return publicData.nextRace?.inputs?.find((i) => i.driver === code)?.team ?? publicData.currentDrivers.find((d) => d.code === code)?.team;
}

const shortName = (race: RaceDoc) => race.name.replace(/ Grand Prix$/, "");

// ------------------------------------------------------------------------------------------------ 1. hero

/**
 * The race is the page's h1 and the greeting a muted line above it (critique §2.2). One primary action that
 * follows the user's state: make the pick, change it, or, once the race has run, see how it went.
 */
export function PersonalHero({ publicData, personalData, firstName, onPredict }: Props & { firstName: string; onPredict?: () => void }) {
  const race = publicData.nextRace;
  const nameOf = useNameOf(publicData);
  if (!race) return null;
  const pick = personalData.myPick;
  const completed = race.status === "completed";
  const href = raceHref(race.year, race.round, race.name);
  const greeting = completed
    ? `Welcome back, ${firstName}. The ${shortName(race)} results are in.`
    : pick
      ? `Welcome back, ${firstName}. Your pick: ${nameOf(pick.predictedWinner)} to win.`
      : `Welcome back, ${firstName}. Your predictions for ${shortName(race)} aren't in yet.`;
  const action = completed ? (
    <Button variant="primary" size="lg" asChild>
      <Link href={`${href}#results`}>
        See how you did
        <Icon icon={ArrowRight} size={20} />
      </Link>
    </Button>
  ) : (
    <>
      {onPredict ? (
        <Button variant="primary" size="lg" onClick={onPredict}>
          {pick ? "Edit your predictions" : "Make your predictions"}
          <Icon icon={ArrowRight} size={20} />
        </Button>
      ) : (
        <Button variant="primary" size="lg" asChild>
          <Link href={`${href}#pick`}>
            {pick ? "Edit your predictions" : "Make your predictions"}
            <Icon icon={ArrowRight} size={20} />
          </Link>
        </Button>
      )}
      <Link href={href} className={TEXT_LINK}>
        Explore the race
      </Link>
    </>
  );
  return <LandingHero landing={publicData} greeting={greeting} actions={action} />;
}

// ---------------------------------------------------------------------------------------- 2. apex briefing

/** "AI summary · Apex": the label every generated sentence on this page carries (spec §4.11). */
function AiLabel({ children = "Apex · AI summary" }: { children?: string }) {
  return (
    <p className="flex items-center gap-1.5 text-caption text-tertiary">
      <Icon icon={Sparkles} size={16} className="text-brand-text" />
      {children}
    </p>
  );
}

/**
 * The weekend in Apex's words, and what it means for you: the race brief beside your personal brief, then the
 * one thing to watch and the biggest uncertainty. Model-written and labelled so; while it loads the panel keeps
 * its shape, and without it (no AI, an error) the section is simply not there.
 */
export function ApexBriefingSection() {
  const { intelligence, isLoading } = useHomepageIntelligence();
  if (!intelligence) {
    return isLoading ? (
      <Surface level={1} aria-busy="true" aria-label="Loading the Apex briefing">
        <SkeletonGroup>
          <Skeleton shape="text" className="w-40" />
          <div className="mt-4 grid gap-8 md:grid-cols-2">
            <div>
              <Skeleton shape="block" className="h-6 w-4/5" />
              <Skeleton shape="text" className="mt-3 w-full" />
              <Skeleton shape="text" className="mt-2 w-3/4" />
            </div>
            <div>
              <Skeleton shape="block" className="h-6 w-3/5" />
              <Skeleton shape="text" className="mt-3 w-full" />
              <Skeleton shape="text" className="mt-2 w-2/3" />
            </div>
          </div>
        </SkeletonGroup>
      </Surface>
    ) : null;
  }
  const race = intelligence.raceBrief;
  const mine = intelligence.personalRaceBrief;
  const outlook = intelligence.personalOutlook;
  return (
    <section aria-labelledby="apex-briefing">
      <h2 id="apex-briefing" className="sr-only">
        Apex briefing
      </h2>
      <Surface level={1}>
        <AiLabel>Apex briefing · AI summary</AiLabel>
        <div className="mt-4 grid grid-cols-1 gap-8 md:grid-cols-2 md:gap-10">
          <div className="min-w-0">
            <p className="text-caption text-secondary">This weekend</p>
            <p className="mt-1 text-title-md text-primary">
              <Typewriter text={race.headline} />
            </p>
            <p className="mt-2 text-body-sm text-secondary">{race.whyItMatters}</p>
            {race.keyFactor && (
              <p className="mt-3 text-body-sm text-secondary">
                <span className="font-medium text-primary">Key factor: </span>
                {race.keyFactor}
              </p>
            )}
          </div>
          {(mine || outlook) && (
            <div className="min-w-0 md:border-l md:border-subtle md:pl-10">
              <p className="text-caption text-secondary">For you{outlook ? ` · ${outlook.driver}` : ""}</p>
              <p className="mt-1 text-title-md text-primary">{mine?.headline ?? outlook!.overallAssessment}</p>
              <p className="mt-2 text-body-sm text-secondary">{mine ? mine.whyItMatters : outlook!.championshipContext}</p>
              {mine?.favoriteDriverAngle && <p className="mt-3 text-body-sm text-secondary">{mine.favoriteDriverAngle}</p>}
            </div>
          )}
        </div>
        <dl className="mt-6 grid grid-cols-1 gap-4 border-t border-subtle pt-5 sm:grid-cols-2">
          <div className="min-w-0">
            <dt className="text-caption text-secondary">One thing to watch</dt>
            <dd className="mt-1 text-body-sm text-primary">
              <span className="font-medium">{intelligence.oneThingToWatch.topic}.</span> <span className="text-secondary">{intelligence.oneThingToWatch.explanation}</span>
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-caption text-secondary">Biggest uncertainty</dt>
            <dd className="mt-1 text-body-sm text-primary">
              <span className="font-medium">{intelligence.biggestUncertainty.title}.</span> <span className="text-secondary">{intelligence.biggestUncertainty.explanation}</span>
            </dd>
          </div>
        </dl>
      </Surface>
    </section>
  );
}

// ------------------------------------------------------------------------------------------ 3. your weekend

function Podium({ codes, publicData }: { codes: readonly string[]; publicData: PublicHomeData }) {
  const nameOf = useNameOf(publicData);
  return (
    <ol className="mt-3 space-y-2">
      {codes.slice(0, 3).map((code, i) => (
        <li key={`${code}-${i}`} className="flex items-center gap-3">
          <span className="w-5 text-body-sm tabular text-secondary">P{i + 1}</span>
          <DriverIdentity code={code} name={nameOf(code)} team={teamOf(publicData, code) ?? ""} nameVisibility="always" className="min-w-0" />
        </li>
      ))}
    </ol>
  );
}

/**
 * "Your weekend" (critique §2.2): your pick, the model's and your record as three columns of one panel, and
 * Apex's read on your pick once you have made one.
 */
export function YourWeekendSection({ publicData, personalData, onPredict }: Props & { onPredict?: () => void }) {
  const nameOf = useNameOf(publicData);
  const { intelligence } = useHomepageIntelligence();
  const race = publicData.nextRace;
  const pick = personalData.myPick;
  const perf = personalData.predictionPerformance;
  const model = race?.simulation?.drivers?.length ? [...race.simulation.drivers].sort((a, b) => b.p1 - a.p1) : null;
  const modelOrder = model?.map((d) => d.driver) ?? race?.prediction?.finishOrder?.slice().sort((a, b) => a.predictedPosition - b.predictedPosition).map((o) => o.driver) ?? [];
  const challenge = intelligence?.predictionChallenge;
  const COL = "min-w-0 py-5 first:pt-0 last:pb-0 md:px-6 md:py-0 md:first:pl-0 md:last:pr-0";

  return (
    <Section id="your-weekend" level={2} title="Your weekend" description={race ? `${race.name}, round ${race.round}.` : undefined}>
      <Surface level={1} padding="md">
        <div className="grid grid-cols-1 divide-y divide-subtle md:grid-cols-3 md:divide-x md:divide-y-0">
          <div className={COL}>
            <h3 className="text-body-sm font-semibold text-primary">Your pick</h3>
            {pick ? (
              <Podium codes={pick.predictedPodium} publicData={publicData} />
            ) : (
              <>
                <p className="mt-2 text-body-sm text-secondary">Not in yet. It locks at lights out.</p>
                {race && race.status !== "completed" &&
                  (onPredict ? (
                    <button type="button" onClick={onPredict} className={`${TEXT_LINK} mt-2`}>
                      Make your predictions <Icon icon={ArrowRight} size={16} />
                    </button>
                  ) : (
                    <Link href={`${raceHref(race.year, race.round, race.name)}#pick`} className={`${TEXT_LINK} mt-2`}>
                      Make your predictions <Icon icon={ArrowRight} size={16} />
                    </Link>
                  ))}
              </>
            )}
          </div>
          <div className={COL}>
            <h3 className="text-body-sm font-semibold text-primary">The model</h3>
            {modelOrder.length > 0 ? (
              <>
                <Podium codes={modelOrder} publicData={publicData} />
                <ProvenanceLine
                  className="mt-3"
                  source={`Apex model ${race?.simulation?.modelVersion ?? race?.prediction?.modelVersion ?? ""}`.trim()}
                  status={model ? `${Math.round(model[0].p1 * 100)}% to win` : "predicted order"}
                />
              </>
            ) : (
              <p className="mt-2 text-body-sm text-secondary">Publishes after qualifying, frozen before the start.</p>
            )}
          </div>
          <div className={COL}>
            <h3 className="text-body-sm font-semibold text-primary">Your record</h3>
            {perf.winner.total > 0 ? (
              <dl className="mt-2 grid grid-cols-3 gap-3">
                {[
                  ["Winners", `${perf.winner.correct}/${perf.winner.total}`],
                  ["Podium places", `${perf.podiumSlots.correct}/${perf.podiumSlots.total}`],
                  ["Avg error", perf.avgPositionError === null ? "–" : perf.avgPositionError.toFixed(1)],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-caption text-secondary">{label}</dt>
                    <dd className="mt-0.5 text-title-md tabular text-primary">{value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="mt-2 text-body-sm text-secondary">Starts with your first pick.</p>
            )}
            {personalData.latestPrediction?.status === "resolved" && (
              <p className="mt-3 text-caption text-secondary">
                Last time, {personalData.latestPrediction.raceName.replace(/ Grand Prix$/, "")}: you picked {nameOf(personalData.latestPrediction.predictedWinner)}
                {personalData.latestPrediction.actualWinner ? `, ${nameOf(personalData.latestPrediction.actualWinner)} won.` : "."}
              </p>
            )}
          </div>
        </div>
        {pick && challenge && challenge.status !== "NO_PICK" && (
          <div className="mt-5 border-t border-subtle pt-5">
            <AiLabel>{`Apex on your pick · ${challenge.status === "AGREE" ? "agrees" : "disagrees"} · AI summary`}</AiLabel>
            <p className="mt-1.5 text-body-sm text-secondary">{challenge.explanation}</p>
          </div>
        )}
      </Surface>
    </Section>
  );
}

// ----------------------------------------------------------------------------------- 4. your drivers/teams

/**
 * Your favourites, one compact card each: where they stand in the championship and how they have done at this
 * circuit, with Apex's read on your main driver. Replaces the radar strip and the Your F1 tabs.
 */
export function YourDriversSection({ publicData, personalData }: Props) {
  const { intelligence } = useHomepageIntelligence();
  const recap = publicData.seasonRecap;
  const leader = recap.driverLeader?.points ?? null;
  const history = publicData.trackHistory;
  const circuit = publicData.nextRace?.circuit ?? "this circuit";
  const headshot = (code: string | null) => publicData.currentDrivers.find((d) => d.code === code)?.headshotUrl ?? null;
  const n = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;
  const record = (s: { appearances: number; wins: number; podiums: number } | undefined) =>
    s
      ? s.wins
        ? `${n(s.wins, "win")}, ${n(s.podiums, "podium")} in ${n(s.appearances, "start")}`
        : s.podiums
          ? `${n(s.podiums, "podium")} in ${n(s.appearances, "start")}`
          : `${n(s.appearances, "start")}, no podium yet`
      : null;

  const drivers = personalData.favoriteDrivers.map((d, i) => {
    const rank = recap.favoriteDriverRanks.find((r) => r.id === d.driverId || r.code === d.code);
    const stats = history?.favoriteDriverCircuitStatsList.find((s) => s.driverId === d.driverId);
    return {
      key: `d-${d.driverId}`,
      team: d.team || publicData.currentDrivers.find((x) => x.code === d.code)?.team || null,
      name: d.name,
      href: d.href,
      image: d.headshotUrl ?? headshot(d.code),
      logo: false,
      standing: rank ? `P${rank.rank} · ${rank.points} pts${leader !== null ? (leader - rank.points === 0 ? " · leads" : ` · ${leader - rank.points} behind`) : ""}` : d.isActiveThisSeason ? "Not classified yet" : `Raced ${d.firstYear}–${d.lastYear}`,
      here: record(stats),
      insight: i === 0 ? intelligence?.favoriteDriverInsight ?? null : null,
    };
  });
  const teams = personalData.favoriteTeams.map((t, i) => {
    const rank = recap.favoriteTeamRanks.find((r) => r.id === t.teamId);
    const stats = history?.favoriteTeamCircuitStatsList.find((s) => s.teamId === t.teamId);
    return {
      key: `t-${t.teamId}`,
      team: t.currentName ?? t.name,
      name: t.name,
      href: t.href,
      image: t.logoUrl,
      logo: true,
      standing: rank ? `P${rank.rank} in the constructors · ${rank.points} pts` : "Not on the grid this season",
      here: record(stats),
      insight: i === 0 ? intelligence?.favoriteTeamInsight ?? null : null,
    };
  });
  const cards = [...drivers, ...teams];

  return (
    <Section id="your-favourites" level={2} title="Your drivers and teams" description={cards.length ? `Their season, and their record at ${circuit}.` : undefined}>
      {cards.length === 0 ? (
        <p className="text-body-sm text-secondary">
          Choose favourite drivers and teams to follow them here.{" "}
          <Link href="/profile?section=personalisation" className={TEXT_LINK}>
            Choose favourites
          </Link>
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map((c) => (
            <li key={c.key} className="min-w-0">
              <div {...tiltProps(c.team ? teamColor(c.team) : null)} className="tilt h-full rounded-card">
              <Surface level={1} padding="sm" interactive href={c.href} linkLabel={c.name} className="h-full">
                <div className="flex items-center gap-3">
                  <EntityAvatar imageUrl={c.image} name={c.name} size={40} shape={c.logo ? "square" : "circle"} fit={c.logo ? "contain" : "cover"} />
                  <div className="min-w-0">
                    <p className="truncate text-body-sm font-semibold text-primary">{c.name}</p>
                    <p className="text-caption tabular text-secondary">{c.standing}</p>
                  </div>
                </div>
                {c.here && (
                  <p className="mt-3 text-caption text-secondary">
                    <span className="text-tertiary">At {circuit}: </span>
                    {c.here}
                  </p>
                )}
                {c.insight && (
                  <p className="mt-2 line-clamp-3 text-caption text-secondary">
                    <Icon icon={Sparkles} size={16} className="mr-1 inline align-[-3px] text-brand-text" label="AI summary" />
                    {c.insight}
                  </p>
                )}
              </Surface>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

// ------------------------------------------------------------------------------------ 5. since last visit

function ago(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} h ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

/** What happened on your account, from real events only (picks and points), newest first (critique §2.2). */
export function SinceLastVisitSection({ personalData }: Pick<Props, "personalData">) {
  const { intelligence } = useHomepageIntelligence();
  const items = personalData.recentActivity;
  const summary = intelligence?.sinceLastVisit?.summary;
  return (
    <Section id="since-last-visit" level={2} title="Since your last visit">
      {summary && (
        <div className="mb-3">
          <AiLabel />
          <p className="mt-1 text-body-sm text-secondary">{summary}</p>
        </div>
      )}
      {items.length === 0 ? (
        <p className="text-body-sm text-secondary">Nothing yet. Your picks and points show here as they happen.</p>
      ) : (
        <ul className="divide-y divide-subtle">
          {items.map((a) => (
            <li key={a.key} className="flex items-baseline justify-between gap-4 py-3">
              <span className="min-w-0 text-body-sm text-primary">{a.text}</span>
              <time dateTime={a.timestamp} className="shrink-0 text-caption tabular text-secondary" suppressHydrationWarning>
                {ago(a.timestamp)}
              </time>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------------------------------- 6. communities

/** At most three communities: yours, or ones to join when you have none (critique §2.2). */
export function YourCommunitiesSection({ personalData }: Pick<Props, "personalData">) {
  const mine = personalData.groups.slice(0, 3);
  const discover = mine.length === 0 ? personalData.discoverGroups.slice(0, 3) : [];
  const rows = mine.length
    ? mine.map((g) => ({
        id: g.id,
        name: g.name,
        avatarUrl: g.avatarUrl,
        detail: [`${g.memberCount} ${g.memberCount === 1 ? "member" : "members"}`, g.myRank ? `you're #${g.myRank}` : null, g.activePredictions ? `${g.activePredictions} open ${g.activePredictions === 1 ? "prediction" : "predictions"}` : null].filter(Boolean).join(" · "),
      }))
    : discover.map((g) => ({ id: g.id, name: g.name, avatarUrl: g.avatarUrl, detail: `${g.memberCount} ${g.memberCount === 1 ? "member" : "members"}` }));
  return (
    <Section
      id="your-communities"
      level={2}
      title={mine.length ? "Your communities" : "Communities to join"}
      actions={
        <Link href="/groups" className={TEXT_LINK}>
          All communities <Icon icon={ArrowRight} size={16} />
        </Link>
      }
    >
      {rows.length === 0 ? (
        <p className="text-body-sm text-secondary">No communities yet. Start one, or browse the open ones.</p>
      ) : (
        <ul className="divide-y divide-subtle">
          {rows.map((g) => (
            <li key={g.id}>
              <Link
                href={groupHref(g.id)}
                className="-mx-3 flex items-center gap-3 rounded-control px-3 py-3 transition-colors duration-fast hover:bg-surface-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
              >
                <EntityAvatar imageUrl={g.avatarUrl} name={g.name} seed={g.id} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body-sm font-medium text-primary">{g.name}</span>
                  <span className="block text-caption text-secondary">{g.detail}</span>
                </span>
                <Icon icon={ArrowRight} size={16} className="shrink-0 text-tertiary" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ 7. season

type Standing = LandingSeason["top5"][number] & { position: number };

/** The championship's top five and the next three rounds (critique §2.2). */
export function PersonalSeasonSection({ publicData }: Pick<Props, "publicData">) {
  const narrative = useHomepageIntelligence().intelligence?.seasonNarrative;
  const season = publicData.season;
  if (!season || season.top5.length === 0) return null;
  const rows: Standing[] = season.top5.map((s, i) => ({ ...s, position: i + 1 }));
  const [leader, second] = rows;
  const columns: TableColumn<Standing>[] = [
    { key: "position", header: "Pos", numeric: true, width: "3.5rem" },
    { key: "driver", header: "Driver", render: (s) => <DriverIdentity code={s.driver} name={s.driverName} team={s.team} /> },
    { key: "wins", header: "Wins", align: "end", numeric: true },
    { key: "points", header: "Pts", align: "end", numeric: true, render: (s) => <span className="font-semibold"><CountUp value={s.points} /></span> },
  ];
  const nextRound = publicData.nextRace?.round ?? 0;
  const upcoming = publicData.races
    .filter((r) => r.round > nextRound && r.status !== "completed")
    .sort((a, b) => a.round - b.round)
    .slice(0, 3);
  const dateOf = (round: number) => {
    const d = publicData.calendarByRound[round]?.raceDate;
    return d ? new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) : "";
  };
  return (
    <Section
      id="season"
      level={2}
      title={`${publicData.year} season`}
      description={`${leader.driverName} leads${second ? ` by ${leader.points - second.points} points` : ""} after ${season.roundsCompleted} of ${season.totalRounds} rounds.`}
    >
      {narrative && (
        <div className="mb-5 max-w-3xl">
          <AiLabel />
          <p className="mt-1 text-body-sm text-secondary">{narrative}</p>
        </div>
      )}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start">
        <div className="min-w-0">
          <Table caption={`${publicData.year} drivers' championship, top five`} columns={columns} rows={rows} getRowKey={(s) => s.driver} rowHeader="driver" />
          <Link href={seasonHref(publicData.year)} className={`${TEXT_LINK} mt-3`}>
            Full standings <Icon icon={ArrowRight} size={16} />
          </Link>
        </div>
        {upcoming.length > 0 && (
          <Surface level={1} as="section" aria-labelledby="coming-up">
            <h3 id="coming-up" className="text-body-sm font-semibold text-primary">
              Coming up
            </h3>
            <ol className="mt-3 divide-y divide-subtle">
              {upcoming.map((r) => (
                <li key={r.id}>
                  <Link
                    href={raceHref(r.year, r.round, r.name)}
                    className="-mx-2 flex items-baseline justify-between gap-3 rounded-control px-2 py-2.5 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                  >
                    <span className="min-w-0 truncate text-body-sm text-primary">
                      <span className="tabular text-secondary">R{r.round}</span> {r.name}
                    </span>
                    <span className="shrink-0 text-caption tabular text-secondary">{dateOf(r.round)}</span>
                  </Link>
                </li>
              ))}
            </ol>
          </Surface>
        )}
      </div>
    </Section>
  );
}

// --------------------------------------------------------------------------------------------- skeletons

function SectionHeadSkeleton() {
  return (
    <>
      <Skeleton shape="block" className="h-7 w-48" />
      <Skeleton shape="text" className="mt-2 w-64" />
    </>
  );
}

/** The hero's outline: caption, the race title, the countdown, sessions, the action; facts on the right. */
export function HeroSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-10 pt-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-end lg:gap-16 lg:pt-14">
      <div>
        <Skeleton shape="text" className="w-72 max-w-full" />
        <Skeleton shape="text" className="mt-3 w-56" />
        <Skeleton shape="block" className="mt-3 h-14 w-full max-w-xl sm:h-16" />
        <Skeleton shape="block" className="mt-8 h-12 w-64" />
        <Skeleton shape="block" className="mt-8 h-16 w-full max-w-xl" />
        <Skeleton shape="block" className="mt-10 h-12 w-48" />
      </div>
      <div>
        <Skeleton shape="block" className="h-6 w-40" />
        <Skeleton shape="text" className="mt-2 w-48" />
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="mt-4 flex items-center gap-3">
            <Skeleton shape="circle" className="size-9" />
            <div className="flex-1">
              <Skeleton shape="text" className="w-32" />
              <Skeleton shape="text" className="mt-1.5 w-24" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function YourWeekendSkeleton() {
  return (
    <div>
      <SectionHeadSkeleton />
      <Skeleton shape="block" className="mt-4 h-36" />
    </div>
  );
}

export function FavouritesSkeleton() {
  return (
    <div>
      <SectionHeadSkeleton />
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} shape="block" className="h-28" />
        ))}
      </div>
    </div>
  );
}

export function ListSectionSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div>
      <SectionHeadSkeleton />
      <div className="mt-4 space-y-3">
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} shape="block" className="h-12" />
        ))}
      </div>
    </div>
  );
}

export function SeasonSkeleton() {
  return (
    <div>
      <SectionHeadSkeleton />
      <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <Skeleton shape="block" className="h-64" />
        <Skeleton shape="block" className="h-44" />
      </div>
    </div>
  );
}

/** The signed-in home's outline, section for section (audit CR-18: same count and shape as the page). */
export function PersonalHomeOutline() {
  return (
    <SkeletonGroup>
      <HeroSkeleton />
      <Skeleton shape="block" className="mt-12 h-56" />
      <div className="mt-12">
        <YourWeekendSkeleton />
      </div>
      <div className="mt-12">
        <FavouritesSkeleton />
      </div>
      <div className="mt-12 grid grid-cols-1 gap-12 lg:grid-cols-2">
        <ListSectionSkeleton rows={4} />
        <ListSectionSkeleton rows={3} />
      </div>
      <div className="mt-12">
        <SeasonSkeleton />
      </div>
    </SkeletonGroup>
  );
}
