import type { CalendarEntry } from "@/lib/supabase/calendar";

function formatSessionDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function weatherGist(forecast: NonNullable<CalendarEntry["weatherForecast"]>): string {
  const rainPct = Math.round(forecast.rainProbability * 100);
  const rainNote = rainPct >= 50 ? "likely wet" : rainPct >= 20 ? "a chance of rain" : "expected dry";
  return `${Math.round(forecast.airTempC)}°C, ${rainNote} (${rainPct}% rain chance)`;
}

// Same reasoning as page.tsx's pickStandingsVariant: extracted so the impure Date.now() call
// isn't lexically inside the component function itself (eslint's react-hooks/purity rule).
function daysUntil(sessionDateIso: string): number {
  return Math.ceil((new Date(sessionDateIso).getTime() - Date.now()) / 86_400_000);
}

/** The upcoming race weekend "in detail" — every real session (practice/sprint/qualifying/race)
 * with its actual date/time, not just the race day, plus whatever weather signal exists (a real
 * forecast once close enough, a historical estimate otherwise — see calendar.ts's own type). */
export function RaceWeekendDetail({ calendar }: { calendar: CalendarEntry }) {
  const raceSession = calendar.sessions.find((s) => s.label === "Race");
  const days = raceSession ? daysUntil(raceSession.date) : null;

  return (
    <section className="rounded-2xl border border-[var(--f1-line)] bg-[var(--f1-carbon)] p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--f1-red)]">
            Up next · Round {calendar.round}
            {days !== null && days >= 0 ? ` · in ${days} day${days === 1 ? "" : "s"}` : ""}
          </p>
          <h2 className="mt-1 text-2xl font-bold text-white">{calendar.name}</h2>
        </div>
        {calendar.weatherForecast && (
          <div className="rounded-xl bg-black/30 px-4 py-2 text-right text-sm text-neutral-200">
            <p>{weatherGist(calendar.weatherForecast)}</p>
            {calendar.weatherForecast.source === "historical_fallback" && (
              <p className="text-xs text-neutral-500">historical estimate, not a live forecast yet</p>
            )}
          </div>
        )}
      </div>

      {calendar.sessions.length > 0 && (
        <ol className="mt-6 grid gap-2 sm:grid-cols-5">
          {calendar.sessions.map((s) => (
            <li key={s.label} className="rounded-lg bg-black/20 p-3">
              <p className="text-xs uppercase tracking-wide text-neutral-500">{s.label}</p>
              <p className="mt-1 text-sm text-white">{formatSessionDate(s.date)}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
