"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { describeWeatherCode } from "@/lib/weatherCodes";
import { archiveCircuitHref } from "@/lib/routes";
import { CircuitThumb } from "@/components/circuit/CircuitThumb";
import type { CircuitDrawing } from "@/lib/circuitLayout";
import type { ArchiveCircuit, ArchiveWeather } from "@/lib/supabase/archive";

/** A compact vertical block (image on top, text below) - now embedded as Race Overview's own
 * right-hand column rather than its own full-width row, so it always renders narrow regardless
 * of viewport width; a side-by-side sm:flex layout would cramp/overflow at that width even on a
 * wide screen, since the column is narrow, not the viewport. */
export function CircuitCard({ circuit, weather, drawing = null }: { circuit: ArchiveCircuit; weather?: ArchiveWeather | null; drawing?: CircuitDrawing | null }) {
  const conditions = weather ? describeWeatherCode(weather.weatherCode) : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="overflow-hidden rounded-lg border border-white/[0.06] bg-white/[0.012] backdrop-blur-[2px]"
    >
      {(drawing || circuit.trackMap) && (
        <div className="p-3.5 pb-0">
          {/* This season's layout from the track library (the circuits pages' drawing); the Wikipedia map, which may
              not be the configuration this year raced on, only when the library has none. */}
          <CircuitThumb drawing={drawing} map={circuit.trackMap} name={circuit.name ?? "Circuit"} turns className="aspect-[3/2] w-full" />
        </div>
      )}
      <div className="p-3.5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-tertiary">Circuit</p>
            <p className="font-semibold text-primary">{circuit.name}</p>
          </div>
          {circuit.wikipediaUrl && (
            <a href={circuit.wikipediaUrl} target="_blank" rel="noreferrer" className="shrink-0 text-xs text-brand-text hover:underline">
              Wikipedia →
            </a>
          )}
        </div>

        {conditions && weather && (
          <div className="mt-2.5 flex items-center gap-3 border-t border-subtle pt-2.5">
            <span className="text-2xl" aria-hidden>
              {conditions.emoji}
            </span>
            <div className="text-sm">
              <p className="text-primary">{conditions.label}</p>
              <p className="text-tertiary">
                {Math.round(weather.tempMinC)}°–{Math.round(weather.tempMaxC)}°C
                {weather.precipitationMm > 0 ? ` · ${weather.precipitationMm.toFixed(1)}mm precip.` : ""}
              </p>
              <p className="mt-0.5 text-caption text-tertiary">Estimated from historical weather reanalysis, not a station reading.</p>
            </div>
          </div>
        )}

        <Link
          href={archiveCircuitHref(circuit.circuitId)}
          className="mt-2.5 flex items-center justify-center gap-1 rounded-lg border border-subtle bg-white/[0.03] px-3 py-2 text-xs font-medium text-secondary transition hover:border-white/20 hover:bg-white/[0.06] hover:text-primary"
        >
          Track History →
        </Link>
      </div>
    </motion.div>
  );
}
