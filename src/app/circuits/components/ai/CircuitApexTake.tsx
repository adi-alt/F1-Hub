"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { InsightSkeleton, LoadingRegion } from "@/components/ui/Skeletons";
import { Eyebrow } from "@/app/season/_components/ai/SeasonInsight";
import type { SharedCircuitIntelligence } from "@/lib/ai/schemas/seasonIntelligence";

/** The circuit page's one editorial insight - loads independently of everything else on the page,
 * exactly like RaceApexTake, so the hero/track map/history are all readable the instant the page
 * opens rather than waiting on a model response. */
export function CircuitApexTake({ location, year, status }: { location: string; year: number; status: string }) {
  const [take, setTake] = useState<SharedCircuitIntelligence | null>(null);
  const [loading, setLoading] = useState(true);

  const key = `${location}:${year}:${status}`;
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
        // A stale reply for a circuit the reader has since navigated away from is discarded here,
        // the same identity check every other Apex surface in this app uses.
        if (body.location !== location || !body.content) return;
        setTake(body.content);
        setLoading(false);
      } catch {
        if (controller.signal.aborted) return;
        setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [location, year, status]);

  if (loading) {
    return (
      <LoadingRegion label="Apex is reading this circuit">
        <InsightSkeleton lines={2} />
      </LoadingRegion>
    );
  }
  const hasAnyBlock = !!(take?.trackTake || take?.raceDifference || take?.trackVsSeason || take?.historicalPattern);
  if (!take || !hasAnyBlock) return null;

  return (
    <motion.section initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: "easeOut" }} className="flex flex-col gap-5">
      {take.trackTake && (
        <div>
          <Eyebrow>Apex circuit take</Eyebrow>
          <p className="mt-1.5 text-[15px] font-semibold leading-snug text-white">{take.trackTake.headline}</p>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-neutral-400">{take.trackTake.summary}</p>
        </div>
      )}

      {take.raceDifference && (
        <div>
          <Eyebrow>What changed this year</Eyebrow>
          <p className="mt-1.5 text-[15px] font-semibold leading-snug text-white">{take.raceDifference.headline}</p>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-neutral-400">{take.raceDifference.summary}</p>
          {take.raceDifference.factors.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {take.raceDifference.factors.map((f) => (
                <li key={f.label} className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[11px] text-neutral-400">
                  {f.label}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {take.trackVsSeason && (
        <div>
          <Eyebrow>Track vs. season</Eyebrow>
          <p className="mt-1.5 text-[15px] font-semibold leading-snug text-white">{take.trackVsSeason.headline}</p>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-neutral-400">{take.trackVsSeason.summary}</p>
          {take.trackVsSeason.metrics.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1">
              {take.trackVsSeason.metrics.map((m) => (
                <li key={m} className="text-xs text-neutral-500">
                  · {m}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {take.historicalPattern && (
        <div>
          <Eyebrow>Historical pattern</Eyebrow>
          <p className="mt-1.5 text-[15px] font-semibold leading-snug text-white">{take.historicalPattern.headline}</p>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-neutral-400">{take.historicalPattern.summary}</p>
        </div>
      )}
    </motion.section>
  );
}
