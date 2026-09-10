"use client";

import { useState } from "react";
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
  // Lifted here (not in HomepageIntelligenceProvider, whose memoized value was fixed earlier this
  // session specifically to stop unrelated re-renders - adding tab state there would reintroduce
  // that) so the hero radar and the floating Apex widget can each drive a tab they don't own the
  // rendering of. Both default once and are never reset by an AI data refresh - only explicit user
  // actions (a tab click, a quick-jump button, a radar element) change them.
  const [apexActiveTab, setApexActiveTab] = useState("briefing");
  const [yourF1ActiveTab, setYourF1ActiveTab] = useState("overview");

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

        {/* 2. Your F1 Radar - thin status rail, not a section, reading as one connected block with
         * the hero above it - clickable through to Your F1 below. */}
        <YourF1Radar
          favoriteDriver={personalData.favoriteDriver}
          favoriteTeam={personalData.favoriteTeam}
          favoriteDriverRank={publicData.seasonRecap.favoriteDriverRank}
          favoriteTeamRank={publicData.seasonRecap.favoriteTeamRank}
          favoriteDriverCircuitWins={publicData.trackHistory?.favoriteDriverCircuitStats?.wins}
          favoriteDriverPoints={publicData.seasonRecap.favoriteDriverPoints}
          favoriteDriverGapToLeader={publicData.seasonRecap.favoriteDriverGapToLeader}
          predictionCount={personalData.predictionPerformance.winner.total}
          onNavigate={setYourF1ActiveTab}
        />

        {/* 3. Your F1 - personal cockpit, tabbed */}
        <YourF1
          favoriteDriver={personalData.favoriteDriver}
          favoriteTeam={personalData.favoriteTeam}
          races={publicData.races}
          predictionCount={personalData.predictionPerformance.winner.total}
          driverLeader={publicData.seasonRecap.driverLeader}
          favoriteDriverRank={publicData.seasonRecap.favoriteDriverRank}
          favoriteTeamRank={publicData.seasonRecap.favoriteTeamRank}
          favoriteDriverPoints={publicData.seasonRecap.favoriteDriverPoints}
          favoriteDriverGapToLeader={publicData.seasonRecap.favoriteDriverGapToLeader}
          activeTab={yourF1ActiveTab}
          onTabChange={setYourF1ActiveTab}
        />

        {/* 4. Apex Intelligence workspace (AI) + ML + Prediction Coach */}
        <IntelligenceSection
          myPick={personalData.myPick}
          nextRace={publicData.nextRace}
          performance={personalData.predictionPerformance}
          latestPrediction={personalData.latestPrediction}
          styleTraits={personalData.styleTraits}
          apexActiveTab={apexActiveTab}
          onApexTabChange={setApexActiveTab}
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
          nextRaceRound={publicData.nextRace?.round}
          favoriteDriver={personalData.favoriteDriver}
          favoriteTeam={personalData.favoriteTeam}
        />
      </HomeLayout>

      <ApexIntelligenceWidget
        raceName={publicData.nextRace?.name}
        favoriteDriverName={personalData.favoriteDriver?.name}
        favoriteTeamName={personalData.favoriteTeam?.name}
        onNavigateToTab={setApexActiveTab}
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
  // Stable identity string, not the card objects themselves - a new object reference every render
  // (e.g. from router.refresh() re-fetching the same favorite) must NOT retrigger the AI fetch,
  // only an actual identity change should.
  const favoriteContextKey = `${props.personalData.favoriteDriver?.driverId ?? ""}:${props.personalData.favoriteTeam?.teamId ?? ""}`;
  return (
    <HomepageIntelligenceProvider favoriteContextKey={favoriteContextKey}>
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
