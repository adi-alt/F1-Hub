import Image from "next/image";
import Link from "next/link";
import { circuitHref } from "@/lib/routes";
import type { SessionWeather } from "@/lib/types/race";

type CircuitImage = { url: string; wikipediaUrl: string | null } | null | undefined;

/** Split into two independent cards (image, info) instead of one box spanning both Race Overview
 * rows - SeasonCircuitImage pairs with Race Story's row, SeasonConditionsCard pairs with
 * StatTiles' row, each row in the shared grid sized to its own tallest cell (see
 * SeasonRaceDashboard's own comment, and Archive's CircuitCard.tsx for the same split there).
 * `image` is optional and real, not fabricated - the live `races` table has no circuit_id to join
 * on, so `race/page.tsx` resolves it via an exact locality+country match against the archive's own
 * circuit list (findArchiveCircuitByLocation) and passes through whatever it finds; absent
 * entirely for a venue the archive hasn't reached yet, never a guessed image. */
export function SeasonCircuitImage({ image }: { image: CircuitImage }) {
  if (!image) return null;
  return (
    <div className="relative h-36 w-full overflow-hidden rounded-xl border border-[var(--f1-line)] bg-black/30">
      {/* object-cover, not contain - fills the panel intentionally instead of a letterboxed image
          floating in empty margin; the trade-off is a wide track outline can crop at the edges,
          same as any cover-fit image. */}
      <Image src={image.url} alt="Circuit layout" fill className="object-cover" />
    </div>
  );
}

/** SessionWeather is a single race-day reading (air/track temp, humidity, a rain flag), not
 * Archive's min/max/precipitation-mm reanalysis shape - so this reads "Air 24°C · Track 31°C",
 * not a range. */
export function SeasonConditionsCard({
  circuit,
  country,
  weather,
  image,
}: {
  circuit: string;
  country?: string;
  weather?: SessionWeather;
  image?: CircuitImage;
}) {
  return (
    <div className="surface-inset rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-neutral-500">Circuit</p>
          <p className="font-semibold text-white">
            {circuit}
            {country && <span className="font-normal text-neutral-500"> · {country}</span>}
          </p>
        </div>
        {image?.wikipediaUrl && (
          <a href={image.wikipediaUrl} target="_blank" rel="noreferrer" className="shrink-0 text-xs text-[var(--f1-red)] hover:underline">
            Wikipedia →
          </a>
        )}
      </div>

      {weather && (
        <div className="mt-3 flex items-center gap-3 border-t border-[var(--f1-line)] pt-3">
          <span className="text-2xl" aria-hidden>
            {weather.rainfall ? "🌧️" : "☀️"}
          </span>
          <div className="text-sm">
            <p className="text-neutral-200">{weather.rainfall ? "Rain" : "Clear"}</p>
            <p className="text-neutral-500">
              Air {Math.round(weather.airTempC)}°C · Track {Math.round(weather.trackTempC)}°C · {Math.round(weather.humidityPct)}% humidity
            </p>
          </div>
        </div>
      )}

      <Link
        href={circuitHref(circuit)}
        className="mt-3 flex items-center justify-center gap-1 rounded-lg border border-[var(--f1-line)] bg-white/[0.03] px-3 py-2 text-xs font-medium text-neutral-300 transition hover:border-white/20 hover:bg-white/[0.06] hover:text-white"
      >
        Track History →
      </Link>
    </div>
  );
}
