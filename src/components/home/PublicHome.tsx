"use client";

import { DiscoverSection, DiscoverSectionSkeleton } from "./DiscoverSection";
import { ExploreSection } from "./ExploreSection";
import { HomeLayout } from "./HomeLayout";
import { RaceHero, RaceHeroSkeleton } from "./RaceHero";
import { SeasonRecap, SeasonRecapSkeleton } from "./SeasonRecap";
import { WhyF1Hub } from "./WhyF1Hub";
import {
  HomepageIntelligenceProvider,
  useHomepageIntelligence,
} from "./ai/HomepageIntelligenceProvider";
import type { PublicHomeData } from "@/lib/homeData";
import type { PublicGroupSummary } from "@/lib/supabase/groups";

function PublicHomeInner({
  publicData,
  discoverGroups,
}: {
  publicData: PublicHomeData;
  discoverGroups: PublicGroupSummary[];
}) {
  const { intelligence } = useHomepageIntelligence();

  return (
    <HomeLayout photos={publicData.backdropPhotos}>
      <RaceHero publicData={publicData} variant="public" />
      <WhyF1Hub />
      <ExploreSection />
      <SeasonRecap
        year={publicData.year}
        races={publicData.races}
        recap={publicData.seasonRecap}
        aiNarrative={intelligence?.seasonNarrative}
      />
      <DiscoverSection groups={discoverGroups} requireAuthToJoin />
    </HomeLayout>
  );
}

export function PublicHome(props: {
  publicData: PublicHomeData;
  discoverGroups: PublicGroupSummary[];
}) {
  return (
    <HomepageIntelligenceProvider>
      <PublicHomeInner {...props} />
    </HomepageIntelligenceProvider>
  );
}

export function PublicHomeSkeleton() {
  return (
    <HomeLayout photos={[]}>
      <RaceHeroSkeleton variant="public" />
      <SeasonRecapSkeleton />
      <DiscoverSectionSkeleton />
    </HomeLayout>
  );
}
