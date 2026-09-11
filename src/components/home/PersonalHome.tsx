"use client";

import { useState } from "react";
import { CommunitySection, CommunitySectionSkeleton } from "./CommunitySection";
import { HomeLayout } from "./HomeLayout";
import { IntelligenceSection, IntelligenceSkeleton } from "./IntelligenceSection";
import { RaceHero, RaceHeroSkeleton } from "./RaceHero";
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
  // The favorite entity YourF1's switcher currently analyzes - defaults to the primary driver, or
  // the primary team if there's no favorite driver, matching what the compact header already
  // treats as "the" favorite everywhere else on the page.
  const [selectedFavoriteKey, setSelectedFavoriteKey] = useState(
    () => (personalData.favoriteDriver ? `driver:${personalData.favoriteDriver.driverId}` : personalData.favoriteTeam ? `team:${personalData.favoriteTeam.teamId}` : ""),
  );

  return (
    <>
      <HomeLayout
        photos={publicData.backdropPhotos}
        sections={[
          {
            tier: "major",
            content: (
              <RaceHero
                publicData={publicData}
                variant="personal"
                firstName={firstName}
                isReturning={isReturning}
                nextAction={personalData.nextAction}
                favoriteDriver={personalData.favoriteDriver}
                favoriteTeam={personalData.favoriteTeam}
              />
            ),
          },
          {
            // Thin status rail, not a section - reads as one connected block with the hero above
            // it (see YourF1Radar's own -mt-6 local pull-up), hence the tightest tier.
            tier: "compact",
            content: (
              <YourF1Radar
                favoriteDriver={personalData.favoriteDriver}
                favoriteTeam={personalData.favoriteTeam}
                favoriteDrivers={personalData.favoriteDrivers}
                favoriteTeams={personalData.favoriteTeams}
                favoriteDriverRank={publicData.seasonRecap.favoriteDriverRank}
                favoriteTeamRank={publicData.seasonRecap.favoriteTeamRank}
                favoriteDriverCircuitWins={publicData.trackHistory?.favoriteDriverCircuitStats?.wins}
                favoriteDriverPoints={publicData.seasonRecap.favoriteDriverPoints}
                favoriteDriverGapToLeader={publicData.seasonRecap.favoriteDriverGapToLeader}
                predictionCount={personalData.predictionPerformance.winner.total}
                onNavigate={setYourF1ActiveTab}
                onSelectFavorite={setSelectedFavoriteKey}
              />
            ),
          },
          {
            tier: "normal",
            content: (
              <YourF1
                favoriteDriver={personalData.favoriteDriver}
                favoriteTeam={personalData.favoriteTeam}
                favoriteDrivers={personalData.favoriteDrivers}
                favoriteTeams={personalData.favoriteTeams}
                races={publicData.races}
                predictionCount={personalData.predictionPerformance.winner.total}
                driverLeader={publicData.seasonRecap.driverLeader}
                teamLeader={publicData.seasonRecap.teamLeader}
                favoriteDriverRanks={publicData.seasonRecap.favoriteDriverRanks}
                favoriteTeamRanks={publicData.seasonRecap.favoriteTeamRanks}
                currentDrivers={publicData.currentDrivers}
                favoriteDriverRank={publicData.seasonRecap.favoriteDriverRank}
                favoriteTeamRank={publicData.seasonRecap.favoriteTeamRank}
                favoriteDriverPoints={publicData.seasonRecap.favoriteDriverPoints}
                favoriteDriverGapToLeader={publicData.seasonRecap.favoriteDriverGapToLeader}
                activeTab={yourF1ActiveTab}
                onTabChange={setYourF1ActiveTab}
                selectedFavoriteKey={selectedFavoriteKey}
                onSelectFavorite={setSelectedFavoriteKey}
              />
            ),
          },
          {
            // The flagship Apex + Prediction Intelligence combination - genuinely dense, keeps
            // generous breathing room on both sides.
            tier: "major",
            content: (
              <IntelligenceSection
                myPick={personalData.myPick}
                nextRace={publicData.nextRace}
                performance={personalData.predictionPerformance}
                latestPrediction={personalData.latestPrediction}
                predictionInsight={publicData.predictionInsight}
                styleTraits={personalData.styleTraits}
                apexActiveTab={apexActiveTab}
                onApexTabChange={setApexActiveTab}
              />
            ),
          },
          {
            tier: "normal",
            content: (
              <CommunitySection
                posts={personalData.feedPosts}
                groups={personalData.groups}
                discoverGroups={personalData.discoverGroups}
              />
            ),
          },
          {
            tier: "major",
            content: (
              <SeasonRecap
                year={publicData.year}
                races={publicData.races}
                recap={publicData.seasonRecap}
                aiNarrative={intelligence?.seasonNarrative}
                nextRaceRound={publicData.nextRace?.round}
                favoriteDriver={personalData.favoriteDriver}
                favoriteTeam={personalData.favoriteTeam}
                circuitImageByRound={publicData.circuitImageByRound}
                calendarByRound={publicData.calendarByRound}
                weatherByRound={publicData.weatherByRound}
              />
            ),
          },
        ]}
      />

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
  // only an actual identity change should. Uses the RAW favorite arrays off the profile (already
  // present on PersonalHomeData, no new data threading), deliberately UNSORTED - a reorder (e.g.
  // toggling a favorite off then back on, which moves it to the end - see setArchiveFavorite) must
  // also bust this key, since it changes which entry is "primary" even though the set itself
  // didn't change; a sorted join would hide that (see homepage-intelligence/route.ts's own comment
  // on the identical gap it has to guard against server-side, where the key IS sorted for
  // order-independent set-change coverage and needs the primary id appended separately instead).
  const profile = props.personalData.profile;
  const favoriteContextKey = `${(profile?.favoriteDrivers ?? []).join(",")}|${(profile?.favoriteTeams ?? []).join(",")}|${(profile?.favoriteTracks ?? []).join(",")}`;
  return (
    <HomepageIntelligenceProvider favoriteContextKey={favoriteContextKey}>
      <PersonalHomeInner {...props} />
    </HomepageIntelligenceProvider>
  );
}

export function PersonalHomeSkeleton() {
  return (
    <HomeLayout
      photos={[]}
      sections={[
        { tier: "major", content: <RaceHeroSkeleton variant="personal" /> },
        { tier: "normal", content: <PersonalOverviewSkeleton /> },
        { tier: "major", content: <IntelligenceSkeleton /> },
        { tier: "normal", content: <CommunitySectionSkeleton /> },
        { tier: "major", content: <SeasonRecapSkeleton /> },
      ]}
    />
  );
}
