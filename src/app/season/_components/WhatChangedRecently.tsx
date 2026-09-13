"use client";

import { motion, useReducedMotion } from "framer-motion";
import { LoadingRegion, TextSkeleton } from "@/components/ui/Skeletons";
import { useSeasonExplorer } from "../_context/SeasonExplorerContext";
import { computePositionChanges, type ConstructorStandingRow, type DriverStandingRow, type EntityType, type PersonalSeasonContext } from "../_service/season.pure";
import { useSeasonIntelligence } from "./ai/SeasonIntelligenceProvider";

type Mover = {
  entityId: string;
  entityType: EntityType;
  name: string;
  positionDelta: number;
  pointsDelta: number;
  favorite: boolean;
};

/**
 * What actually moved since the previous completed round.
 *
 * No card shell, no header bar, no per-row background box - it sits in the same plane as the
 * standings beside it, separated by a hairline rule rather than a border, which is what stops the
 * two reading as unrelated widgets dropped next to each other.
 *
 * Direction is carried by colour and a single arrow glyph rather than icon components: six rows
 * each with their own icon was a lot of visual noise for information a "+2" already conveys.
 */
export function WhatChangedRecently({
  drivers,
  constructors,
  progression,
  personal,
}: {
  drivers: DriverStandingRow[];
  constructors: ConstructorStandingRow[];
  progression: Record<string, number | string | null>[];
  personal: PersonalSeasonContext;
}) {
  const { intelligence, loading } = useSeasonIntelligence();
  const { focusEntity } = useSeasonExplorer();
  const reduceMotion = useReducedMotion();

  const changes = computePositionChanges(drivers, constructors, progression);
  const favoriteDrivers = new Set(personal.driverCodes);
  const favoriteTeams = new Set(personal.teamNames);

  const movers: Mover[] = [
    ...changes.drivers.map((c) => ({
      entityId: c.entityId,
      entityType: "drivers" as const,
      name: drivers.find((d) => d.driver === c.entityId)?.driverName ?? "",
      positionDelta: c.positionDelta ?? 0,
      pointsDelta: c.pointsDelta ?? 0,
      favorite: favoriteDrivers.has(c.entityId),
    })),
    ...changes.constructors.map((c) => ({
      entityId: c.entityId,
      entityType: "constructors" as const,
      name: c.entityId,
      positionDelta: c.positionDelta ?? 0,
      pointsDelta: c.pointsDelta ?? 0,
      favorite: favoriteTeams.has(c.entityId),
    })),
  ]
    .filter((m) => m.name && (m.positionDelta !== 0 || m.pointsDelta > 10))
    // A favorite that moved is the thing this reader came to find out, so it sorts first - one of
    // the deterministic personalization overlays, not a separate personalized section.
    .sort((a, b) => Number(b.favorite) - Number(a.favorite) || Math.abs(b.positionDelta) - Math.abs(a.positionDelta) || b.pointsDelta - a.pointsDelta)
    .slice(0, 7);

  const hasPriorRound = progression.length >= 2;

  return (
    <section aria-label="What changed recently" className="flex h-full flex-col">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500">What changed</p>
      <div aria-hidden className="mt-2 h-px w-full bg-gradient-to-r from-white/[0.09] to-transparent" />
      <p className="mt-2.5 text-[11px] text-neutral-600">Since the previous completed round</p>

      {loading ? (
        <LoadingRegion label="Loading what changed">
          <TextSkeleton className="mt-3" width="82%" height={11} />
        </LoadingRegion>
      ) : (
        intelligence?.whatChangedInsight?.summary && (
          <p className="mt-3 text-sm leading-relaxed text-neutral-400">{intelligence.whatChangedInsight.summary}</p>
        )
      )}

      {!hasPriorRound ? (
        <p className="mt-4 text-sm text-neutral-500">Nothing to compare against yet — this is the opening round of the season.</p>
      ) : movers.length === 0 ? (
        <p className="mt-4 text-sm text-neutral-500">The order held after the latest round. Points still moved; the standings alongside show where.</p>
      ) : (
        <div className="mt-3 divide-y divide-white/[0.055]">
          {movers.map((mover, i) => (
            <motion.button
              key={`${mover.entityType}:${mover.entityId}`}
              type="button"
              onClick={() => focusEntity(mover.entityType, mover.entityId)}
              className="group flex w-full items-center justify-between gap-3 rounded-[3px] py-2.5 text-left transition-colors duration-150 hover:bg-white/[0.025] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--f1-red)]"
              initial={reduceMotion ? false : { opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.22, delay: reduceMotion ? 0 : i * 0.03, ease: "easeOut" }}
            >
              <span className="flex min-w-0 items-center gap-2">
                {mover.favorite && <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--f1-red)]" />}
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-white">
                    {mover.name}
                    {mover.favorite && <span className="sr-only"> (one of your favorites)</span>}
                  </span>
                  <span className="block text-xs tabular-nums text-neutral-500">
                    {mover.pointsDelta > 0 ? `+${mover.pointsDelta} pts` : "no points scored"}
                  </span>
                </span>
              </span>
              <Delta value={mover.positionDelta} />
            </motion.button>
          ))}
        </div>
      )}
    </section>
  );
}

/** Green up, red down, neutral flat — the arrow is a glyph rather than an icon component so a
 * list of seven of these stays quiet. */
function Delta({ value }: { value: number }) {
  if (value === 0) {
    return (
      <span className="shrink-0 font-mono text-xs tabular-nums text-neutral-600" aria-label="no position change">
        —
      </span>
    );
  }
  const up = value > 0;
  return (
    <span
      className={`flex shrink-0 items-center gap-1 font-mono text-sm font-semibold tabular-nums ${up ? "text-emerald-400" : "text-[var(--f1-red)]"}`}
      aria-label={`${up ? "up" : "down"} ${Math.abs(value)} position${Math.abs(value) === 1 ? "" : "s"}`}
    >
      <span aria-hidden>{up ? "▲" : "▼"}</span>
      {Math.abs(value)}
    </span>
  );
}
