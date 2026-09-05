"use client";

import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/Skeleton";
import { useHomepageIntelligence } from "./HomepageIntelligenceProvider";

/** The personal AI centerpiece - deliberately not a `RaceSectionCard` or bordered stat-box like
 * every other intelligence component. This is the page's personal thesis, not one card among many,
 * so it gets its own editorial treatment: a red accent rule, large pull-quote headline, spacious
 * layout. Content is entirely `personalRaceBrief` re-presented - no frontend-authored sentences
 * added here that would duplicate or compete with the AI's own text. Renders null for a guest or a
 * signed-in user with no favorites, same null discipline every other AI component here follows. */
export function YourRace() {
  const { intelligence, isLoading } = useHomepageIntelligence();

  if (isLoading) {
    return <YourRaceSkeleton />;
  }

  const brief = intelligence?.personalRaceBrief;
  if (!brief) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="border-l-2 border-[var(--f1-red)] py-1 pl-5 sm:pl-6"
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--f1-red)]">
        Your Race
      </p>

      <p className="mt-2 text-xl font-semibold leading-snug text-white sm:text-2xl">
        {brief.headline}
      </p>

      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-neutral-300 sm:text-base">
        {brief.whyItMatters}
      </p>

      {(brief.favoriteDriverAngle || brief.favoriteTeamAngle) && (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:gap-8">
          {brief.favoriteDriverAngle && (
            <p className="text-xs leading-relaxed text-neutral-400 sm:max-w-xs">
              <span className="font-medium text-neutral-200">Your driver — </span>
              {brief.favoriteDriverAngle}
            </p>
          )}
          {brief.favoriteTeamAngle && (
            <p className="text-xs leading-relaxed text-neutral-400 sm:max-w-xs">
              <span className="font-medium text-neutral-200">Your team — </span>
              {brief.favoriteTeamAngle}
            </p>
          )}
        </div>
      )}
    </motion.div>
  );
}

export function YourRaceSkeleton() {
  return (
    <div className="border-l-2 border-white/10 py-1 pl-5 sm:pl-6">
      <Skeleton className="skeleton-shimmer h-3 w-20 rounded" />
      <Skeleton className="skeleton-shimmer mt-3 h-7 w-5/6 rounded" />
      <Skeleton className="skeleton-shimmer mt-3 h-4 w-full rounded" />
      <Skeleton className="skeleton-shimmer mt-1.5 h-4 w-4/5 rounded" />
    </div>
  );
}
