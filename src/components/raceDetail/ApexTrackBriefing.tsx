"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { RaceSectionCard } from "./RaceSectionCard";
import type { SharedCircuitIntelligence } from "@/lib/ai/schemas/seasonIntelligence";

type Block = { headline: string; summary: string };
type State = { status: "loading" } | { status: "failed" } | { status: "ready"; take: SharedCircuitIntelligence | null; isAi: boolean };

/**
 * Fetches Apex's read on a circuit - the EXISTING /api/ai/circuit-take endpoint the circuit pages
 * (and Groups' own RaceWeekendTake rail widget) already use. Same prompt, same server-side
 * grounding (a location and a year is all this sends; every fact the model reasons over is
 * resolved server-side from getCircuitDetailData), same shared `ai_cache` entry keyed on that
 * circuit+year+state - a reader who already opened this circuit's own page gets a cache hit here,
 * not a second generation path. Shared by both renderers below so a page mounting both (Race
 * Story's compact slot and the page's own full summary section) fetches the same cached answer
 * twice at worst, never generates it twice.
 */
function useCircuitTake(location: string, year: number): State {
  const [state, setState] = useState<State>({ status: "loading" });
  const key = `${location}:${year}`;
  const [prevKey, setPrevKey] = useState(key);
  if (prevKey !== key) {
    // Changing the selected race must not silently reuse the previous one's take - the same
    // identity-keyed reset RaceWeekendTake's own guard uses.
    setPrevKey(key);
    setState({ status: "loading" });
  }

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/ai/circuit-take", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ location, year }),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`circuit take: ${res.status}`);
        const body = (await res.json()) as { content?: SharedCircuitIntelligence; location?: string; source?: "llm" | "fallback" };
        // Discards a reply for a circuit that is no longer the one on screen - the same identity
        // check every other Apex surface in this app makes before applying a response.
        if (body.location !== location) return;
        setState({ status: "ready", take: body.content ?? null, isAi: body.source === "llm" });
      } catch {
        if (!controller.signal.aborted) setState({ status: "failed" });
      }
    })();
    return () => controller.abort();
  }, [location, year]);

  return state;
}

/** `isAi` omitted (loading/unknown) says nothing about provenance rather than guessing. Present,
 * it labels the content honestly - "Apex AI take" for a real model generation, "Track summary" for
 * the deterministic fallback (generateCircuitTakeFallback) - the same distinction
 * RaceIntelligenceSection's own heading/description switch makes for the completed-race narrative,
 * just as a compact label instead of a heading. */
function ApexLabel({ isAi }: { isAi?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span aria-hidden className="text-[var(--f1-red)]">
        ✦
      </span>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-500">{isAi === undefined ? "Apex on this circuit" : isAi ? "Apex AI take" : "Track summary"}</p>
    </div>
  );
}

/**
 * The compact render - just the headline block (`trackTake`), no card of its own. For Race
 * Story's own pre-race column, where the surrounding RaceSectionCard already has a title and
 * description; this only ever adds its own small label above the text. Renders nothing (not an
 * empty slot) once loading resolves to no grounded take or a genuine failure - a real outcome for
 * a venue with little history, not something to fill with a placeholder.
 */
export function ApexTrackBriefing({ location, year }: { location: string; year: number }) {
  const state = useCircuitTake(location, year);

  if (state.status === "failed") return null;
  if (state.status === "loading") {
    return (
      <div aria-busy>
        <ApexLabel />
        <div className="mt-2 space-y-1.5">
          <span className="skeleton-shimmer block h-2.5 w-4/5 rounded bg-white/[0.06]" />
          <span className="skeleton-shimmer block h-2.5 w-full rounded bg-white/[0.06]" />
        </div>
      </div>
    );
  }

  const block = state.take?.trackTake;
  if (!block) return null;

  return (
    <div>
      <ApexLabel isAi={state.isAi} />
      <p className="mt-2 text-[13px] font-semibold leading-snug text-white">{block.headline}</p>
      <p className="mt-0.5 text-sm leading-relaxed text-neutral-400">{block.summary}</p>
    </div>
  );
}

/**
 * The full render - the page's own "Race Intelligence Summary" section, adding `raceDifference`
 * and `historicalPattern` where the model returned them (`trackVsSeason` is deliberately left out:
 * it's about how this circuit compares to the season's own aggregate pace/strategy trends, which
 * is Season's own subject, not a race page's).
 *
 * Owns its own RaceSectionCard - and only renders it once there's real content to put in it.
 * While loading, the card shows with a skeleton in place (still says something is coming); once
 * resolved to no grounded take at all, or a genuine fetch failure, the WHOLE section disappears,
 * never an empty titled card with nothing underneath.
 */
export function ApexTrackBriefingSection({ location, year }: { location: string; year: number }) {
  const state = useCircuitTake(location, year);

  if (state.status === "failed") return null;
  if (state.status === "loading") {
    return (
      <RaceSectionCard title="Race Intelligence Summary" description="Apex's read on this weekend, from this circuit's own history.">
        <div aria-busy className="space-y-1.5">
          <span className="skeleton-shimmer block h-3 w-2/3 rounded bg-white/[0.06]" />
          <span className="skeleton-shimmer block h-2.5 w-full rounded bg-white/[0.06]" />
          <span className="skeleton-shimmer block h-2.5 w-4/5 rounded bg-white/[0.06]" />
        </div>
      </RaceSectionCard>
    );
  }

  const blocks: (Block | undefined)[] = [state.take?.trackTake, state.take?.raceDifference, state.take?.historicalPattern];
  const real = blocks.filter((b): b is Block => !!b);
  if (real.length === 0) return null;

  return (
    <RaceSectionCard
      title="Race Intelligence Summary"
      description={state.isAi ? "AI-generated read on this weekend, from this circuit's own history." : "A deterministic summary of this circuit's own history."}
    >
      <div className="space-y-3">
        {real.map((block, i) => (
          <motion.div key={block.headline} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: i * 0.05 }}>
            <p className="text-sm font-semibold leading-snug text-white">{block.headline}</p>
            <p className="mt-0.5 text-sm leading-relaxed text-neutral-400">{block.summary}</p>
          </motion.div>
        ))}
      </div>
    </RaceSectionCard>
  );
}
