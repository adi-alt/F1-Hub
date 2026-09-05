"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/Skeleton";
import { chart, tooltipStyle } from "@/components/charts/chartTheme";
import type { RaceDoc, UserPick } from "@/lib/types/race";

const TRACK_MAX_POSITION = 12;

type Marker = { key: "you" | "model" | "actual"; label: string; color: string; position: number };
type Row = { driver: string; slot: number; markers: Marker[] };

/** Exported for AIvsYou.tsx's own VS header row - same real derivation, not duplicated logic. */
export function modelPositionFor(race: RaceDoc, driver: string): number | null {
  const sim = race.simulation?.drivers.find((d) => d.driver === driver)?.medianPosition;
  if (sim != null) return sim;
  const pred = race.prediction?.finishOrder.find((d) => d.driver === driver)?.predictedPosition;
  return pred ?? null;
}

function actualPositionFor(race: RaceDoc, driver: string): number | null {
  if (race.status !== "completed") return null;
  const result = race.results?.find((r) => r.driver === driver);
  return result && result.status !== "dnf" ? result.finishPosition : null;
}

function buildRows(pick: UserPick, race: RaceDoc): Row[] {
  return pick.predictedPodium.map((driver, i) => {
    const slot = i + 1;
    const markers: Marker[] = [{ key: "you", label: "You", color: "var(--f1-red)", position: slot }];
    const modelPos = modelPositionFor(race, driver);
    if (modelPos != null) markers.push({ key: "model", label: "Model", color: chart.sequentialBlue, position: modelPos });
    const actualPos = actualPositionFor(race, driver);
    if (actualPos != null) markers.push({ key: "actual", label: "Actual", color: chart.sequentialGreen, position: actualPos });
    return { driver, slot, markers };
  });
}

function trackPct(position: number): string {
  return `${((Math.min(position, TRACK_MAX_POSITION) - 1) / (TRACK_MAX_POSITION - 1)) * 100}%`;
}

/** The flagship homepage visualization — a shared P1-P{max} track per predicted podium driver,
 * with a marker for your literal predicted slot, the model's expectation for that same driver, and
 * (once the race is done) their actual finish. Every marker is a genuine position on the same
 * axis — never a re-labeled abstraction — so the three are honestly comparable. Pre-race: You vs
 * Model. Post-race: adds Actual. */
export function PickVsModel({ myPick, nextRace }: { myPick: UserPick | null; nextRace: RaceDoc | null }) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  if (!myPick || !nextRace) return null;

  const rows = buildRows(myPick, nextRace);
  const hasModelData = rows.some((r) => r.markers.some((m) => m.key === "model"));
  if (!hasModelData) return null;

  return (
    <div>
      <div className="space-y-5">
        {rows.map((row, rowIndex) => (
          <div key={row.driver}>
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="font-semibold text-white">{row.driver}</span>
              <span className="text-neutral-600">Predicted P{row.slot}</span>
            </div>
            <div className="relative h-6">
              <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-[var(--f1-line)]" />
              {row.markers.map((marker, i) => {
                const hoverId = `${row.driver}-${marker.key}`;
                return (
                  <motion.div
                    key={marker.key}
                    initial={{ opacity: 0, left: "50%" }}
                    animate={{ opacity: 1, left: trackPct(marker.position) }}
                    transition={{ duration: 0.5, delay: rowIndex * 0.08 + i * 0.06, ease: "easeOut" }}
                    className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
                    onMouseEnter={() => setHoveredKey(hoverId)}
                    onMouseLeave={() => setHoveredKey(null)}
                  >
                    <span className="block h-3.5 w-3.5 rounded-full border-2 border-[var(--f1-carbon)]" style={{ background: marker.color }} />
                    {hoveredKey === hoverId && (
                      <div
                        className="pointer-events-none absolute -top-2 left-1/2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-xs shadow-[0_12px_32px_rgba(0,0,0,0.35)]"
                        style={{ background: tooltipStyle.background, backdropFilter: tooltipStyle.backdropFilter, WebkitBackdropFilter: tooltipStyle.WebkitBackdropFilter, borderColor: "var(--tooltip-border)" }}
                      >
                        <span className="font-semibold text-white">{marker.label}</span>
                        <span className="ml-1.5 text-neutral-400">P{marker.position}</span>
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-4 text-[10px] text-neutral-500">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: "var(--f1-red)" }} /> You
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: chart.sequentialBlue }} /> Model
        </span>
        {nextRace.status === "completed" && (
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: chart.sequentialGreen }} /> Actual
          </span>
        )}
      </div>
    </div>
  );
}

export function PickVsModelSkeleton() {
  return (
    <div className="space-y-5">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i}>
          <Skeleton className="skeleton-shimmer mb-1.5 h-3 w-24 rounded" />
          <Skeleton className="skeleton-shimmer h-6 w-full rounded" />
        </div>
      ))}
    </div>
  );
}
