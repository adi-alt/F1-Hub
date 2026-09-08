"use client";

import { CommunitySection, CommunitySectionSkeleton } from "./CommunitySection";
import { HomeLayout } from "./HomeLayout";
import { IntelligenceSection, IntelligenceSkeleton } from "./IntelligenceSection";
import { RaceHero, RaceHeroSkeleton } from "./RaceHero";
import { RecentActivity, RecentActivitySkeleton } from "./RecentActivity";
import { SeasonRecap, SeasonRecapSkeleton } from "./SeasonRecap";
import { PersonalOverviewSkeleton, YourF1 } from "./YourF1";
import { YourF1Radar } from "./YourF1Radar";
import { ApexIntelligenceWidget } from "./ai/ApexIntelligenceWidget";
import {
  HomepageIntelligenceProvider,
  useHomepageIntelligence,
} from "./ai/HomepageIntelligenceProvider";
import type { PersonalHomeData, PublicHomeData } from "@/lib/homeData";

function PersonalHomeInner({
  publicData,
  personalData,
  firstName,
  isReturning,
}: {
  publicData: PublicHomeData;
  personalData: PersonalHomeData;
  firstName: string;
  isReturning: boolean;
}) {
  const { intelligence } = useHomepageIntelligence();

  return (
    <>
      <HomeLayout photos={publicData.backdropPhotos}>
        {/* 1. Race Context Hero */}
        <RaceHero
          publicData={publicData}
          variant="personal"
          firstName={firstName}
          isReturning={isReturning}
          nextAction={personalData.nextAction}
          favoriteDriver={personalData.favoriteDriver}
          favoriteTeam={personalData.favoriteTeam}
        />

        {/* 2. Your F1 Radar - thin status rail, not a section */}
        <YourF1Radar
          favoriteDriver={personalData.favoriteDriver}
          favoriteTeam={personalData.favoriteTeam}
          favoriteDriverRank={publicData.seasonRecap.favoriteDriverRank}
          favoriteTeamRank={publicData.seasonRecap.favoriteTeamRank}
          favoriteDriverCircuitWins={publicData.trackHistory?.favoriteDriverCircuitStats?.wins}
        />

        {/* 3. Your F1 Standing & Trajectory */}
        <YourF1
          favoriteDriver={personalData.favoriteDriver}
          favoriteTeam={personalData.favoriteTeam}
          races={publicData.races}
          predictionCount={personalData.predictionPerformance.winner.total}
          driverLeader={publicData.seasonRecap.driverLeader}
          favoriteDriverRank={publicData.seasonRecap.favoriteDriverRank}
          favoriteTeamRank={publicData.seasonRecap.favoriteTeamRank}
        />

        {/* 4. F1 Intelligence Command Center (AI + ML + Prediction Coach) */}
        <IntelligenceSection
          myPick={personalData.myPick}
          nextRace={publicData.nextRace}
          performance={personalData.predictionPerformance}
        />

        {/* 5. Your Paddock (Unified Two-Panel Community Layout) */}
        <CommunitySection
          posts={personalData.feedPosts}
          groups={personalData.groups}
          discoverGroups={personalData.discoverGroups}
        />

        {/* 6. Recent Points & Predictions Activity */}
        <RecentActivity entries={personalData.recentActivity} />

        {/* 7. Season So Far (with Apex Intelligence Season Narrative) */}
        <SeasonRecap
          year={publicData.year}
          races={publicData.races}
          recap={publicData.seasonRecap}
          aiNarrative={intelligence?.seasonNarrative}
        />
      </HomeLayout>

      <ApexIntelligenceWidget
        raceName={publicData.nextRace?.name}
        round={publicData.nextRace?.round}
        myPick={personalData.myPick}
        nextRace={publicData.nextRace}
      />
    </>
  );
}

/** The personal F1 command center wrapped in the single bundled HomepageIntelligenceProvider */
export function PersonalHome(props: {
  publicData: PublicHomeData;
  personalData: PersonalHomeData;
  firstName: string;
  isReturning: boolean;
}) {
  return (
    <HomepageIntelligenceProvider>
      <PersonalHomeInner {...props} />
    </HomepageIntelligenceProvider>
  );
}

export function PersonalHomeSkeleton() {
  return (
    <HomeLayout photos={[]}>
      <RaceHeroSkeleton variant="personal" />
      <PersonalOverviewSkeleton />
      <IntelligenceSkeleton />
      <CommunitySectionSkeleton />
      <RecentActivitySkeleton />
      <SeasonRecapSkeleton />
    </HomeLayout>
  );
}
