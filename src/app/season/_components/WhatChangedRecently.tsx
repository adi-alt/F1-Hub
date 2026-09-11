"use client";

import { ArrowUpIcon, ArrowDownIcon, MinusIcon } from "lucide-react";
import { useFavDriverIds, useFavTeamIds } from "@/queries/favorites/useFavorites";
import type { DriverStandingRow, ConstructorStandingRow } from "../_service/season.pure";
import { computePositionChanges } from "../_service/season.pure";
import { useSeasonIntelligence } from "./ai/SeasonIntelligenceProvider";

/** A flat, dense list - typography and arrows doing the work, not a card shell with its own
 * header bar and per-row background boxes. Favorited drivers sort first (a small dot marks them)
 * so "what changed" answers "did MY driver move" before the generic championship-wide list. */
export function WhatChangedRecently({
  drivers,
  constructors,
  progression,
}: {
  drivers: DriverStandingRow[];
  constructors: ConstructorStandingRow[];
  progression: Record<string, number | string | null>[];
}) {
  const { intelligence } = useSeasonIntelligence();
  const favDrivers = useFavDriverIds();
  const favTeams = useFavTeamIds();
  const changes = computePositionChanges(drivers, constructors, progression);

  const driverIsFavorite = (entityId: string) => {
    const d = drivers.find((x) => x.driver === entityId);
    return !!d?.favoriteId && favDrivers.has(d.favoriteId);
  };
  const teamIsFavorite = (entityId: string) => {
    const c = constructors.find((x) => x.team === entityId);
    return !!c && favTeams.has(c.favoriteId);
  };

  const movers = [...changes.drivers, ...changes.constructors.map((c) => ({ ...c, isTeam: true as const }))]
    .filter((m) => (m.positionDelta && m.positionDelta !== 0) || (m.pointsDelta && m.pointsDelta > 10))
    .map((m) => ({ ...m, favorite: "isTeam" in m ? teamIsFavorite(m.entityId) : driverIsFavorite(m.entityId) }))
    .sort((a, b) => Number(b.favorite) - Number(a.favorite) || Math.abs(b.positionDelta ?? 0) - Math.abs(a.positionDelta ?? 0))
    .slice(0, 6);

  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-500">What changed</p>
      <div className="mt-2 h-px w-full bg-white/[0.06]" />

      {intelligence?.whatChangedInsight && <p className="mt-3 text-sm leading-relaxed text-neutral-400">{intelligence.whatChangedInsight.summary}</p>}

      {progression.length < 2 ? (
        <p className="mt-3 text-sm text-neutral-500">No changes to show yet, this is the opening round of the season.</p>
      ) : movers.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-500">The standings held after the latest round. Points still shifted, see the full standings above.</p>
      ) : (
        <div className="mt-3 divide-y divide-white/[0.06]">
          {movers.map((mover) => {
            const isTeam = "isTeam" in mover;
            const name = isTeam ? mover.entityId : drivers.find((d) => d.driver === mover.entityId)?.driverName;
            if (!name) return null;

            const delta = mover.positionDelta ?? 0;
            const isUp = delta > 0;
            const isDown = delta < 0;
            const deltaColor = isUp ? "text-emerald-400" : isDown ? "text-[var(--f1-red)]" : "text-neutral-500";

            return (
              <div key={mover.entityId} className="flex items-center justify-between gap-3 py-2.5">
                <div className="flex min-w-0 items-center gap-2">
                  {mover.favorite && <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--f1-red)]" />}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">{name}</p>
                    <p className="text-xs text-neutral-500">
                      {mover.pointsDelta ? `+${mover.pointsDelta} pts` : "No points gained"}
                    </p>
                  </div>
                </div>
                <div className={`flex shrink-0 items-center gap-1 text-sm font-semibold tabular-nums ${deltaColor}`}>
                  {isUp && <ArrowUpIcon className="h-3.5 w-3.5" />}
                  {isDown && <ArrowDownIcon className="h-3.5 w-3.5" />}
                  {!isUp && !isDown && <MinusIcon className="h-3.5 w-3.5" />}
                  {Math.abs(delta)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
