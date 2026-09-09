"use client";

import { ExploreSection } from "./ExploreSection";
import { HomeLayout } from "./HomeLayout";
import { RaceHero, RaceHeroSkeleton } from "./RaceHero";
import { WhyF1Hub } from "./WhyF1Hub";
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
    <HomeLayout photos={publicData.backdropPhotos}>
      <RaceHero publicData={publicData} variant="public" />
      <WhyF1Hub />
      <ExploreSection />
    </HomeLayout>
  );
}

export function PublicHomeSkeleton() {
  return (
    <HomeLayout photos={[]}>
      <RaceHeroSkeleton variant="public" />
    </HomeLayout>
  );
}
