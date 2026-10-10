"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { InsightSkeleton, LoadingRegion } from "@/components/ui/Skeletons";
import { TabList, TabPanels, Tabs } from "@/components/ui/Tabs";
import { RaceSectionCard } from "@/components/raceDetail/RaceSectionCard";
import type { SharedCircuitIntelligence } from "@/lib/ai/schemas/seasonIntelligence";

type BlockKey = "trackTake" | "raceDifference" | "trackVsSeason" | "historicalPattern";

const TAB_LABEL: Record<BlockKey, string> = {
  trackTake: "Circuit take",
  raceDifference: "What changed",
  trackVsSeason: "Track vs. season",
  historicalPattern: "History",
};

const BLOCK_ORDER: BlockKey[] = ["trackTake", "raceDifference", "trackVsSeason", "historicalPattern"];

/** The circuit page's editorial intelligence - up to four real, grounded blocks (see
 * generateCircuitTake/validateSharedCircuitIntelligence), presented as real tabs rather than one
 * long stacked read. Only a tab whose block the model actually returned for THIS circuit/state
 * ever appears - never a placeholder tab for a block that came back empty. Loads independently of
 * everything else on the page, exactly like RaceApexTake, so the rest of Track Experience is
 * readable the instant the page opens rather than waiting on a model response. */
export function CircuitApexTake({ location, year, status }: { location: string; year: number; status: string }) {
  const [take, setTake] = useState<SharedCircuitIntelligence | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<BlockKey | null>(null);

  const key = `${location}:${year}:${status}`;
  const [prevKey, setPrevKey] = useState(key);
  if (prevKey !== key) {
    setPrevKey(key);
    setTake(null);
    setLoading(true);
    setActiveTab(null);
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

  // Its own section, so that when Apex has nothing for this circuit the page shows nothing - never an empty box.
  if (loading) {
    return (
      <Frame>
        <LoadingRegion label="Apex is reading this circuit">
          <InsightSkeleton lines={2} />
        </LoadingRegion>
      </Frame>
    );
  }
  if (!take) return null;

  const availableTabs = BLOCK_ORDER.filter((k) => !!take[k]);
  if (availableTabs.length === 0) return null;
  const shownTab = activeTab && availableTabs.includes(activeTab) ? activeTab : availableTabs[0];
  const block = take[shownTab];
  if (!block) return null;

  // Each tab's panel mounts fresh when it's chosen, so this fades the new block in.
  const content = (
    <motion.div initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.16, ease: "easeOut" }}>
      {/* Headline beside the read, so a full-width section is filled rather than half empty. */}
      <div className="grid gap-x-10 gap-y-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
      <p className="text-title-md font-semibold text-primary">{block.headline}</p>
      <div>
      <p className="text-body-sm text-secondary">{block.summary}</p>

      {shownTab === "raceDifference" && "factors" in block && block.factors.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {block.factors.map((f) => (
            <li key={f.label} className="rounded-sm border border-subtle px-2 py-0.5 text-caption text-secondary">
              {f.label}
            </li>
          ))}
        </ul>
      )}

      {shownTab === "trackVsSeason" && "metrics" in block && block.metrics.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1">
          {block.metrics.map((m) => (
            <li key={m} className="text-caption text-secondary">
              · {m}
            </li>
          ))}
        </ul>
      )}
      </div>
      </div>
    </motion.div>
  );

  return (
    <Frame>

      {/* Segmented: small in-card tabs over one block of text, not page navigation. */}
      {availableTabs.length > 1 ? (
        <Tabs variant="segmented" value={shownTab} onValueChange={setActiveTab} items={availableTabs.map((k) => ({ value: k, label: TAB_LABEL[k] }))}>
          <TabList aria-label="Apex circuit intelligence" className="mb-3" />
          <TabPanels>{content}</TabPanels>
        </Tabs>
      ) : (
        content
      )}
      <p className="mt-4 text-caption text-tertiary">AI summary · Apex, from this circuit&apos;s results</p>
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <RaceSectionCard id="apex" title="Apex on this circuit">
      {children}
    </RaceSectionCard>
  );
}
