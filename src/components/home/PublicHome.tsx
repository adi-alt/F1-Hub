"use client";

import { LandingStory } from "./landing/LandingStory";
import type { LandingData } from "@/lib/homeData";

/** The signed-out landing page: a Grand Prix weekend told in chapters (LandingStory). */
export function PublicHome({ landing }: { landing: LandingData }) {
  return <LandingStory landing={landing} />;
}
