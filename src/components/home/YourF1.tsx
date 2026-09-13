"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useMemo } from "react";
import { ChampionshipTrajectory, type TrajectorySeries } from "./ChampionshipTrajectory";
import { DriverFormStrip, DriverFormStripSkeleton } from "./DriverFormStrip";
import { EntityAvatar } from "@/components/EntityAvatar";
import { Tabs, type TabItem } from "@/components/ui/Tabs";
import { chart } from "@/components/charts/chartTheme";
import { trackShortForm } from "@/lib/format";
import { Skeleton } from "@/components/ui/Skeleton";
import type { DriverStanding, FavoriteDriverCard, FavoriteTeamCard, SeasonRecap, TeamStanding } from "@/lib/personalization";
import type { CurrentDriver } from "@/lib/supabase/media";
import type { RaceDoc } from "@/lib/types/race";
import { useAuth } from "@/providers/AuthProvider";

const TABS: TabItem[] = [
  { key: "overview", label: "Overview" },
  { key: "form", label: "Form" },
  { key: "championship", label: "Championship" },
];

type FavoriteOption =
  | { key: string; kind: "driver"; label: string; card: FavoriteDriverCard }
  | { key: string; kind: "team"; label: string; card: FavoriteTeamCard };

function driverKey(id: string) {
  return `driver:${id}`;
}
function teamKey(id: string) {
  return `team:${id}`;
}

/** The personal cockpit - Tier 2 surface (see the redesign plan's surface hierarchy): a compact,
 * always-visible identity/standing header, plus progressive disclosure via tabs instead of
 * permanently rendering everything at once. Tab state is fully controlled from outside
 * (`activeTab`/`onTabChange`, lifted to PersonalHomeInner) so the hero radar's clickable driver/
 * team/predictions elements can drive it.
 *
 * Multi-favorite: every favorite (driver or team) is a real, selectable entity - not just an
 * acknowledged count. `favoriteDrivers`/`favoriteTeams` are the full arrays; a compact switcher
 * (reusing Tabs.tsx, same shape system) appears only once there's more than one favorite total,
 * and drives which single entity Overview/Form/Championship analyze below. Deliberately NOT a
 * "plot every favorite at once" chart - that would clutter a small chart - every favorite is
 * individually analyzable via selection instead. Selection state is lifted the same way
 * `activeTab` is, so it survives a tab switch and can be seeded from YourF1Radar's click. */
