"use client";

import { useCountdown } from "@/hooks/useCountdown";
import { parseUtcDateTime } from "@/lib/countdown";
import type { RaceSummary } from "@/app/season/_service/season.pure";

/** State B/C from the spec: the race at this circuit has not happened yet this season. Never a
 * "2026 Performance" section rendered empty - this replaces it outright, with what's genuinely
 * knowable about a race that hasn't run: when it is, what the forecast looks like if one exists,
 * and a pointer down to the real historical section rather than repeating it. */
export function UpcomingCircuitIntelligence({ race }: { race: RaceSummary }) {
  const targetMs = race.raceDate ? parseUtcDateTime(race.raceDate).getTime() : 0;
  const seconds = useCountdown(targetMs);
  const days = Math.floor(seconds / 86_400);

  return (
    <section aria-label="Upcoming race">
      <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
        {race.raceDate && (
          <div>
            <p className="text-3xl font-bold tabular text-primary">{days >= 1 ? days : "<1"}</p>
            <p className="text-caption text-tertiary">{days >= 1 ? `day${days === 1 ? "" : "s"} to go` : "starting soon"}</p>
          </div>
        )}
        {race.raceDate && (
          <div>
            <p className="text-caption text-secondary">Race date</p>
            <p className="mt-0.5 text-body-sm font-medium text-primary">
              {parseUtcDateTime(race.raceDate).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </p>
          </div>
        )}
        {race.forecast && (
          <div>
            <p className="text-caption text-secondary">Forecast</p>
            <p className="mt-0.5 text-body-sm font-medium text-primary">
              {Math.round(race.forecast.airTempC)}°C · {Math.round(race.forecast.rainProbability * 100)}% rain chance
            </p>
            {race.forecast.source !== "openweathermap" && <p className="text-caption text-tertiary">Based on historical conditions, no live forecast yet</p>}
          </div>
        )}
      </div>

      <p className="mt-4 max-w-2xl text-body-sm leading-relaxed text-secondary">
        The race weekend hasn&apos;t started yet, so there&apos;s no result to show. Track characteristics and this circuit&apos;s full history are below.
      </p>
    </section>
  );
}
