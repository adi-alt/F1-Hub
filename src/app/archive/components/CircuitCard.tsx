import Image from "next/image";
import Link from "next/link";
import { describeWeatherCode } from "@/lib/weatherCodes";
import { archiveCircuitHref } from "@/lib/routes";
import type { ArchiveCircuit, ArchiveWeather } from "@/lib/supabase/archive";

/** A compact vertical block (image on top, text below) - now embedded as Race Overview's own
 * right-hand column rather than its own full-width row, so it always renders narrow regardless
 * of viewport width; a side-by-side sm:flex layout would cramp/overflow at that width even on a
 * wide screen, since the column is narrow, not the viewport. */
export function CircuitCard({ circuit, weather }: { circuit: ArchiveCircuit; weather?: ArchiveWeather | null }) {
  const conditions = weather ? describeWeatherCode(weather.weatherCode) : null;

  return (
    <div className="surface-inset overflow-hidden rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/60">
      {circuit.imageUrl && (
        <div className="relative h-32 w-full bg-black/30">
          {/* Sourced from Wikipedia's own lead image for this circuit, re-hosted in Supabase
              Storage — usually the actual track layout, sometimes just a locator photo (see
              pipeline/enrich_archive_circuits.py). Not necessarily the exact configuration this
              specific historical year raced on. */}
          <Image src={circuit.imageUrl} alt={`${circuit.name ?? "Circuit"} layout`} fill className="object-contain p-2" />
        </div>
      )}
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-neutral-500">Circuit</p>
            <p className="font-semibold text-white">{circuit.name}</p>
          </div>
          {circuit.wikipediaUrl && (
            <a href={circuit.wikipediaUrl} target="_blank" rel="noreferrer" className="shrink-0 text-xs text-[var(--f1-red)] hover:underline">
              Wikipedia →
            </a>
          )}
        </div>

        {conditions && weather && (
          <div className="mt-3 flex items-center gap-3 border-t border-[var(--f1-line)] pt-3">
            <span className="text-2xl" aria-hidden>
              {conditions.emoji}
            </span>
            <div className="text-sm">
              <p className="text-neutral-200">{conditions.label}</p>
              <p className="text-neutral-500">
                {Math.round(weather.tempMinC)}°–{Math.round(weather.tempMaxC)}°C
                {weather.precipitationMm > 0 ? ` · ${weather.precipitationMm.toFixed(1)}mm precip.` : ""}
              </p>
              <p className="mt-0.5 text-[11px] text-neutral-600">Estimated from historical weather reanalysis, not a station reading.</p>
            </div>
          </div>
        )}

        <Link
          href={archiveCircuitHref(circuit.circuitId)}
          className="mt-3 flex items-center justify-center gap-1 rounded-lg border border-[var(--f1-line)] bg-white/[0.03] px-3 py-2 text-xs font-medium text-neutral-300 transition hover:border-white/20 hover:bg-white/[0.06] hover:text-white"
        >
          Track History →
        </Link>
      </div>
    </div>
  );
}
