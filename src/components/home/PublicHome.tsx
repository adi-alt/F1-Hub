"use client";

import { HomeLayout } from "./HomeLayout";
import { StandingsTicker, standingsTickerItems } from "@/components/motion/StandingsTicker";
import { LandingHero } from "./landing/LandingHero";
import { LandingArchiveSection, LandingModelSection, LandingSeasonSection } from "./landing/LandingSections";
import type { LandingData } from "@/lib/homeData";

/**
 * The signed-out landing page (critique §2.1): the next race, then the season, then the one thing to do
 * (beat the model), then the way into 75 years of history. It shows the product with real data instead of
 * describing it. Sections sit 48px apart on the page frame; the race photo behind the hero is the one
 * atmospheric element.
 */
export function PublicHome({ landing }: { landing: LandingData }) {
  return (
    <HomeLayout
      photos={landing.backdropPhotos}
      sections={[
        { tier: "major", content: <LandingHero landing={landing} /> },
        { tier: "compact", content: <StandingsTicker label={`${landing.year} drivers' championship`} items={standingsTickerItems(landing.season?.ticker)} /> },
        ...(landing.season ? [{ tier: "major" as const, content: <LandingSeasonSection year={landing.year} season={landing.season} /> }] : []),
        { tier: "major", content: <LandingModelSection landing={landing} /> },
        { tier: "major", content: <LandingArchiveSection /> },
      ]}
    />
  );
}
