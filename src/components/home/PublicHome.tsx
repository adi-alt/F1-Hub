"use client";

import { ExploreSection } from "./ExploreSection";
import { HomeLayout } from "./HomeLayout";
import { RaceHero, RaceHeroSkeleton } from "./RaceHero";
import { WhyF1Hub } from "./WhyF1Hub";
import { Skeleton } from "@/components/ui/Skeleton";
import { SectionLoadingMessage } from "@/components/ui/SectionLoadingMessage";
import type { PublicHomeData } from "@/lib/homeData";

// No HomepageIntelligenceProvider, no ApexIntelligenceWidget, no SeasonRecap's AI narrative, no
// DiscoverSection - a signed-out visitor gets the real, deterministic pitch for the product (race
// context, why it exists, what's inside) with zero AI-generated content and zero group-join
// prompts, both of which only make sense once there's an actual account behind them. This is also
// the entire fix for "the AI layer costs every anonymous visit" - previously every logged-out
// homepage view fired a /api/ai/homepage-intelligence call (a real, sometimes 90s NVIDIA request)
// for content that was never even shown as the headline feature; removing the provider here means
// zero AI network calls for anyone who isn't signed in.
export function PublicHome({ publicData }: { publicData: PublicHomeData }) {
  return (
    <HomeLayout
      photos={publicData.backdropPhotos}
      sections={[
        { tier: "major", content: <RaceHero publicData={publicData} variant="public" /> },
        { tier: "normal", content: <WhyF1Hub /> },
        { tier: "normal", content: <ExploreSection /> },
      ]}
    />
  );
}

function WhyF1HubSkeleton() {
  return (
    <section>
      <Skeleton className="skeleton-shimmer h-3 w-24 rounded" />
      <Skeleton className="skeleton-shimmer mt-3 h-7 w-full max-w-2xl rounded" />
      <div className="mt-8 grid gap-6 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i}>
            <Skeleton className="skeleton-shimmer h-7 w-7 rounded" />
            <Skeleton className="skeleton-shimmer mt-2 h-4 w-32 rounded" />
            <Skeleton className="skeleton-shimmer mt-1.5 h-3 w-full rounded" />
            <Skeleton className="skeleton-shimmer mt-1 h-3 w-4/5 rounded" />
          </div>
        ))}
      </div>
    </section>
  );
}

function ExploreSectionSkeleton() {
  return (
    <section>
      <Skeleton className="skeleton-shimmer h-3 w-40 rounded" />
      <Skeleton className="skeleton-shimmer mt-6 h-[600px] w-full rounded-2xl" />
    </section>
  );
}

// Mirrors PublicHome's own three sections (Hero/WhyF1Hub/ExploreSection), not just the hero - the
// route-level loading.tsx fallback renders this before we even know the visitor's auth state, so
// it has to hold the full page's real shape or real content popping in below an otherwise-empty
// hero skeleton reads as a layout jump, not a smooth reveal.
export function PublicHomeSkeleton() {
  return (
    <HomeLayout photos={[]}>
      <SectionLoadingMessage label="Warming up the grid…" />
      <RaceHeroSkeleton variant="public" />
      <WhyF1HubSkeleton />
      <ExploreSectionSkeleton />
    </HomeLayout>
  );
}
