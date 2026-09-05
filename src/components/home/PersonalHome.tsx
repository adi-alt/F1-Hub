import { CommunityFeed, CommunityFeedSkeleton } from "./CommunityFeed";
import { CommunitySnapshot, CommunitySnapshotSkeleton } from "./CommunitySnapshot";
import { DiscoverSection } from "./DiscoverSection";
import { HomeLayout } from "./HomeLayout";
import { IntelligenceSection, IntelligenceSkeleton } from "./IntelligenceSection";
import { RaceHero, RaceHeroSkeleton } from "./RaceHero";
import { RecentActivity, RecentActivitySkeleton } from "./RecentActivity";
import { SeasonStrip } from "./SeasonStrip";
import { PersonalOverviewSkeleton, YourF1 } from "./YourF1";
import type { PersonalHomeData, PublicHomeData } from "@/lib/homeData";

/** The personal F1 command center — race context, then who you are on F1 Hub, then your
 * intelligence layer, then your community, then broader season navigation. Genuinely different
 * information architecture from PublicHome, not the same page with sections hidden. */
export function PersonalHome({ publicData, personalData, firstName, isReturning }: { publicData: PublicHomeData; personalData: PersonalHomeData; firstName: string; isReturning: boolean }) {
  const hasCommunity = personalData.groups.length > 0;

  return (
    <HomeLayout photos={publicData.backdropPhotos}>
      <RaceHero publicData={publicData} variant="personal" firstName={firstName} isReturning={isReturning} nextAction={personalData.nextAction} />

      <YourF1
        favoriteDriver={personalData.favoriteDriver}
        favoriteTeam={personalData.favoriteTeam}
        races={publicData.races}
        predictionCount={personalData.predictionPerformance.winner.total}
      />

      <IntelligenceSection myPick={personalData.myPick} nextRace={publicData.nextRace} performance={personalData.predictionPerformance} />

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--f1-red)]">Your community</h2>
        {hasCommunity ? (
          <div className="mt-4 space-y-6">
            <CommunitySnapshot groups={personalData.groups} />
            <CommunityFeed posts={personalData.feedPosts} />
          </div>
        ) : (
          <div className="mt-4">
            <DiscoverSection groups={personalData.discoverGroups} requireAuthToJoin={false} />
          </div>
        )}
      </section>

      <RecentActivity entries={personalData.recentActivity} />

      <div>
        <h2 className="mb-4 text-lg font-semibold text-white">{publicData.year} Season</h2>
        <SeasonStrip races={publicData.races} />
      </div>
    </HomeLayout>
  );
}

// ponytail: shown only during the brief client-refetch window on a post-mount login, before we
// know yet whether the user has any groups — defaults to the "has community" shape (the common
// case) rather than branching on data this skeleton doesn't have access to.
export function PersonalHomeSkeleton() {
  return (
    <HomeLayout photos={[]}>
      <RaceHeroSkeleton variant="personal" />
      <PersonalOverviewSkeleton />
      <IntelligenceSkeleton />
      <div className="space-y-6">
        <CommunitySnapshotSkeleton />
        <CommunityFeedSkeleton />
      </div>
      <RecentActivitySkeleton />
    </HomeLayout>
  );
}
