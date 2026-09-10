"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Tabs, type TabItem } from "@/components/ui/Tabs";
import { Skeleton } from "@/components/ui/Skeleton";
import { useHomepageIntelligence } from "./HomepageIntelligenceProvider";

type TabKey = "briefing" | "yourRace" | "watch" | "risks";

const PANEL_ID = "apex-workspace-panel";

/** ONE tabbed intelligence workspace, replacing what used to be three separate stacked cards
 * (RaceBrief, YourRace, BlindSpot - all deleted). Same underlying `HomepageIntelligence` fields as
 * before, no schema/prompt/cache change - this is purely how they're presented: BRIEFING
 * (raceBrief), YOUR RACE (personalRaceBrief/favoriteDriverInsight/favoriteTeamInsight/personalOutlook
 * minus overallAssessment, which the hero's RaceIntelligencePanel already shows - no duplication),
 * WATCH (oneThingToWatch), RISKS (biggestUncertainty, keeping BlindSpot's amber accent scoped to
 * just this one tab's panel).
 *
 * Tab state is fully controlled from outside (`activeTab`/`onTabChange`, lifted to PersonalHomeInner)
 * so the floating Apex widget's quick-jump buttons can switch tabs here - this component owns no tab
 * state of its own. */
export function ApexIntelligenceWorkspace({
  activeTab,
  onTabChange,
}: {
  activeTab: string;
  onTabChange: (key: string) => void;
}) {
  const { intelligence, isLoading } = useHomepageIntelligence();

  if (isLoading) {
    return <ApexIntelligenceWorkspaceSkeleton />;
  }
  if (!intelligence) {
    return null;
  }

  const hasYourRace = !!(
    intelligence.personalRaceBrief ||
    intelligence.favoriteDriverInsight ||
    intelligence.favoriteTeamInsight ||
    intelligence.personalOutlook
  );

  const allTabs: { key: TabKey; label: string; teaser: string | null }[] = [
    { key: "briefing", label: "Briefing", teaser: intelligence.raceBrief?.headline ?? null },
    {
      key: "yourRace",
      label: "Your Race",
      teaser: hasYourRace
        ? intelligence.personalRaceBrief?.headline ??
          intelligence.favoriteDriverInsight ??
          intelligence.favoriteTeamInsight ??
          intelligence.personalOutlook?.championshipContext ??
          null
        : null,
    },
    { key: "watch", label: "Watch", teaser: intelligence.oneThingToWatch?.topic ?? null },
    { key: "risks", label: "Risks", teaser: intelligence.biggestUncertainty?.title ?? null },
  ];
  const tabs = allTabs.filter((t) => t.key !== "yourRace" || hasYourRace);
  if (tabs.length === 0) return null;

  const resolvedActive: TabKey = (tabs.find((t) => t.key === activeTab)?.key ?? tabs[0].key) as TabKey;
  const tabItems: TabItem[] = tabs.map((t) => ({ key: t.key, label: t.label }));
  const otherTabs = tabs.filter((t) => t.key !== resolvedActive && t.teaser);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="relative overflow-hidden rounded-2xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/40 p-5 sm:p-6"
    >
      {/* The one restrained accent in this whole redesign - reserved for Apex so it reads as the
       * premium centerpiece (Tier 1), not spread across every section. A static top-edge gradient
       * line, not a moving glow - "restrained," per the brief. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--f1-red)]/60 to-transparent" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span aria-hidden className="text-[var(--f1-red)]">✦</span>
          <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-white">Apex Intelligence</h3>
        </div>
        <Tabs items={tabItems} activeKey={resolvedActive} onChange={onTabChange} layoutId="apex-workspace-tabs" panelId={PANEL_ID} />
      </div>

      <div
        id={PANEL_ID}
        role="tabpanel"
        aria-labelledby={`tabs-apex-tab-${resolvedActive}`}
        className="mt-4"
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={resolvedActive}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            {resolvedActive === "briefing" && intelligence.raceBrief && (
              <div className="space-y-3">
                <p className="text-base font-semibold text-white sm:text-lg leading-snug">{intelligence.raceBrief.headline}</p>
                <p className="text-sm leading-relaxed text-neutral-300">{intelligence.raceBrief.whyItMatters}</p>
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5">
                  <p className="text-xs text-neutral-400">
                    <span className="font-semibold text-white">Key Tactical Factor: </span>
                    {intelligence.raceBrief.keyFactor}
                  </p>
                </div>
              </div>
            )}

            {resolvedActive === "yourRace" && (
              <div className="space-y-3">
                {intelligence.personalRaceBrief && (
                  <>
                    <p className="text-base font-semibold text-white sm:text-lg leading-snug">{intelligence.personalRaceBrief.headline}</p>
                    <p className="text-sm leading-relaxed text-neutral-300">{intelligence.personalRaceBrief.whyItMatters}</p>
                    {(intelligence.personalRaceBrief.favoriteDriverAngle || intelligence.personalRaceBrief.favoriteTeamAngle) && (
                      <div className="flex flex-col gap-2 sm:flex-row sm:gap-8">
                        {intelligence.personalRaceBrief.favoriteDriverAngle && (
                          <p className="text-xs leading-relaxed text-neutral-400 sm:max-w-xs">
                            <span className="font-medium text-neutral-200">Your driver — </span>
                            {intelligence.personalRaceBrief.favoriteDriverAngle}
                          </p>
                        )}
                        {intelligence.personalRaceBrief.favoriteTeamAngle && (
                          <p className="text-xs leading-relaxed text-neutral-400 sm:max-w-xs">
                            <span className="font-medium text-neutral-200">Your team — </span>
                            {intelligence.personalRaceBrief.favoriteTeamAngle}
                          </p>
                        )}
                      </div>
                    )}
                  </>
                )}
                {/* overallAssessment deliberately omitted - already shown in the hero's
                 * RaceIntelligencePanel "Your outlook" block; these three are net-new there. */}
                {intelligence.personalOutlook && (
                  <div className="space-y-1.5 text-xs leading-relaxed text-neutral-400">
                    <p>{intelligence.personalOutlook.championshipContext}</p>
                    <p>{intelligence.personalOutlook.circuitContext}</p>
                    <p>{intelligence.personalOutlook.modelContext}</p>
                  </div>
                )}
                {intelligence.favoriteDriverInsight && <p className="text-sm leading-relaxed text-neutral-300">{intelligence.favoriteDriverInsight}</p>}
                {intelligence.favoriteTeamInsight && <p className="text-sm leading-relaxed text-neutral-300">{intelligence.favoriteTeamInsight}</p>}
              </div>
            )}

            {resolvedActive === "watch" && intelligence.oneThingToWatch && (
              <div className="space-y-1.5">
                <p className="text-base font-semibold text-white sm:text-lg leading-snug">{intelligence.oneThingToWatch.topic}</p>
                <p className="text-sm leading-relaxed text-neutral-300">{intelligence.oneThingToWatch.explanation}</p>
              </div>
            )}

            {resolvedActive === "risks" && intelligence.biggestUncertainty && (
              <div className="space-y-1.5 rounded-xl border border-amber-500/25 bg-amber-500/[0.05] p-4">
                <p className="text-sm font-semibold text-white sm:text-base">{intelligence.biggestUncertainty.title}</p>
                <p className="text-xs leading-relaxed text-neutral-300">{intelligence.biggestUncertainty.explanation}</p>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {otherTabs.length > 0 && (
        <div className="mt-4 border-t border-white/[0.06] pt-3">
          <p className="text-[10px] uppercase tracking-wide text-neutral-600">Also in this briefing:</p>
          <div className="mt-1.5 space-y-1">
            {otherTabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => onTabChange(t.key)}
                className="block truncate text-left text-xs text-neutral-400 transition hover:text-white"
              >
                <span aria-hidden className="mr-1 text-neutral-600">→</span>
                <span className="font-medium uppercase tracking-wide text-neutral-500">{t.label}: </span>
                {t.teaser}
              </button>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}

export function ApexIntelligenceWorkspaceSkeleton() {
  return (
    <div className="rounded-2xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/40 p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <Skeleton className="skeleton-shimmer h-3.5 w-36 rounded" />
        <Skeleton className="skeleton-shimmer h-7 w-56 rounded-full" />
      </div>
      <div className="mt-4 space-y-3">
        <Skeleton className="skeleton-shimmer h-6 w-5/6 rounded" />
        <Skeleton className="skeleton-shimmer h-4 w-full rounded" />
        <Skeleton className="skeleton-shimmer h-4 w-4/5 rounded" />
        <Skeleton className="skeleton-shimmer h-10 w-full rounded-xl mt-2" />
      </div>
    </div>
  );
}