export function YourF1({
  favoriteDriver,
  favoriteTeam,
  favoriteDrivers,
  favoriteTeams,
  races,
  predictionCount,
  driverLeader,
  teamLeader,
  favoriteDriverRanks,
  favoriteTeamRanks,
  currentDrivers,
  favoriteDriverRank,
  favoriteTeamRank,
  favoriteDriverPoints,
  favoriteDriverGapToLeader,
  activeTab,
  onTabChange,
  selectedFavoriteKey,
  onSelectFavorite,
}: {
  favoriteDriver: FavoriteDriverCard | null;
  favoriteTeam: FavoriteTeamCard | null;
  favoriteDrivers: FavoriteDriverCard[];
  favoriteTeams: FavoriteTeamCard[];
  races: RaceDoc[];
  predictionCount: number;
  driverLeader: DriverStanding | null;
  teamLeader: TeamStanding | null;
  favoriteDriverRanks: SeasonRecap["favoriteDriverRanks"];
  favoriteTeamRanks: SeasonRecap["favoriteTeamRanks"];
  currentDrivers: CurrentDriver[];
  favoriteDriverRank?: number | null;
  favoriteTeamRank?: number | null;
  favoriteDriverPoints?: number | null;
  favoriteDriverGapToLeader?: number | null;
  activeTab: string;
  onTabChange: (key: string) => void;
  selectedFavoriteKey: string;
  onSelectFavorite: (key: string) => void;
}) {
  const { pointsBalance } = useAuth();

  const favoriteOptions: FavoriteOption[] = useMemo(
    () => [
      ...favoriteDrivers.map((card): FavoriteOption => ({ key: driverKey(card.driverId), kind: "driver", label: card.name, card })),
      ...favoriteTeams.map((card): FavoriteOption => ({ key: teamKey(card.teamId), kind: "team", label: card.name, card })),
    ],
    [favoriteDrivers, favoriteTeams],
  );
  const hasFavorites = favoriteOptions.length > 0;
  const resolvedFavoriteKey = favoriteOptions.some((o) => o.key === selectedFavoriteKey) ? selectedFavoriteKey : (favoriteOptions[0]?.key ?? "");
  const selected = favoriteOptions.find((o) => o.key === resolvedFavoriteKey) ?? null;

  const resolvedTab = TABS.find((t) => t.key === activeTab) ? activeTab : "overview";

  // Additional favorites beyond the primary in each category - small secondary avatars + a "+N"
  // overflow badge, never a second full identity block (that's what the switcher below is for).
  const extraDrivers = favoriteDrivers.slice(1);
  const extraTeams = favoriteTeams.slice(1);

  // "Last time out" - polymorphic over the SELECTED entity (driver or team), not hardcoded to the
  // primary favorite driver the way this used to be. A team's "last time out" is its best classified
  // finish that race (its own real result, not a fabricated team-level finishing position).
  const lastResult = useMemo(() => {
    if (!selected) return null;
    const completed = [...races].filter((r) => r.status === "completed").sort((a, b) => b.round - a.round);
    if (selected.kind === "driver") {
      const code = selected.card.code;
      if (!code) return null;
      const match = completed.map((race) => ({ race, entry: race.results?.find((r) => r.driver === code) })).find((m) => m.entry != null);
      if (!match) return null;
      return { race: match.race, text: match.entry!.status === "dnf" ? "finished DNF" : `finished P${match.entry!.finishPosition}` };
    }
    const teamName = selected.card.currentName;
    if (!teamName) return null;
    const match = completed
      .map((race) => ({ race, entries: (race.results ?? []).filter((r) => r.team === teamName) }))
      .find((m) => m.entries.length > 0);
    if (!match) return null;
    const best = [...match.entries].sort((a, b) => a.finishPosition - b.finishPosition)[0];
    return { race: match.race, text: `had a best finish of P${best.finishPosition}` };
  }, [races, selected]);

  const selectedRankInfo =
    selected?.kind === "driver"
      ? favoriteDriverRanks.find((r) => r.id === selected.card.driverId)
      : selected?.kind === "team"
        ? favoriteTeamRanks.find((r) => r.id === selected.card.teamId)
        : undefined;

  const teamFormDrivers = selected?.kind === "team" ? currentDrivers.filter((d) => d.team === selected.card.currentName) : [];

  const championshipSeries: TrajectorySeries[] = [];
  if (selected?.kind === "driver" && selected.card.code) {
    championshipSeries.push({ code: selected.card.code, label: selected.card.name, color: "var(--f1-red)" });
    if (driverLeader && driverLeader.driver !== selected.card.code) {
      championshipSeries.push({ code: driverLeader.driver, label: driverLeader.driverName, color: chart.sequentialBlue });
    }
  } else if (selected?.kind === "team" && selected.card.currentName) {
    championshipSeries.push({ code: selected.card.currentName, label: selected.card.name, color: "var(--f1-red)" });
    if (teamLeader && teamLeader.team !== selected.card.currentName) {
      championshipSeries.push({ code: teamLeader.team, label: teamLeader.team, color: chart.sequentialBlue });
    }
  }

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
            {/* Always-visible compact identity/standing header - the PRIMARY favorite in each
             * category, plus small secondary avatars + a "+N" badge for the rest, so the header
             * never looks like it only knows about one favorite when there are several. */}
            <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
              {favoriteDriver ? (
                <div className="flex items-center gap-2">
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
                  {extraDrivers.length > 0 && <FavoriteOverflow cards={extraDrivers} kind="driver" />}
                </div>
              ) : (
                <Link href="/profile?section=personalisation" className="text-sm font-medium text-neutral-400 hover:text-white">
                  Choose your favorite driver →
                </Link>
              )}

              {favoriteTeam ? (
                <div className="flex items-center gap-2">
                  <Link href={favoriteTeam.href} className="flex items-center gap-3 transition hover:opacity-90">
                    <EntityAvatar imageUrl={favoriteTeam.logoUrl} name={favoriteTeam.name} size={36} fit="contain" />
                    <div>
                      <p className="font-semibold text-white">{favoriteTeam.name}</p>
                      {favoriteTeamRank && <p className="font-mono text-xs text-neutral-500">P{favoriteTeamRank} WCC</p>}
                    </div>
                  </Link>
                  {extraTeams.length > 0 && <FavoriteOverflow cards={extraTeams} kind="team" />}
                </div>
              ) : (
                <Link href="/profile?section=personalisation" className="text-sm font-medium text-neutral-400 hover:text-white">
                  Choose your favorite team →
                </Link>
              )}
            </div>

            {/* The real functional switcher - only appears once there's more than one favorite
             * total, and decides which single entity the tabs below analyze. Reuses Tabs.tsx (same
             * rounded-md segmented shape, sliding indicator) rather than inventing a new control. */}
            {favoriteOptions.length > 1 && (
              <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Analyzing</span>
                <Tabs
                  items={favoriteOptions.map((o) => ({ key: o.key, label: o.label }))}
                  activeKey={resolvedFavoriteKey}
                  onChange={onSelectFavorite}
                  layoutId="your-f1-favorite-switcher"
                  panelId="your-f1-favorite-panel"
                />
              </div>
            )}

            <div className="mt-4 border-t border-white/[0.06] pt-4">
              <Tabs items={TABS} activeKey={resolvedTab} onChange={onTabChange} layoutId="your-f1-tabs" panelId="your-f1-panel" />

              <div id="your-f1-panel" role="tabpanel" aria-labelledby={`tabs-your-f1-tab-${resolvedTab}`} className="mt-4">
                {resolvedTab === "overview" && (
                  <div>
                    <div className="flex flex-wrap items-center gap-6">
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-neutral-500">Points</p>
                        <p className="font-mono text-lg font-semibold text-white">{pointsBalance ?? "—"}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-neutral-500">Predictions</p>
                        <p className="font-mono text-lg font-semibold text-white">{predictionCount}</p>
                      </div>
                      {selectedRankInfo && (
                        <div>
                          <p className="text-[11px] uppercase tracking-wide text-neutral-500">{selected?.kind === "driver" ? "WDC" : "WCC"} rank</p>
                          <p className="font-mono text-lg font-semibold text-white">
                            P{selectedRankInfo.rank} <span className="text-sm font-normal text-neutral-400">· {selectedRankInfo.points} pts</span>
                          </p>
                        </div>
                      )}
                    </div>
                    {lastResult && selected && (
                      <p className="mt-3 text-xs text-neutral-500">
                        Last time out: <span className="text-neutral-300">{selected.label} {lastResult.text}</span> at{" "}
                        {trackShortForm(lastResult.race.circuit)}.
                      </p>
                    )}
                  </div>
                )}

                {resolvedTab === "form" &&
                  (selected?.kind === "driver" ? (
                    selected.card.code ? (
                      <DriverFormStrip favoriteDriverCode={selected.card.code} races={races} />
                    ) : (
                      <p className="text-sm text-neutral-500">No form data available for this driver.</p>
                    )
                  ) : selected?.kind === "team" ? (
                    teamFormDrivers.length > 0 ? (
                      <div className="space-y-4">
                        {teamFormDrivers.map((d) => (
                          <div key={d.code}>
                            <p className="mb-1 text-xs font-medium text-neutral-300">{d.name}</p>
                            <DriverFormStrip favoriteDriverCode={d.code} races={races} />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-neutral-500">No current drivers found for this team.</p>
                    )
                  ) : (
                    <p className="text-sm text-neutral-500">Choose a favorite to see recent form.</p>
                  ))}

                {resolvedTab === "championship" &&
                  (championshipSeries.length > 0 ? (
                    <ChampionshipTrajectory
                      races={races}
                      series={championshipSeries}
                      leaderCode={selected?.kind === "team" ? teamLeader?.team : driverLeader?.driver}
                      mode={selected?.kind === "team" ? "team" : "driver"}
                    />
                  ) : (
                    <p className="text-sm text-neutral-500">Not enough data yet to plot a trajectory.</p>
                  ))}
              </div>
            </div>
          </>
        )}
      </motion.div>
    </section>
  );
}

