"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { EntityAvatar } from "@/components/EntityAvatar";
import { LandingHero } from "@/components/home/landing/LandingHero";
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
export function PersonalHero({ publicData, personalData, firstName }: Props & { firstName: string }) {
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
      : `Welcome back, ${firstName}. Your pick for ${shortName(race)} isn't in yet.`;
  const action = completed ? (
    <Button variant="primary" size="lg" asChild>
      <Link href={`${href}#results`}>
        See how you did
        <Icon icon={ArrowRight} size={20} />
      </Link>
    </Button>
  ) : (
    <>
      <Button variant="primary" size="lg" asChild>
        <Link href={`${href}#pick`}>
          {pick ? "Change your pick" : "Make your pick"}
          <Icon icon={ArrowRight} size={20} />
        </Link>
      </Button>
      <Link href={href} className={TEXT_LINK}>
        Explore the race
      </Link>
    </>
  );
  return <LandingHero landing={publicData} greeting={greeting} actions={action} />;
}

// ------------------------------------------------------------------------------------------ 2. your weekend

function Podium({ codes, publicData }: { codes: readonly string[]; publicData: PublicHomeData }) {
  const nameOf = useNameOf(publicData);
  return (
    <ol className="mt-3 space-y-2.5">
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
 * "Your weekend" (critique §2.2): your pick beside the model's, and your record, as one row of three; then
 * where your favourites stand. It replaces the radar strip, Your F1 and Prediction intelligence.
 */
export function YourWeekendSection({ publicData, personalData }: Props) {
  const nameOf = useNameOf(publicData);
  const race = publicData.nextRace;
  const pick = personalData.myPick;
  const perf = personalData.predictionPerformance;
  const model = race?.simulation?.drivers?.length
    ? [...race.simulation.drivers].sort((a, b) => b.p1 - a.p1)
    : null;
  const modelOrder = model?.map((d) => d.driver) ?? race?.prediction?.finishOrder?.slice().sort((a, b) => a.predictedPosition - b.predictedPosition).map((o) => o.driver) ?? [];
  const leaderPoints = publicData.seasonRecap.driverLeader?.points ?? null;
  const favourites = [
    ...publicData.seasonRecap.favoriteDriverRanks.map((f) => ({ key: `d-${f.id}`, name: f.name, rank: f.rank, points: f.points, gap: leaderPoints !== null ? leaderPoints - f.points : null, kind: "Driver" })),
    ...publicData.seasonRecap.favoriteTeamRanks.map((f) => ({ key: `t-${f.id}`, name: f.name, rank: f.rank, points: f.points, gap: null, kind: "Team" })),
  ];
  type Fav = (typeof favourites)[number];
  const favColumns: TableColumn<Fav>[] = [
    { key: "name", header: "Favourite", render: (f) => <span className="font-medium text-primary">{f.name}</span> },
    { key: "kind", header: "", hideBelow: "sm", render: (f) => <span className="text-secondary">{f.kind}</span> },
    { key: "rank", header: "Pos", align: "end", numeric: true, render: (f) => `P${f.rank}` },
    { key: "points", header: "Pts", align: "end", numeric: true },
    { key: "gap", header: "To leader", align: "end", numeric: true, hideBelow: "sm", render: (f) => (f.gap === null ? "–" : f.gap === 0 ? "Leader" : `−${f.gap}`) },
  ];

  return (
    <Section id="your-weekend" level={2} title="Your weekend" description={race ? `${race.name}, round ${race.round}.` : undefined}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Surface level={1} as="section" aria-labelledby="yw-pick">
          <h3 id="yw-pick" className="text-body-sm font-semibold text-primary">
            Your pick
          </h3>
          {pick ? (
            <Podium codes={pick.predictedPodium} publicData={publicData} />
          ) : (
            <>
              <p className="mt-3 text-body-sm text-secondary">No pick yet. It locks at lights out.</p>
              {race && race.status !== "completed" && (
                <Link href={`${raceHref(race.year, race.round, race.name)}#pick`} className={`${TEXT_LINK} mt-3`}>
                  Make your pick <Icon icon={ArrowRight} size={16} />
                </Link>
              )}
            </>
          )}
        </Surface>

        <Surface level={1} as="section" aria-labelledby="yw-model">
          <h3 id="yw-model" className="text-body-sm font-semibold text-primary">
            The model
          </h3>
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
            <p className="mt-3 text-body-sm text-secondary">The model&rsquo;s pick appears after qualifying.</p>
          )}
        </Surface>

        <Surface level={1} as="section" aria-labelledby="yw-record">
          <h3 id="yw-record" className="text-body-sm font-semibold text-primary">
            Your record
          </h3>
          {perf.winner.total > 0 ? (
            <dl className="mt-3 grid grid-cols-3 gap-3">
              <div>
                <dt className="text-caption text-secondary">Winners</dt>
                <dd className="mt-1 text-title-md tabular text-primary">
                  {perf.winner.correct}/{perf.winner.total}
                </dd>
              </div>
              <div>
                <dt className="text-caption text-secondary">Podium places</dt>
                <dd className="mt-1 text-title-md tabular text-primary">
                  {perf.podiumSlots.correct}/{perf.podiumSlots.total}
                </dd>
              </div>
              <div>
                <dt className="text-caption text-secondary">Avg error</dt>
                <dd className="mt-1 text-title-md tabular text-primary">{perf.avgPositionError === null ? "–" : perf.avgPositionError.toFixed(1)}</dd>
              </div>
            </dl>
          ) : (
            <p className="mt-3 text-body-sm text-secondary">Your record starts with your first pick.</p>
          )}
          {personalData.latestPrediction?.status === "resolved" && (
            <p className="mt-4 text-body-sm text-secondary">
              Last pick, {personalData.latestPrediction.raceName}: {nameOf(personalData.latestPrediction.predictedWinner)} to win
              {personalData.latestPrediction.actualWinner ? `; ${nameOf(personalData.latestPrediction.actualWinner)} won.` : "."}
            </p>
          )}
        </Surface>
      </div>

      <div className="mt-8">
        {favourites.length > 0 ? (
          <Table caption="Where your favourites stand" columns={favColumns} rows={favourites} getRowKey={(f) => f.key} rowHeader="name" density="compact" />
        ) : (
          <p className="text-body-sm text-secondary">
            Pick favourite drivers and teams and they appear here, with where they stand.{" "}
            <Link href="/profile?section=personalisation" className={TEXT_LINK}>
              Choose favourites
            </Link>
          </p>
        )}
      </div>
    </Section>
  );
}

