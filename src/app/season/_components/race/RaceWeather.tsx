"use client";

import type { RaceSummary } from "../../_service/season.pure";

/**
 * Weather, matched to the state the weekend is actually in.
 *
 * A completed race shows what the conditions WERE; an upcoming one shows what is forecast. Showing
 * a forecast for a race that already ran is the specific failure this guards against — the data
 * for both exists side by side, and picking the wrong one reads as a bug even though every number
 * is real.
 *
 * Renders nothing when there is no authoritative reading. Weather is not invented here.
 */
export function RaceWeather({ race }: { race: RaceSummary }) {
  if (race.weekendStatus === "completed") {
    const w = race.raceWeather;
    if (!w) return null;
    return (
      <Section title="Race conditions">
        <Readings
          items={[
            { label: "Air", value: `${Math.round(w.airTempC)}°C` },
            { label: "Track", value: `${Math.round(w.trackTempC)}°C` },
            { label: "Humidity", value: `${Math.round(w.humidityPct)}%` },
            { label: "Rain", value: w.rainfall ? "Yes" : "Dry" },
          ]}
        />
      </Section>
    );
  }

  if (race.weekendStatus === "cancelled" || race.weekendStatus === "postponed") return null;

  const f = race.forecast;
  if (!f) return null;
  return (
    <Section title={race.weekendStatus === "live" ? "Weekend conditions" : "Weekend forecast"}>
      <Readings
        items={[
          { label: "Air", value: `${Math.round(f.airTempC)}°C` },
          { label: "Rain chance", value: `${Math.round(f.rainProbability * 100)}%` },
        ]}
      />
      <p className="mt-2 text-[11px] text-neutral-600">
        {/* Stated plainly rather than dressed up as a live forecast - the pipeline falls back to a
            historical average when a real forecast isn't yet available for the date. */}
        {f.source === "openweathermap" ? "Forecast snapshot taken ahead of the weekend." : "Based on historical conditions at this circuit — no live forecast available yet."}
      </p>
    </Section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-500">{title}</p>
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

function Readings({ items }: { items: { label: string; value: string }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-4">
      {items.map((item) => (
        <div key={item.label}>
          <dt className="text-[10px] uppercase tracking-[0.12em] text-neutral-600">{item.label}</dt>
          <dd className="mt-0.5 font-mono text-sm tabular-nums text-neutral-200">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
