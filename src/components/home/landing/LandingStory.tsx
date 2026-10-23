"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRef } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { ArrowRight } from "lucide-react";
import { RotatingBackdrop } from "@/components/home/RotatingBackdrop";
import { StartLights } from "@/components/motion/StartLights";
import { RaceKeyFact } from "@/components/race/RaceKeyFact";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import type { LandingData } from "@/lib/homeData";
import { raceHref } from "@/lib/routes";
import { useAuthDialogStore } from "@/store/useAuthDialogStore";

// Everything below the first screen is its own chunk: rendered on the server as usual, its JavaScript fetched apart
// from the hero's. The placeholder holds a screen's height so the page doesn't jump.
const StoryChapters = dynamic(() => import("./StoryChapters").then((m) => m.StoryChapters), {
  loading: () => (
    <div className="page-content py-12" aria-hidden>
      <Skeleton className="h-[100svh] w-full rounded-card" />
    </div>
  ),
});

/**
 * The signed-out landing page as a Grand Prix weekend told in chapters (after noomoagency.com): lights out, the
 * grid, the strategy, the podium, the archive, then the reader's turn. Native scroll; the pinned chapters are CSS
 * sticky with scroll-linked transforms, and with reduced motion every chapter is a plain static section.
 */
export function LandingStory({ landing }: { landing: LandingData }) {
  return (
    <div className="overflow-x-clip">
      <LightsOut landing={landing} />
      <StoryChapters landing={landing} />
    </div>
  );
}

/** Chapter 1: the photo of this circuit full bleed, the statement over it, the next race and its countdown. */
function LightsOut({ landing }: { landing: LandingData }) {
  const openAuth = useAuthDialogStore((s) => s.open);
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const scale = useTransform(scrollYProgress, [0, 1], [1, 1.15]);
  const lift = useTransform(scrollYProgress, [0, 1], ["0%", "-25%"]);
  const fade = useTransform(scrollYProgress, [0, 0.8], [1, 0]);
  const race = landing.nextRace;

  return (
    <section ref={ref} aria-labelledby="chapter-lights-out" className="relative flex min-h-[100svh] items-end overflow-hidden">
      <motion.div aria-hidden className="absolute inset-0" style={reduced ? undefined : { scale }}>
        <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(225,6,0,0.1), transparent 70%)" }} />
        <RotatingBackdrop photos={landing.backdropPhotos} />
        <div className="absolute inset-0 bg-gradient-to-b from-[var(--background)]/40 via-[var(--background)]/70 to-[var(--background)]" />
      </motion.div>
      <motion.div className="page-content relative w-full pb-12 pt-24" style={reduced ? undefined : { y: lift, opacity: fade }}>
        {/* The chapter's one red element: the five start lights. */}
        <StartLights className="mb-6" />
        <p className="text-body-sm text-secondary">Chapter 1 · Lights out</p>
        <h1 id="chapter-lights-out" className="story-statement mt-3">
          {race ? (
            <>
              <span className="block">Lights out</span>
              <span className="block text-secondary">{race.name}</span>
            </>
          ) : (
            "Lights out"
          )}
        </h1>
        {race && (
          <>
            <p className="mt-6 text-body text-secondary">
              Round {race.round} of the {race.year} season · {race.circuit}
            </p>
            <div className="mt-6">
              <RaceKeyFact sessions={landing.calendarEntry?.sessions ?? []} />
            </div>
          </>
        )}
        <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
          {race && (
            <Button variant="secondary" size="md" asChild>
              <Link href={raceHref(race.year, race.round, race.name)}>
                Explore the race
                <Icon icon={ArrowRight} size={16} />
              </Link>
            </Button>
          )}
          <button
            type="button"
            onClick={openAuth}
            className="rounded-control text-body-sm font-medium text-secondary underline-offset-4 transition-colors duration-fast hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            Create a free account to make your pick
          </button>
        </div>
      </motion.div>
    </section>
  );
}
