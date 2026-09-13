"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { SeasonInsight, SeasonInsightSkeleton } from "./ai/SeasonInsight";
import type { SeasonCompareInsight, CompareIdentity } from "@/lib/ai/schemas/seasonIntelligence";
import type { EntityType } from "../_service/season.pure";

// Long enough that dragging through a dropdown doesn't fire a request per entry, short enough
// that a deliberate selection doesn't feel like it stalled.
const DEBOUNCE_MS = 350;

type Props = { season: number; entityType: EntityType; entityA: string; entityB: string; aName: string; bName: string };

/**
 * Apex's read on the selected pair.
 *
 * Three independent guards keep a reply from ever landing under the wrong names, because relying
 * on any one of them alone is how the original bug survived:
 *
 *  1. DEBOUNCE — a selection still being changed doesn't start a request at all.
 *  2. ABORT — changing the selection aborts the in-flight request, so a superseded response is
 *     never even parsed.
 *  3. IDENTITY — the server echoes the exact (season, type, A, B) it generated for, and the
 *     response is dropped unless that still matches what is on screen. Arrival order is not
 *     trusted; a request that completes after its successor cannot overwrite it.
 *
 * The deterministic comparison beside this NEVER waits on any of it — this component owns only
 * its own skeleton.
 */
export function CompareIntelligence({ season, entityType, entityA, entityB, aName, bName }: Props) {
  const [insight, setInsight] = useState<SeasonCompareInsight | null>(null);
  const [loading, setLoading] = useState(true);
  const reduceMotion = useReducedMotion();

  const fingerprint = `${season}:${entityType}:${entityA}:${entityB}`;
  // With no resolvable pair there is nothing to fetch and therefore nothing to wait for - so this
  // decides the loading state up front rather than having the effect correct it afterwards.
  const hasPair = !!entityA && !!entityB && entityA !== entityB;

  // Reset during render rather than in the effect (React's own "adjust state when a prop changes"
  // pattern): an effect would paint the PREVIOUS pair's narrative once against the new names
  // before clearing it — which is exactly the symptom being fixed.
  const [prevFingerprint, setPrevFingerprint] = useState(fingerprint);
  if (prevFingerprint !== fingerprint) {
    setPrevFingerprint(fingerprint);
    setInsight(null);
    setLoading(hasPair);
  }

  useEffect(() => {
    if (!hasPair) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/ai/season-compare", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ season, entityType, entityA, entityB }),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`compare: ${res.status}`);
        const body = (await res.json()) as { content?: SeasonCompareInsight; identity?: CompareIdentity };

        // The last guard, and the only one that survives a response arriving out of order.
        const id = body.identity;
        if (!id || id.season !== season || id.entityType !== entityType || id.entityA !== entityA || id.entityB !== entityB) return;
        if (!body.content) throw new Error("compare: empty envelope");

        setInsight(body.content);
        setLoading(false);
      } catch {
        if (controller.signal.aborted) return;
        // The comparison itself is fully rendered from deterministic data; a missing narrative
        // just means this block stays empty rather than showing an error.
        setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [season, entityType, entityA, entityB, hasPair]);

  return (
    <AnimatePresence mode="wait" initial={false}>
      {loading ? (
        <motion.div key={`loading:${fingerprint}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
          <SeasonInsightSkeleton label={`Apex is comparing ${aName} and ${bName}`} />
        </motion.div>
      ) : insight ? (
        <motion.div
          key={`insight:${fingerprint}`}
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
        >
          <SeasonInsight eyebrow="Apex comparison" headline={insight.headline} summary={insight.summary} />
          <div className="-mt-3 mb-5 grid max-w-2xl grid-cols-1 gap-x-8 gap-y-1 text-[11px] text-neutral-500 sm:grid-cols-2">
            <p className="truncate">
              <span className="text-neutral-600">{aName}:</span> {insight.keyAdvantageA}
            </p>
            <p className="truncate">
              <span className="text-neutral-600">{bName}:</span> {insight.keyAdvantageB}
            </p>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
