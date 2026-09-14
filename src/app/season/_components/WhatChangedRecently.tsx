"use client";

import { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { LoadingRegion, TextSkeleton } from "@/components/ui/Skeletons";
import { Sparkline, type SparkPoint } from "@/components/ui/Sparkline";
import { useSeasonExplorer } from "../_context/SeasonExplorerContext";
import { computePositionChanges, type ConstructorStandingRow, type DriverStandingRow, type PersonalSeasonContext, type RaceSummary } from "../_service/season.pure";
import { recentPointsSeries } from "../_service/seasonAnalytics";
import { useSeasonIntelligence } from "./ai/SeasonIntelligenceProvider";

type Mover = {
  entityId: string;
  name: string;
  positionDelta: number;
  pointsDelta: number;
  currentPosition: number;
  favorite: boolean;
  series: SparkPoint[];
};

// Enough rows to fill the column beside a standings table without becoming a second table.
const MAX_ROWS = 7;

/**
 * What actually moved since the previous completed round.
 *
 * Two things make this more than a list of arrows. First it follows the ACTIVE championship: on
 * the Constructors tab it reports team movement, not driver movement, so it can never describe a
 * different table from the one beside it. Second, every row carries a sparkline of that entity's
 * cumulative points across recent rounds, which is what turns "+10 pts, up 1" into a shape you
 * can read at a glance: climbing, holding, or tailing off.
 *
 * It fills the full height of its grid row rather than stopping short, with the list scrolling
 * internally - the standings table beside it does the same, which is what keeps the two columns
 * ending on the same baseline without padding either of them out.
 */
export function WhatChangedRecently({
  drivers,
  constructors,
  raceSummaries,
  progression,
  personal,
}: {
  drivers: DriverStandingRow[];
  constructors: ConstructorStandingRow[];
  raceSummaries: RaceSummary[];
  progression: Record<string, number | string | null>[];
  personal: PersonalSeasonContext;
}) {
  const { intelligence, loading } = useSeasonIntelligence();
  const { entityType, focusEntity } = useSeasonExplorer();
  const reduceMotion = useReducedMotion();
  const isDrivers = entityType === "drivers";

  const movers = useMemo<Mover[]>(() => {
    const changes = computePositionChanges(drivers, constructors, progression);
    const favorites = new Set(isDrivers ? personal.driverCodes : personal.teamNames);
    const source = isDrivers ? changes.drivers : changes.constructors;

    return source
      .map((c) => ({
        entityId: c.entityId,
        name: isDrivers ? drivers.find((d) => d.driver === c.entityId)?.driverName ?? "" : c.entityId,
        positionDelta: c.positionDelta ?? 0,
        pointsDelta: c.pointsDelta ?? 0,
        currentPosition: c.currentPosition,
        favorite: favorites.has(c.entityId),
        series: recentPointsSeries(c.entityId, raceSummaries, !isDrivers),
      }))
      .filter((m) => m.name && (m.positionDelta !== 0 || m.pointsDelta > 0))
      // A favorite that moved is what this reader came to find out, so it sorts first. After that,
      // the biggest position swing, then the biggest points haul.
      .sort(
        (a, b) =>
          Number(b.favorite) - Number(a.favorite) ||
          Math.abs(b.positionDelta) - Math.abs(a.positionDelta) ||
          b.pointsDelta - a.pointsDelta,
      )
      .slice(0, MAX_ROWS);
  }, [drivers, constructors, raceSummaries, progression, personal, isDrivers]);

  const hasPriorRound = progression.length >= 2;

  return (
    <section aria-label="What changed recently" className="flex h-full min-h-0 flex-col">
      <header className="shrink-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500">What changed</p>
        <div aria-hidden className="mt-2 h-px w-full bg-gradient-to-r from-white/[0.09] to-transparent" />
        <p className="mt-2.5 text-[11px] text-neutral-600">
          {isDrivers ? "Drivers" : "Constructors"} · since the previous completed round
        </p>

        {loading ? (
          <LoadingRegion label="Loading what changed">
            <TextSkeleton className="mt-3" width="84%" height={11} />
            <TextSkeleton className="mt-1.5" width="56%" height={11} />
          </LoadingRegion>
        ) : (
          intelligence?.whatChangedInsight?.summary && (
            <p className="mt-3 text-sm leading-relaxed text-neutral-400">{intelligence.whatChangedInsight.summary}</p>
          )
        )}
      </header>

      {!hasPriorRound ? (
        <Empty>Nothing to compare against yet — this is the opening round of the season.</Empty>
      ) : movers.length === 0 ? (
        <Empty>
          No major championship movement after the latest round. The {isDrivers ? "drivers'" : "constructors'"} order held exactly as it was.
        </Empty>
      ) : (
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto scrollbar-subtle">
          <div className="divide-y divide-white/[0.055]">
            {movers.map((mover, i) => (
              <motion.button
                key={`${entityType}:${mover.entityId}`}
                type="button"
                onClick={() => focusEntity(entityType, mover.entityId)}
                className="group flex w-full items-center gap-3 rounded-[3px] py-2.5 text-left transition-colors duration-150 hover:bg-white/[0.028] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--f1-red)]"
                initial={reduceMotion ? false : { opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.22, delay: reduceMotion ? 0 : i * 0.03, ease: "easeOut" }}
                // Lightweight hover detail, per the "optional and lightweight" brief - no tooltip
                // component, no extra state, and it reads identically to assistive tech.
                title={`${mover.name} · P${mover.currentPosition} · ${mover.series.map((p) => `R${p.round}: ${p.points} pts`).join(", ")}`}
              >
                <span className="flex min-w-0 flex-1 items-center gap-2">
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

                <Sparkline series={mover.series} label={mover.name} />
                <Delta value={mover.positionDelta} />
              </motion.button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

/** Empty states sit centred in the remaining space rather than clinging to the top, so the column
 * doesn't read as "broken, with a hole under it". */
function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center py-8">
      <p className="max-w-[28ch] text-center text-sm leading-relaxed text-neutral-500">{children}</p>
    </div>
  );
}

/** Green up, red down, neutral flat. The arrow is a glyph rather than an icon component so a
 * column of seven stays quiet, and the direction is also in the aria-label so colour is never the
 * only carrier of meaning. */
function Delta({ value }: { value: number }) {
  if (value === 0) {
    return (
      <span className="w-9 shrink-0 text-right font-mono text-xs tabular-nums text-neutral-600" aria-label="no position change">
        —
      </span>
    );
  }
  const up = value > 0;
  return (
    <span
      className={`flex w-9 shrink-0 items-center justify-end gap-1 font-mono text-sm font-semibold tabular-nums ${up ? "text-emerald-400" : "text-[var(--f1-red)]"}`}
      aria-label={`${up ? "up" : "down"} ${Math.abs(value)} position${Math.abs(value) === 1 ? "" : "s"}`}
    >
      <span aria-hidden>{up ? "▲" : "▼"}</span>
      {Math.abs(value)}
    </span>
  );
}
