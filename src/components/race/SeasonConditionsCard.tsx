import type { SessionWeather } from "@/lib/types/race";

/** Season's own counterpart to Archive's CircuitCard.tsx - same "Circuit" label + weather-block
 * shape (matching its emoji-plus-label convention for genuine cross-page consistency, not a new
 * style), but genuinely thinner: no circuit image and no locality exist anywhere for current-season
 * races (no data, no safe join to Archive's own circuit table - see the plan's own note), and
 * SessionWeather is a single race-day reading (air/track temp, humidity, a rain flag), not
 * Archive's min/max/precipitation-mm reanalysis shape - so this reads "Air 24°C · Track 31°C",
 * not a temperature range. */
export function SeasonConditionsCard({ circuit, country, weather }: { circuit: string; country?: string; weather?: SessionWeather }) {
  return (
    <div className="surface-inset rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/60 p-4">
      <p className="text-xs uppercase tracking-wide text-neutral-500">Circuit</p>
      <p className="font-semibold text-white">
        {circuit}
        {country && <span className="font-normal text-neutral-500"> · {country}</span>}
      </p>

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
    </div>
  );
}
