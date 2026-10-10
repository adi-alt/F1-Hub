import { computeRaceTrends, computeTrackRecords, joinNames, type CircuitYearRecord } from "@/lib/circuitIntelligence";

/** The circuit's records and patterns across every classified season on record, in one place (spec principle 3:
 * one container, hierarchy through type). Replaces the separate Track Intelligence block and records card, which
 * repeated each other. A record is left out when the history doesn't have it. */
export function CircuitRecords({ timeline }: { timeline: CircuitYearRecord[] }) {
  const records = computeTrackRecords(timeline);
  const trends = computeRaceTrends(timeline);
  const years = timeline.map((t) => t.year);
  const facts = [
    records.mostWins && { label: "Most wins", value: `${records.mostWins.count}`, detail: joinNames(records.mostWins.drivers) },
    records.mostPoles && { label: "Most poles", value: `${records.mostPoles.count}`, detail: joinNames(records.mostPoles.drivers) },
    trends.poleToWinPct != null && { label: "Won from pole", value: `${Math.round(trends.poleToWinPct)}%`, detail: "of races with a known pole" },
    records.closestMargin && { label: "Closest finish", value: `${records.closestMargin.sec.toFixed(3)}s`, detail: String(records.closestMargin.year) },
    records.largestMargin && { label: "Largest margin", value: `${records.largestMargin.sec.toFixed(1)}s`, detail: String(records.largestMargin.year) },
    trends.avgFieldMovement != null && { label: "Places gained or lost", value: trends.avgFieldMovement.toFixed(1), detail: "per driver, on average" },
  ].filter((f): f is { label: string; value: string; detail: string } => !!f);
  if (facts.length === 0) return null;
  return (
    <div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-3">
        {facts.map((f) => (
          <div key={f.label} className="min-w-0">
            <dt className="text-caption text-secondary">{f.label}</dt>
            <dd className="mt-1 text-title-md font-semibold tabular text-primary">{f.value}</dd>
            <dd className="mt-0.5 truncate text-caption text-secondary" title={f.detail}>
              {f.detail}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-6 text-caption text-tertiary">
        {timeline.length} classified races, {Math.min(...years)}–{Math.max(...years)} · Official results
      </p>
    </div>
  );
}
