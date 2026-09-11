"use client";

import { useSeasonIntelligence } from "./ai/SeasonIntelligenceProvider";

/** Apex's one season-level narrative - editorial, not a dashboard card. No border box, no
 * gradient stripe, no pill badges: a small label, a thin rule, then flowing text - the same
 * "typography + spacing, not another container" rule the rest of the redesigned page follows.
 * Renders nothing while there's truly nothing to say yet (no loading flash on a fast cache hit,
 * no empty box on a genuine failure - WhatChangedRecently/standings/calendar below all still work
 * on their own). */
export function SeasonStory() {
  const { intelligence, loading, error } = useSeasonIntelligence();

  if (loading) {
    return (
      <div className="mb-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-500">Apex take</p>
        <div className="mt-2 h-px w-full bg-white/[0.06]" />
        <div className="skeleton-shimmer mt-3 h-4 w-2/3 rounded bg-white/[0.04]" />
        <div className="skeleton-shimmer mt-2 h-3.5 w-full rounded bg-white/[0.04]" />
        <div className="skeleton-shimmer mt-1.5 h-3.5 w-5/6 rounded bg-white/[0.04]" />
      </div>
    );
  }

  if (error || !intelligence) return null;

  const story = intelligence.seasonStory;

  return (
    <div className="mb-8">
      <div className="flex items-baseline gap-2">
        <span aria-hidden className="text-[var(--f1-red)]">
          ✦
        </span>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-500">Apex take</p>
      </div>
      <div className="mt-2 h-px w-full bg-white/[0.06]" />

      <h3 className="mt-3 text-lg font-semibold leading-snug text-white sm:text-xl">{story.headline}</h3>
      <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-neutral-400">{story.summary}</p>

      {story.themes.length > 0 && (
        <p className="mt-2.5 text-xs text-neutral-600">
          {story.themes.join(" · ")}
        </p>
      )}
    </div>
  );
}
