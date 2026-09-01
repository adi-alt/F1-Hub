import Image from "next/image";
import Link from "next/link";
import { describeWeatherCode } from "@/lib/weatherCodes";
import { archiveCircuitHref } from "@/lib/routes";
import type { ArchiveCircuit, ArchiveWeather } from "@/lib/supabase/archive";

// object-cover, not contain - fills the panel intentionally instead of a letterboxed image
// floating in empty margin; the trade-off is a wide track outline can crop at the edges, same as
// any cover-fit image. Sourced from Wikipedia's own lead image for this circuit, re-hosted in
// Supabase Storage - usually the actual track layout, sometimes just a locator photo (see
// pipeline/enrich_archive_circuits.py). Not necessarily the exact configuration a specific
// historical year raced on.
function CircuitImg({ circuit }: { circuit: ArchiveCircuit }) {
  return (
    <div className="relative h-36 w-full bg-black/30">
      <Image src={circuit.imageUrl!} alt={`${circuit.name ?? "Circuit"} layout`} fill className="object-cover" />
    </div>
  );
}

function CircuitInfoBlock({ circuit, weather }: { circuit: ArchiveCircuit; weather?: ArchiveWeather | null }) {
  const conditions = weather ? describeWeatherCode(weather.weatherCode) : null;
  return (
    <>
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
    </>
  );
}

/** Race Overview's own two pieces - CircuitImage pairs with Race Story's row, CircuitInfoCard
 * pairs with StatTiles' row, each row in the shared grid sized to its own tallest cell (see
 * ArchiveRaceDashboard's own comment). A single card spanning both rows would need CSS subgrid to
 * align its internal image/text split to the OTHER column's row boundary, or leave a dead gap
 * under the image once Race Story (almost always taller than a 144px image) sets row 1's height -
 * two cards sidesteps both problems. */
export function CircuitImage({ circuit }: { circuit: ArchiveCircuit }) {
  if (!circuit.imageUrl) return null;
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--f1-line)]">
      <CircuitImg circuit={circuit} />
    </div>
  );
}

export function CircuitInfoCard({ circuit, weather }: { circuit: ArchiveCircuit; weather?: ArchiveWeather | null }) {
  return (
    <div className="surface-inset rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/60 p-4">
      <CircuitInfoBlock circuit={circuit} weather={weather} />
    </div>
  );
}

/** The combined, single-card presentation - used by the circuit's own standalone history page
 * (archive/page.tsx's ArchiveCircuitHistory), which isn't part of any Race-Overview row pairing
 * and just wants one cohesive circuit card. */
export function CircuitCard({ circuit, weather }: { circuit: ArchiveCircuit; weather?: ArchiveWeather | null }) {
  return (
    <div className="surface-inset overflow-hidden rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/60">
      {circuit.imageUrl && <CircuitImg circuit={circuit} />}
      <div className="p-4">
        <CircuitInfoBlock circuit={circuit} weather={weather} />
      </div>
    </div>
  );
}
