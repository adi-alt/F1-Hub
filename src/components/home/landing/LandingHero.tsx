"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { EntityAvatar } from "@/components/EntityAvatar";
import { RaceReadiness } from "@/components/home/RaceReadiness";
import { StartLights } from "@/components/motion/StartLights";
import { RaceKeyFact } from "@/components/race/RaceKeyFact";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import type { LandingData } from "@/lib/homeData";
import { raceHref } from "@/lib/routes";
import { useAuthDialogStore } from "@/store/useAuthDialogStore";

type Fact = {
  key: string;
  name: string;
  detail: string;
  imageUrl: string | null;
  logo?: boolean;
};

/** Up to four real facts about the circuit, no more: who wins here, who podiums here, who won last time, which
 * current team wins here. Repeats are dropped (the most-wins driver is often the most-podiums driver too). */
function circuitFacts(
  history: NonNullable<LandingData["trackHistory"]>,
): Fact[] {
  const facts: Fact[] = [];
  const seen = new Set<string>();
  const add = (f: Fact) => {
    if (seen.has(f.key)) return;
    seen.add(f.key);
    facts.push(f);
  };
  if (history.topPerformer)
    add({
      key: history.topPerformer.driverId,
      name: history.topPerformer.driverName,
      detail: `Most wins here (${history.topPerformer.wins})`,
      imageUrl: history.topPerformer.photoUrl,
    });
  if (history.topPodiumDriver)
    add({
      key: history.topPodiumDriver.driverId,
      name: history.topPodiumDriver.driverName,
      detail: `Most podiums here (${history.topPodiumDriver.podiums})`,
      imageUrl: history.topPodiumDriver.photoUrl,
    });
  if (history.defendingWinner)
    add({
      key: `${history.defendingWinner.driverId}-defending`,
      name: history.defendingWinner.driverName,
      detail: `Won here in ${history.defendingWinner.year}`,
      imageUrl: history.defendingWinner.photoUrl,
    });
  if (history.topCurrentTeam)
    add({
      key: `team-${history.topCurrentTeam.name}`,
      name: history.topCurrentTeam.name,
      detail: `Most team wins here (${history.topCurrentTeam.wins})`,
      imageUrl: history.topCurrentTeam.logoUrl,
      logo: true,
    });
  return facts.slice(0, 4);
}

/**
 * The landing page's hero (critique §2.1): the next race, said plainly. One caption, the race as the page's
 * h1 at the hero size, the phase's key fact (the countdown), the weekend's sessions in your time, and one
 * primary action with sign-up as a quiet text link beside it. On the right, a few plain facts about the
 * circuit: no card chrome, nothing competing with the countdown. The race photo behind it (HomeLayout) is
 * the page's one atmospheric element.
 */
export function LandingHero({
  landing,
  greeting,
  actions,
  aside,
}: {
  landing: LandingData;
  /** Signed in: a muted line above the race ("Welcome back, Sam. Your pick isn't in yet."). */
  greeting?: string;
  /** Signed in: the one action that follows the user's state, in place of the sign-up prompt. */
  actions?: ReactNode;
  /** Signed in: the right-hand widget in place of the plain circuit facts. */
  aside?: ReactNode;
}) {
  const openAuth = useAuthDialogStore((s) => s.open);
  const race = landing.nextRace;
  if (!race) return null;
  const facts = landing.trackHistory ? circuitFacts(landing.trackHistory) : [];

  return (
    <div className="grid grid-cols-1 gap-10 pt-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-stretch lg:gap-16 lg:pt-14">
      {/* Both columns share a top and a bottom edge: the lights line up with the widget's top, the action
          with its bottom. */}
      <div className="flex min-w-0 flex-col">
        <StartLights className="mb-6 lg:mb-auto" />
        {greeting && (
          <p className="mb-3 text-body text-secondary">{greeting}</p>
        )}
        <p className="text-body-sm text-secondary">
          Round {race.round} of the {race.year} season · {race.circuit}
        </p>
        <h1 className="mt-2 text-display-lg text-primary sm:text-display-xl">
          {race.name}
        </h1>

        <div className="mt-8">
          <RaceKeyFact sessions={landing.calendarEntry?.sessions ?? []} />
        </div>

        {landing.calendarEntry && (
          <div className="mt-8 max-w-xl">
            <RaceReadiness calendarEntry={landing.calendarEntry} race={race} />
          </div>
        )}

        <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3">
          {actions ?? (
            <>
              <Button variant="primary" size="md" asChild>
                <Link href={raceHref(race.year, race.round, race.name)}>
                  Explore the race
                  <Icon icon={ArrowRight} size={16} />
                </Link>
              </Button>
              <button
                type="button"
                onClick={openAuth}
                className="rounded-control text-body-sm font-medium text-secondary underline-offset-4 transition-colors duration-fast hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
              >
                Create a free account to make your pick
              </button>
            </>
          )}
        </div>
      </div>

      {aside ?? (facts.length > 0 && landing.trackHistory && (
        <section aria-labelledby="circuit-facts" className="min-w-0">
          <h2 id="circuit-facts" className="text-title-md text-primary">
            At {race.circuit}
          </h2>
          <p className="mt-1 text-body-sm text-secondary">
            {landing.trackHistory.totalRaces} Grands Prix since{" "}
            {landing.trackHistory.firstYear}
          </p>
          <ul className="mt-4 divide-y divide-subtle">
            {facts.map((f) => (
              <li key={f.key} className="flex items-center gap-3 py-3">
                <EntityAvatar
                  imageUrl={f.imageUrl}
                  name={f.name}
                  size={36}
                  shape={f.logo ? "square" : "circle"}
                  fit={f.logo ? "contain" : "cover"}
                />
                <span className="min-w-0">
                  <span className="block truncate text-body-sm font-medium text-primary">
                    {f.name}
                  </span>
                  <span className="block text-caption text-secondary">
                    {f.detail}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
