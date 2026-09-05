import { DiscoverSection, DiscoverSectionSkeleton } from "./DiscoverSection";
import { ExploreSection } from "./ExploreSection";
import { HomeLayout } from "./HomeLayout";
import { RaceHero, RaceHeroSkeleton } from "./RaceHero";
import { WhyF1Hub } from "./WhyF1Hub";
import type { PublicHomeData } from "@/lib/homeData";
import type { PublicGroupSummary } from "@/lib/supabase/groups";

/** The premium landing/discovery experience — genuinely different information architecture from
 * PersonalHome, not the same dashboard with sections hidden. Race context first, then what F1 Hub
 * is, then what there is to explore, then a way in via a real community. */
export function PublicHome({ publicData, discoverGroups }: { publicData: PublicHomeData; discoverGroups: PublicGroupSummary[] }) {
  return (
    <HomeLayout photos={publicData.backdropPhotos}>
      <RaceHero publicData={publicData} variant="public" />
      <WhyF1Hub />
      <ExploreSection />
      <DiscoverSection groups={discoverGroups} requireAuthToJoin />
    </HomeLayout>
  );
}

export function PublicHomeSkeleton() {
  return (
    <HomeLayout photos={[]}>
      <RaceHeroSkeleton variant="public" />
      <DiscoverSectionSkeleton />
    </HomeLayout>
  );
}
