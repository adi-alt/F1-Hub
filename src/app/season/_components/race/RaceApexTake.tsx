"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { InsightSkeleton, LoadingRegion } from "@/components/ui/Skeletons";
import { Eyebrow } from "../ai/SeasonInsight";
import type { RaceEventTake } from "@/lib/ai/schemas/seasonIntelligence";

/**
 * The race window's compact intelligence block — a headline and two or three sentences, not a
 * second AI panel. Loads independently of everything else in the window, so the schedule, results
 * and weather are all readable the instant the window opens.
 */
export function RaceApexTake({ season, round }: { season: number; round: number }) {
  const [take, setTake] = useState<RaceEventTake | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setTake(null);
    setLoading(true);

    (async () => {
      try {
        const res = await fetch("/api/ai/race-event-take", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ season, round }),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`race take: ${res.status}`);
        const body = (await res.json()) as { content?: RaceEventTake; round?: number };
        // The window can be re-pointed at another round while this is in flight; the echoed round
        // is what makes a late reply for the previous one discardable rather than confusing.
        if (body.round !== round || !body.content) return;
        setTake(body.content);
        setLoading(false);
      } catch {
        if (controller.signal.aborted) return;
        setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [season, round]);

  if (loading) {
    return (
      <LoadingRegion label="Apex is reading this round">
        <InsightSkeleton lines={2} />
      </LoadingRegion>
    );
  }
  if (!take) return null;

  return (
    <motion.section initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: "easeOut" }}>
      <Eyebrow>Apex event take</Eyebrow>
      <p className="mt-1.5 text-[15px] font-semibold leading-snug text-white">{take.headline}</p>
      <p className="mt-1 text-sm leading-relaxed text-neutral-400">{take.summary}</p>
    </motion.section>
  );
}
