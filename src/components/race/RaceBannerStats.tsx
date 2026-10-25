import { CloudRain, Sun } from "lucide-react";
import { Icon } from "@/components/ui/Icon";
import { formatLapTime } from "@/lib/format";
import type { RaceHighlights } from "@/lib/highlights";
import type { WeatherForecast } from "@/lib/supabase/calendar";
import type { RaceDoc } from "@/lib/types/race";

type Stat = { label: string; value: React.ReactNode; detail?: string };

/**
 * The race in a handful of figures, along the bottom of the race banner: pole, fastest lap, biggest climb,
 * retirements and the conditions after the race. Each figure appears only when it is real, and the strip is not
 * rendered at all when none is. Before the race the forecast sits beside the countdown instead (RaceForecastChips).
 */
export function RaceBannerStats({ race, highlights }: { race: RaceDoc; highlights: RaceHighlights | null }) {
  const names = new Map([...(race.inputs ?? []), ...(race.results ?? [])].map((d) => [d.driver, d.driverName]));
  const nameOf = (code: string) => names.get(code) ?? code;
  const completed = race.status === "completed" && !!race.results;
  const w = race.weather;

  const stats: Stat[] = [];
  if (completed && highlights) {
    if (highlights.poleSitter) stats.push({ label: "Pole", value: nameOf(highlights.poleSitter) });
    if (highlights.fastestLap) stats.push({ label: "Fastest lap", value: nameOf(highlights.fastestLap.driver), detail: formatLapTime(highlights.fastestLap.timeSec) });
    if (highlights.biggestGainer) stats.push({ label: "Biggest climb", value: nameOf(highlights.biggestGainer.driver), detail: `+${highlights.biggestGainer.positionsGained} places` });
    stats.push({ label: "Retirements", value: String(highlights.dnfs.length) });
  }
  if (w) {
    stats.push({
      label: "Conditions",
      value: (
        <span className="inline-flex items-center gap-1.5">
          <Icon icon={w.rainfall ? CloudRain : Sun} size={16} className="text-secondary" />
          {Math.round(w.airTempC)}°C{w.rainfall ? " · Rain" : " · Dry"}
        </span>
      ),
      detail: `Track ${Math.round(w.trackTempC)}°C · Humidity ${Math.round(w.humidityPct)}%`,
    });
  }
  if (stats.length === 0) return null;

  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-5">
      {stats.map((s) => (
        <div key={s.label} className="min-w-0">
          <dt className="text-caption text-secondary">{s.label}</dt>
          <dd className="mt-1 truncate text-body-sm font-medium tabular text-primary">{s.value}</dd>
          {s.detail && <dd className="mt-0.5 truncate text-caption tabular text-secondary">{s.detail}</dd>}
        </div>
      ))}
    </dl>
  );
}

const CHIP = "inline-flex h-7 items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 text-caption tabular text-secondary";

/** Race-day weather as a compact chip row, under the countdown in the race header (before the race only). */
export function RaceForecastChips({ forecast, className }: { forecast: WeatherForecast; className?: string }) {
  const wet = forecast.rainProbability >= 0.4;
  return (
    <div className={`flex flex-wrap items-center gap-2 lg:justify-end ${className ?? ""}`}>
      <span className="text-caption text-tertiary">{forecast.source === "openweathermap" ? "Race-day forecast" : "Typical weather"}</span>
      <span className={CHIP}>
        <Icon icon={wet ? CloudRain : Sun} size={16} className="text-secondary" />
        <span className="text-primary">{Math.round(forecast.airTempC)}°C</span>
      </span>
      <span className={CHIP}>{Math.round(forecast.rainProbability * 100)}% chance of rain</span>
    </div>
  );
}
