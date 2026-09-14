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
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
        {race.state === "next" ? "Next race" : "Upcoming"}
      </p>
      <div aria-hidden className="mt-2 h-px w-full bg-gradient-to-r from-white/[0.09] to-transparent" />

      <div className="mt-4 flex flex-wrap items-end gap-x-8 gap-y-3">
        {race.raceDate && (
          <div>
            <p className="font-mono text-3xl font-bold tabular-nums text-white">{days >= 1 ? days : "<1"}</p>
            <p className="text-xs text-neutral-500">{days >= 1 ? `day${days === 1 ? "" : "s"} to go` : "starting soon"}</p>
          </div>
        )}
        {race.raceDate && (
          <div>
            <p className="text-[10px] uppercase tracking-[0.12em] text-neutral-600">Race date</p>
            <p className="mt-0.5 text-sm font-medium text-neutral-200">
              {parseUtcDateTime(race.raceDate).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </p>
          </div>
        )}
        {race.forecast && (
          <div>
            <p className="text-[10px] uppercase tracking-[0.12em] text-neutral-600">Forecast</p>
            <p className="mt-0.5 text-sm font-medium text-neutral-200">
              {Math.round(race.forecast.airTempC)}°C · {Math.round(race.forecast.rainProbability * 100)}% rain chance
            </p>
            {race.forecast.source !== "openweathermap" && <p className="text-[10px] text-neutral-600">Based on historical conditions, no live forecast yet</p>}
          </div>
        )}
      </div>

      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-neutral-400">
        The race weekend hasn&apos;t started yet, so there&apos;s no result to show. Track characteristics and this circuit&apos;s full history are below.
      </p>
    </section>
  );
}
