"use client";

import { CommunitySection, CommunitySectionSkeleton } from "./CommunitySection";
import { HomeLayout } from "./HomeLayout";
import { IntelligenceSection, IntelligenceSkeleton } from "./IntelligenceSection";
import { RaceHero, RaceHeroSkeleton } from "./RaceHero";
import { RecentActivity, RecentActivitySkeleton } from "./RecentActivity";
import { SeasonRecap, SeasonRecapSkeleton } from "./SeasonRecap";
import { PersonalOverviewSkeleton, YourF1 } from "./YourF1";
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

      {/* 2. Your F1 Standing & Trajectory */}
      <YourF1
        favoriteDriver={personalData.favoriteDriver}
        favoriteTeam={personalData.favoriteTeam}
        races={publicData.races}
        predictionCount={personalData.predictionPerformance.winner.total}
        driverLeader={publicData.seasonRecap.driverLeader}
        favoriteDriverRank={publicData.seasonRecap.favoriteDriverRank}
      />

      {/* 3. F1 Intelligence Command Center (AI + ML + Prediction Coach) */}
      <IntelligenceSection
        myPick={personalData.myPick}
        nextRace={publicData.nextRace}
        performance={personalData.predictionPerformance}
      />

      {/* 4. Community Command Center (Unified Two-Panel Layout) */}
      <CommunitySection
        posts={personalData.feedPosts}
        groups={personalData.groups}
        discoverGroups={personalData.discoverGroups}
      />

      {/* 5. Recent Points & Predictions Activity */}
      <RecentActivity entries={personalData.recentActivity} />

      {/* 6. Season So Far (with AI Season Narrative Synthesis) */}
      <SeasonRecap
        year={publicData.year}
        races={publicData.races}
        recap={publicData.seasonRecap}
        aiNarrative={intelligence?.seasonNarrative}
      />
    </HomeLayout>
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
