"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { HomeLayout } from "./HomeLayout";
import { PredictionSheet } from "@/components/predictions/PredictionSheet";
import { HomepageApexScope } from "./ai/HomepageApexScope";
import { HomepageIntelligenceProvider } from "./ai/HomepageIntelligenceProvider";
import {
  ApexBriefingSection,
  PersonalHero,
  PersonalHomeOutline,
  PersonalSeasonSection,
  SinceLastVisitSection,
  YourCommunitiesSection,
  YourDriversSection,
  YourWeekendSection,
} from "./personal/PersonalSections";
import { RegionBoundary } from "@/components/ui/RegionBoundary";
import { StandingsTicker, standingsTickerItems } from "@/components/motion/StandingsTicker";
import { buildHomeApexFacts } from "@/lib/ai/context/homeFacts";
import type { PersonalHomeData, PublicHomeData } from "@/lib/homeData";

/**
 * The signed-in home (critique §2.2, CR-18), in the order a returning fan wants it: the race and your one action;
 * Apex's briefing (the weekend, and what it means for you); your weekend (your pick, the model's, your record);
 * your drivers and teams; what happened since your last visit; your communities; the season. Model-written text
 * is labelled as AI wherever it appears. Each is its own failure region, so one bad read shows
 * an inline error there and the rest of the page still works. Sections sit 48px apart, the race photo behind
 * the hero is the one atmospheric element, and the skeleton (PersonalHomeSkeleton) has the same shapes.
 */
export function PersonalHome(props: { publicData: PublicHomeData; personalData: PersonalHomeData; firstName: string; isReturning: boolean }) {
  // Refetch the briefing only when the favourite set (or its order: the first is "primary") changes, not on
  // every new object identity from a router.refresh().
  const profile = props.personalData.profile;
  const favoriteContextKey = `${(profile?.favoriteDrivers ?? []).join(",")}|${(profile?.favoriteTeams ?? []).join(",")}|${(profile?.favoriteTracks ?? []).join(",")}`;
  return (
    <HomepageIntelligenceProvider favoriteContextKey={favoriteContextKey}>
      <PersonalHomeInner {...props} />
    </HomepageIntelligenceProvider>
  );
}

function PersonalHomeInner({
  publicData,
  personalData,
  firstName,
}: {
  publicData: PublicHomeData;
  personalData: PersonalHomeData;
  firstName: string;
  isReturning: boolean;
}) {
  const router = useRouter();
  const [predicting, setPredicting] = useState(false);
  const race = publicData.nextRace;
  // The prediction window opens over the home for a race that can still be picked; otherwise the buttons link
  // to the race page instead.
  const canPredict = !!race && race.status !== "completed";
  const entrants = race?.inputs?.length ? race.inputs : publicData.currentDrivers.map((d) => ({ driver: d.code, driverName: d.name, team: d.team }));
  const onPredict = canPredict ? () => setPredicting(true) : undefined;
  return (
    <>
      <HomeLayout
        photos={publicData.backdropPhotos}
        sections={[
          {
            tier: "major",
            content: (
              <RegionBoundary label="the next race">
                <PersonalHero publicData={publicData} personalData={personalData} firstName={firstName} onPredict={onPredict} />
              </RegionBoundary>
            ),
          },
          {
            tier: "compact",
            content: <StandingsTicker label={`${publicData.year} drivers' championship`} items={standingsTickerItems(publicData.season?.ticker)} />,
          },
          {
            tier: "major",
            content: (
              <RegionBoundary label="the Apex briefing">
                <ApexBriefingSection />
              </RegionBoundary>
            ),
          },
          {
            tier: "major",
            content: (
              <RegionBoundary label="your weekend">
                <YourWeekendSection publicData={publicData} personalData={personalData} onPredict={onPredict} />
              </RegionBoundary>
            ),
          },
          {
            tier: "major",
            content: (
              <RegionBoundary label="your drivers and teams">
                <YourDriversSection publicData={publicData} personalData={personalData} />
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

      {canPredict && race && (
        <PredictionSheet
          open={predicting}
          onClose={() => setPredicting(false)}
          race={race}
          entrants={entrants}
          sessions={publicData.calendarEntry?.sessions ?? []}
          onSaved={() => router.refresh()}
        />
      )}

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