// ------------------------------------------------------------------------------------ 3. since last visit

function ago(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} h ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

/** What happened on your account, from real events only (picks and points), newest first (critique §2.2). */
export function SinceLastVisitSection({ personalData }: Pick<Props, "personalData">) {
  const items = personalData.recentActivity;
  return (
    <Section id="since-last-visit" level={2} title="Since your last visit">
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

// ---------------------------------------------------------------------------------------- 4. communities

/** At most three communities: yours, or ones to join when you have none (critique §2.2). */
export function YourCommunitiesSection({ personalData }: Pick<Props, "personalData">) {
  const mine = personalData.groups.slice(0, 3);
  const discover = mine.length === 0 ? personalData.discoverGroups.slice(0, 3) : [];
  const rows = mine.length
    ? mine.map((g) => ({
        id: g.id,
        name: g.name,
        avatarUrl: g.avatarUrl,
        detail: [`${g.memberCount} members`, g.myRank ? `you're #${g.myRank}` : null, g.activePredictions ? `${g.activePredictions} open ${g.activePredictions === 1 ? "prediction" : "predictions"}` : null].filter(Boolean).join(" · "),
      }))
    : discover.map((g) => ({ id: g.id, name: g.name, avatarUrl: g.avatarUrl, detail: `${g.memberCount} members` }));
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

// ------------------------------------------------------------------------------------------------ 5. season

type Standing = LandingSeason["top5"][number] & { position: number };

/** The championship's top five and the next three rounds (critique §2.2). */
export function PersonalSeasonSection({ publicData }: Pick<Props, "publicData">) {
  const season = publicData.season;
  if (!season || season.top5.length === 0) return null;
  const rows: Standing[] = season.top5.map((s, i) => ({ ...s, position: i + 1 }));
  const [leader, second] = rows;
  const columns: TableColumn<Standing>[] = [
    { key: "position", header: "Pos", numeric: true, width: "3.5rem" },
    { key: "driver", header: "Driver", render: (s) => <DriverIdentity code={s.driver} name={s.driverName} team={s.team} /> },
    { key: "wins", header: "Wins", align: "end", numeric: true },
    { key: "points", header: "Pts", align: "end", numeric: true, render: (s) => <span className="font-semibold">{s.points}</span> },
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
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} shape="block" className="h-40" />
        ))}
      </div>
      <Skeleton shape="block" className="mt-8 h-32" />
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
      <div className="mt-12">
        <YourWeekendSkeleton />
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
