"use client";

import { useEffect, useState } from "react";
import type { SharedCircuitIntelligence } from "@/lib/ai/schemas/seasonIntelligence";

/**
 * Apex's read on the circuit the next round is at, inside the Race Weekend widget itself rather
 * than as a fifth card in the rail.
 *
 * This is the EXISTING /api/ai/circuit-take endpoint the circuit pages already use - same prompt,
 * same server-side grounding (every fact resolved from getCircuitDetailData, nothing sent from
 * here but a location and a year), same shared `ai_cache` entry. So a reader who has already
 * opened that circuit's page gets a cache hit here, and this adds no second generation path, no
 * second prompt to keep in sync, and nothing this widget could state that the circuit page would
 * contradict.
 *
 * Only `trackTake` is rendered - the endpoint returns up to four blocks, and the other three
 * (what changed, track vs. season, history) are a full page's worth of reading, not a rail
 * summary. Renders nothing at all when the model has no grounded take for this circuit, which is a
 * real outcome for a venue with little history rather than something to fill with a placeholder.
 */
export function RaceWeekendTake({ location, year }: { location: string; year: number }) {
  const [take, setTake] = useState<SharedCircuitIntelligence | null>(null);
  const [loading, setLoading] = useState(true);

  const key = `${location}:${year}`;
  const [prevKey, setPrevKey] = useState(key);
  if (prevKey !== key) {
    setPrevKey(key);
    setTake(null);
    setLoading(true);
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
        const body = (await res.json()) as { content?: SharedCircuitIntelligence; location?: string };
        // Discards a reply for a circuit that is no longer the one on screen - the same identity
        // check every other Apex surface in this app makes before applying a response.
        if (body.location !== location || !body.content) return;
        setTake(body.content);
        setLoading(false);
      } catch {
        if (controller.signal.aborted) return;
        setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [location, year]);

  if (loading) {
    return (
      <div className="mt-3.5 border-t border-white/[0.08] pt-3" aria-busy>
        <ApexLabel />
        <div className="mt-2 space-y-1.5">
          <span className="skeleton-shimmer block h-2.5 w-4/5 rounded bg-white/[0.06]" />
          <span className="skeleton-shimmer block h-2.5 w-full rounded bg-white/[0.06]" />
          <span className="skeleton-shimmer block h-2.5 w-2/3 rounded bg-white/[0.06]" />
        </div>
      </div>
    );
  }

  const block = take?.trackTake;
  if (!block) return null;

  return (
    <div className="mt-3.5 border-t border-white/[0.08] pt-3">
      <ApexLabel />
      <p className="mt-1.5 text-[12.5px] font-semibold leading-snug text-white">{block.headline}</p>
      <p className="mt-1 text-[11.5px] leading-relaxed text-neutral-400">{block.summary}</p>
    </div>
  );
}

function ApexLabel() {
  return (
    <div className="flex items-center gap-1.5">
      <span aria-hidden className="text-[var(--f1-red)]">
        ✦
      </span>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-400">Apex on this circuit</p>
    </div>
  );
}
