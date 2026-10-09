"use client";

import { HomeLayout } from "./HomeLayout";
import { HomepageApexScope } from "./ai/HomepageApexScope";
import {
  PersonalHero,
  PersonalHomeOutline,
  PersonalSeasonSection,
  SinceLastVisitSection,
  YourCommunitiesSection,
  YourWeekendSection,
} from "./personal/PersonalSections";
import { RegionBoundary } from "@/components/ui/RegionBoundary";
import { buildHomeApexFacts } from "@/lib/ai/context/homeFacts";
import type { PersonalHomeData, PublicHomeData } from "@/lib/homeData";

/**
 * The signed-in home (critique §2.2, CR-18): five sections, in the order a returning fan wants them. The race
 * and your one action; your weekend (your pick, the model's, your record, your favourites); what happened
 * since your last visit; your communities; the season. Each is its own failure region, so one bad read shows
 * an inline error there and the rest of the page still works. Sections sit 48px apart, the race photo behind
 * the hero is the one atmospheric element, and the skeleton (PersonalHomeSkeleton) has the same five shapes.
 */
export function PersonalHome({
  publicData,
  personalData,
  firstName,
}: {
  publicData: PublicHomeData;
  personalData: PersonalHomeData;
  firstName: string;
  isReturning: boolean;
}) {
  return (
    <>
      <HomeLayout
        photos={publicData.backdropPhotos}
        sections={[
          {
            tier: "major",
            content: (
              <RegionBoundary label="the next race">
                <PersonalHero publicData={publicData} personalData={personalData} firstName={firstName} />
              </RegionBoundary>
            ),
          },
          {
            tier: "major",
            content: (
              <RegionBoundary label="your weekend">
                <YourWeekendSection publicData={publicData} personalData={personalData} />
              </RegionBoundary>
            ),
          },
          {
            tier: "major",
            // Two short lists side by side from lg: neither leaves the other a column of empty space.
            content: (
              <div className="grid grid-cols-1 gap-12 lg:grid-cols-2">
                <RegionBoundary label="your recent activity">
                  <SinceLastVisitSection personalData={personalData} />
                </RegionBoundary>
                <RegionBoundary label="your communities">
                  <YourCommunitiesSection personalData={personalData} />
                </RegionBoundary>
              </div>
            ),
          },
          {
            tier: "major",
            content: (
              <RegionBoundary label="the season">
                <PersonalSeasonSection publicData={publicData} />
              </RegionBoundary>
            ),
          },
        ]}
      />

      {/* Apex is global (ApexLauncher, root layout); the home contributes its facts as the launcher's scope. */}
      <HomepageApexScope
        raceName={publicData.nextRace?.name}
        favoriteDriverName={personalData.favoriteDriver?.name}
        favoriteTeamName={personalData.favoriteTeam?.name}
        facts={buildHomeApexFacts(publicData, personalData, Intl.DateTimeFormat().resolvedOptions().timeZone)}
      />
    </>
  );
}

/** Shown while the signed-in data loads: the same five sections, in the same places. */
export function PersonalHomeSkeleton() {
  return (
    <HomeLayout photos={[]}>
      <PersonalHomeOutline />
    </HomeLayout>
  );
}
