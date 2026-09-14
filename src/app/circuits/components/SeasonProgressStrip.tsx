"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useNestedLenisScroll } from "@/components/motion/useLenisContainer";
import { circuitHref } from "@/lib/routes";
import type { RaceSummary } from "@/app/season/_service/season.pure";

/** A visual journey through the season in calendar order, not a bare percentage bar - completed
 * rounds read as done, the next round stands out, everything after stays quiet. Each stop links
 * straight into that circuit's own page, so this doubles as quick navigation for anyone who
 * already knows roughly where in the season they want to go. */
export function SeasonProgressStrip({ races }: { races: RaceSummary[] }) {
  const scrollRef = useNestedLenisScroll(races.length, { orientation: "horizontal", gestureOrientation: "horizontal" });
  const nextRef = useRef<HTMLAnchorElement>(null);

  // A mid-season visitor's "next round" can sit a dozen stops into the strip - without this the
  // journey would just open scrolled to round 1, with the one round that actually matters right
  // now off to the right, unseen. `"nearest"` rather than `"center"` so a next-round near either
  // end doesn't get yanked away from the edge it's already legible at.
  useEffect(() => {
    nextRef.current?.scrollIntoView({ behavior: "instant", inline: "nearest", block: "nearest" });
  }, []);

  if (races.length === 0) return null;

  return (
    <section aria-label="Season progress" className="mb-8">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Season progress</p>
      <div aria-hidden className="mt-2 h-px w-full bg-gradient-to-r from-white/[0.09] to-transparent" />
      <div ref={scrollRef} className="mt-4 overflow-x-auto scrollbar-hide">
        <ol className="flex min-w-max items-center gap-1.5 pb-1">
          {races.map((r, i) => {
            const isNext = r.state === "next";
            const isCompleted = r.state === "completed";
            return (
              <li key={r.round} className="flex items-center gap-1.5">
                {i > 0 && <span aria-hidden className="h-px w-3 shrink-0 bg-white/[0.1]" />}
                <Link
                  ref={isNext ? nextRef : undefined}
                  href={circuitHref(r.circuit ?? r.name)}
                  className={`group flex shrink-0 flex-col items-center gap-1 rounded-md px-2 py-1.5 text-center transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--f1-red)] ${
                    isNext ? "bg-[var(--f1-red)]/[0.1]" : "hover:bg-white/[0.03]"
                  }`}
                  title={`Round ${r.round} · ${r.name}`}
                >
                  <span
                    aria-hidden
                    className={`h-2 w-2 rounded-full ${
                      isNext ? "pulse-ring bg-[var(--f1-red)]" : isCompleted ? "bg-neutral-400" : "border border-white/25 bg-transparent"
                    }`}
                  />
                  <span
                    className={`whitespace-nowrap text-[10px] font-medium transition-colors ${
                      isNext ? "text-white" : isCompleted ? "text-neutral-400 group-hover:text-neutral-200" : "text-neutral-600 group-hover:text-neutral-400"
                    }`}
                  >
                    {r.trackShort}
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
