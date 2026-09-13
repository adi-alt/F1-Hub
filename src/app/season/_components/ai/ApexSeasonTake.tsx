"use client";

import { motion } from "framer-motion";
import { InsightSkeleton, LoadingRegion } from "@/components/ui/Skeletons";
import { Eyebrow } from "./SeasonInsight";
import { useSeasonIntelligence } from "./SeasonIntelligenceProvider";
import type { PersonalSeasonContext } from "../../_service/season.pure";

/**
 * The season's one editorial intelligence block.
 *
 * Shaped as an argument, not a readout: eyebrow, a headline that makes a claim, a short narrative
 * that interprets rather than restates, and themes as quiet inline metadata rather than a row of
 * badges. The prompt behind it explicitly forbids reciting the standings, because the standings
 * are rendered two sections below and saying them twice is what made this read like raw data.
 *
 * The "For you" line is DETERMINISTIC - built from favorites, the standings and the latest round's
 * real position changes. No second model call happens because someone has a favorite driver: the
 * shared narrative above it stays shared, and stays cached once for everyone.
 */
export function ApexSeasonTake({ personal }: { personal: PersonalSeasonContext }) {
  const { intelligence, loading, failed } = useSeasonIntelligence();

  if (loading) {
    return (
      <section className="mb-9">
        <LoadingRegion label="Apex is reading the season">
          <InsightSkeleton className="max-w-3xl" lines={3} />
        </LoadingRegion>
      </section>
    );
  }

  // Nothing to say and nothing to apologise for: the standings, calendar and analysis below are
  // all fully functional on their own, so a failed narrative simply isn't rendered. An error box
  // here would be the page reporting on its own plumbing.
  if (failed || !intelligence) {
    return personal.companion ? (
      <section className="mb-9">
        <PersonalLine companion={personal.companion} />
      </section>
    ) : null;
  }

  const story = intelligence.seasonStory;

  return (
    <motion.section
      className="mb-9"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
    >
      <Eyebrow>Apex season take</Eyebrow>
      <h2 className="mt-2.5 max-w-3xl text-balance text-xl font-semibold leading-[1.25] tracking-[-0.01em] text-white sm:text-[26px]">{story.headline}</h2>
      <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-neutral-400">{story.summary}</p>

      {story.themes.length > 0 && (
        <p className="mt-3.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-600">
          {story.themes.map((theme, i) => (
            <span key={theme} className="flex items-center gap-2">
              {i > 0 && (
                <span aria-hidden className="text-neutral-700">
                  ·
                </span>
              )}
              <span className="capitalize">{theme}</span>
            </span>
          ))}
        </p>
      )}

      {personal.companion && <PersonalLine companion={personal.companion} className="mt-5" />}
    </motion.section>
  );
}

/** Deliberately small and set apart by a hairline rather than a card - it's a footnote to the
 * shared take, not a competing section. */
function PersonalLine({ companion, className = "" }: { companion: string; className?: string }) {
  return (
    <div className={`max-w-3xl border-l border-[var(--f1-red)]/35 pl-3.5 ${className}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500">For you</p>
      <p className="mt-1 text-sm leading-relaxed text-neutral-400">{companion}</p>
    </div>
  );
}