/** Small overflow indicator for favorites beyond the primary - up to 2 extra avatars shown inline,
 * then a "+N" badge for the rest, never a second full identity block per extra favorite (that would
 * be the "noisy homepage" the brief explicitly warns against). */
function FavoriteOverflow({ cards, kind }: { cards: (FavoriteDriverCard | FavoriteTeamCard)[]; kind: "driver" | "team" }) {
  const shown = cards.slice(0, 2);
  const rest = cards.length - shown.length;
  return (
    <div className="flex items-center -space-x-1.5">
      {shown.map((c) => (
        <Link
          key={"driverId" in c ? c.driverId : c.teamId}
          href={c.href}
          title={c.name}
          className="rounded-full ring-2 ring-[var(--f1-carbon)] transition hover:z-10 hover:ring-[var(--f1-red)]/50"
        >
          <EntityAvatar imageUrl={"headshotUrl" in c ? c.headshotUrl : c.logoUrl} name={c.name} size={20} fit={kind === "team" ? "contain" : undefined} />
        </Link>
      ))}
      {rest > 0 && (
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/10 text-[9px] font-semibold text-neutral-300 ring-2 ring-[var(--f1-carbon)]">
          +{rest}
        </span>
      )}
    </div>
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
          <Skeleton className="skeleton-shimmer h-7 w-48 rounded-lg" />
          <div className="mt-4">
            <DriverFormStripSkeleton />
          </div>
        </div>
      </div>
    </section>
  );
}
