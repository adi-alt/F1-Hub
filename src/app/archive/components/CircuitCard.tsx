import Image from "next/image";
import { describeWeatherCode } from "@/lib/weatherCodes";
import type { ArchiveCircuit, ArchiveWeather } from "@/lib/firestore/archive";

export function CircuitCard({ circuit, weather }: { circuit: ArchiveCircuit; weather?: ArchiveWeather | null }) {
  const conditions = weather ? describeWeatherCode(weather.weatherCode) : null;

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)] sm:flex">
      {circuit.imageUrl && (
        <div className="relative h-48 w-full shrink-0 bg-black/30 sm:h-auto sm:w-56">
          {/* Sourced from Wikipedia's own lead image for this circuit — usually the actual track
              layout, sometimes just a locator photo (see pipeline/enrich_archive_circuits.py).
              Not necessarily the exact configuration this specific historical year raced on. */}
          <Image
            src={circuit.imageUrl}
            alt={`${circuit.name ?? "Circuit"} layout`}
            fill
            unoptimized
            className="object-contain p-3"
          />
        </div>
      )}
      <div className="flex-1 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-neutral-500">Circuit</p>
            <p className="font-semibold text-white">{circuit.name}</p>
          </div>
          {circuit.wikipediaUrl && (
            <a
              href={circuit.wikipediaUrl}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 text-xs text-[var(--f1-red)] hover:underline"
            >
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
              <p className="mt-0.5 text-[11px] text-neutral-600">
                Estimated from historical weather reanalysis, not a station reading.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
