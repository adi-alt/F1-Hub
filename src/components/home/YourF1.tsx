"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ChampionshipTrajectory, type TrajectorySeries } from "./ChampionshipTrajectory";
import { DriverFormStrip, DriverFormStripSkeleton } from "./DriverFormStrip";
import { EntityAvatar } from "@/components/EntityAvatar";
import { Tabs, type TabItem } from "@/components/ui/Tabs";
import { chart } from "@/components/charts/chartTheme";
import { Skeleton } from "@/components/ui/Skeleton";
import type { DriverStanding, FavoriteDriverCard, FavoriteTeamCard } from "@/lib/personalization";
import type { RaceDoc } from "@/lib/types/race";
import { useAuth } from "@/providers/AuthProvider";

const TABS: TabItem[] = [
  { key: "overview", label: "Overview" },
  { key: "form", label: "Form" },
  { key: "championship", label: "Championship" },
];

/** The personal cockpit - Tier 2 surface (see the redesign plan's surface hierarchy): a compact,
 * always-visible identity/standing header, plus progressive disclosure via tabs instead of
 * permanently rendering everything at once (stats, form, and the trajectory chart all used to be
 * stacked in one always-expanded card). Tab state is fully controlled from outside
 * (`activeTab`/`onTabChange`, lifted to PersonalHomeInner) so the hero radar's clickable driver/
 * team/predictions elements can drive it. */
export function YourF1({
  favoriteDriver,
  favoriteTeam,
  races,
  predictionCount,
  driverLeader,
  favoriteDriverRank,
  favoriteTeamRank,
  favoriteDriverPoints,
  favoriteDriverGapToLeader,
  activeTab,
  onTabChange,
}: {
  favoriteDriver: FavoriteDriverCard | null;
  favoriteTeam: FavoriteTeamCard | null;
  races: RaceDoc[];
  predictionCount: number;
  driverLeader: DriverStanding | null;
  favoriteDriverRank?: number | null;
  favoriteTeamRank?: number | null;
  favoriteDriverPoints?: number | null;
  favoriteDriverGapToLeader?: number | null;
  activeTab: string;
  onTabChange: (key: string) => void;
}) {
  const { pointsBalance } = useAuth();
  const hasFavorites = !!favoriteDriver || !!favoriteTeam;

  const trajectorySeries: TrajectorySeries[] = [];
  if (favoriteDriver?.code) trajectorySeries.push({ code: favoriteDriver.code, label: favoriteDriver.name, color: "var(--f1-red)" });
  if (driverLeader && driverLeader.driver !== favoriteDriver?.code) trajectorySeries.push({ code: driverLeader.driver, label: driverLeader.driverName, color: chart.sequentialBlue });

  const resolvedTab = TABS.find((t) => t.key === activeTab) ? activeTab : "overview";

  return (
    <section id="your-f1-section" className="scroll-mt-6">
      <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--f1-red)]">Your F1</h2>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="mt-4 rounded-2xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/40 p-5 sm:p-6"
      >
        {!hasFavorites ? (
          <div>
            <p className="text-sm text-neutral-400">Choose a favorite driver and team to see them here.</p>
            <Link href="/profile?section=personalisation" className="mt-2 inline-block text-sm font-medium text-[var(--f1-red)] hover:brightness-125">
              Choose your favorites →
            </Link>
          </div>
        ) : (
          <>
            {/* Always-visible compact identity/standing header - not another full stat card, just
             * enough to orient at a glance before the tabs below reveal more. */}
            <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
              {favoriteDriver ? (
                <Link href={favoriteDriver.href} className="flex items-center gap-3 transition hover:opacity-90">
                  <EntityAvatar imageUrl={favoriteDriver.headshotUrl} name={favoriteDriver.name} size={36} />
                  <div>
                    <p className="font-semibold text-white">{favoriteDriver.name}</p>
                    <p className="text-xs text-neutral-500">
                      {favoriteDriverRank && <span className="font-mono">P{favoriteDriverRank} WDC</span>}
                      {favoriteDriverPoints != null && <span> · {favoriteDriverPoints} pts</span>}
                      {favoriteDriverGapToLeader != null && favoriteDriverGapToLeader > 0 && <span> · {favoriteDriverGapToLeader} to leader</span>}
                      {favoriteDriverGapToLeader === 0 && <span className="text-[var(--f1-red)]"> · leads the championship</span>}
                    </p>
                  </div>
                </Link>
              ) : (
                <Link href="/profile?section=personalisation" className="text-sm font-medium text-neutral-400 hover:text-white">
                  Choose your favorite driver →
                </Link>
              )}

              {favoriteTeam ? (
                <Link href={favoriteTeam.href} className="flex items-center gap-3 transition hover:opacity-90">
                  <EntityAvatar imageUrl={favoriteTeam.logoUrl} name={favoriteTeam.name} size={36} fit="contain" />
                  <div>
                    <p className="font-semibold text-white">{favoriteTeam.name}</p>
                    {favoriteTeamRank && <p className="font-mono text-xs text-neutral-500">P{favoriteTeamRank} WCC</p>}
                  </div>
                </Link>
              ) : (
                <Link href="/profile?section=personalisation" className="text-sm font-medium text-neutral-400 hover:text-white">
                  Choose your favorite team →
                </Link>
              )}
            </div>

            <div className="mt-4 border-t border-white/[0.06] pt-4">
              <Tabs items={TABS} activeKey={resolvedTab} onChange={onTabChange} layoutId="your-f1-tabs" panelId="your-f1-panel" />

              <div id="your-f1-panel" role="tabpanel" aria-labelledby={`tabs-your-f1-tab-${resolvedTab}`} className="mt-4">
                {resolvedTab === "overview" && (
                  <div className="flex items-center gap-6">
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-neutral-500">Points</p>
                      <p className="font-mono text-lg font-semibold text-white">{pointsBalance ?? "—"}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-neutral-500">Predictions</p>
                      <p className="font-mono text-lg font-semibold text-white">{predictionCount}</p>
                    </div>
                  </div>
                )}

                {resolvedTab === "form" && (
                  favoriteDriver?.code ? (
                    <DriverFormStrip favoriteDriverCode={favoriteDriver.code} races={races} />
                  ) : (
                    <p className="text-sm text-neutral-500">Choose a favorite driver to see recent form.</p>
                  )
                )}

                {resolvedTab === "championship" && (
                  trajectorySeries.length > 0 ? (
                    <ChampionshipTrajectory races={races} series={trajectorySeries} />
                  ) : (
                    <p className="text-sm text-neutral-500">Not enough data yet to plot a trajectory.</p>
                  )
                )}
              </div>
            </div>
          </>
        )}
      </motion.div>
    </section>
  );
}

export function PersonalOverviewSkeleton() {
  return (
    <section>
      <Skeleton className="skeleton-shimmer h-3 w-16 rounded" />
      <div className="mt-4 rounded-2xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/40 p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-8">
          <div className="flex items-center gap-3">
            <Skeleton className="skeleton-shimmer h-9 w-9 rounded-full" />
            <Skeleton className="skeleton-shimmer h-8 w-24 rounded" />
          </div>
          <div className="flex items-center gap-3">
            <Skeleton className="skeleton-shimmer h-9 w-9 rounded-full" />
            <Skeleton className="skeleton-shimmer h-8 w-20 rounded" />
          </div>
        </div>
        <div className="mt-4 border-t border-white/[0.06] pt-4">
          <Skeleton className="skeleton-shimmer h-7 w-48 rounded-full" />
          <div className="mt-4">
            <DriverFormStripSkeleton />
          </div>
        </div>
      </div>
    </section>
  );
}
