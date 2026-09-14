"use client";

import { useEffect, useState } from "react";
import type { CircuitInsightsData } from "../services/circuits.service";

/**
 * Deterministic circuit records/trends (real computed stats, no LLM involved) plus the signed-in
 * user's own real history at this circuit - fetched fresh on every circuit selection, with the
 * same stale-response guard every other per-circuit fetch on this page already uses (a rapid
 * Baku -> Singapore -> Austin selection must never let Baku's slower response land after
 * Singapore's already has). Renders nothing while loading or on failure - this is a supplementary
 * panel, not blocking content, and an empty circuit's real absence of history is itself an honest
 * state (nothing to show), not an error to surface.
 */
export function CircuitInsights({ location, year }: { location: string; year: number }) {
  const [data, setData] = useState<CircuitInsightsData | null>(null);

  const key = `${location}:${year}`;
  const [prevKey, setPrevKey] = useState(key);
  if (prevKey !== key) {
    setPrevKey(key);
    setData(null);
  }

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/circuits/insights", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ location, year }),
          signal: controller.signal,
        });
        if (!res.ok) return;
        const body = (await res.json()) as { location?: string; data?: CircuitInsightsData };
        if (body.location !== location || !body.data) return;
        setData(body.data);
      } catch {
        // Aborted (a newer selection superseded this one) or a real network failure - either way,
        // this panel just stays absent rather than showing a stale or broken state.
      }
    })();
    return () => controller.abort();
  }, [location, year]);

  if (!data) return null;

  const { trackRecords, raceTrends, personalDrivers, personalTeams } = data;
  const hasRecords = !!(trackRecords.mostWins || trackRecords.mostPoles || trackRecords.closestMargin || trackRecords.largestMargin || raceTrends.poleToWinPct != null);
  const hasPersonal = personalDrivers.length > 0 || personalTeams.length > 0;
  if (!hasRecords && !hasPersonal) return null;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {hasRecords && (
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500">Circuit records</p>
          <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
            {trackRecords.mostWins && <Fact label="Most wins" value={`${trackRecords.mostWins.driver} (${trackRecords.mostWins.count})`} />}
            {trackRecords.mostPoles && <Fact label="Most poles" value={`${trackRecords.mostPoles.driver} (${trackRecords.mostPoles.count})`} />}
            {raceTrends.poleToWinPct != null && <Fact label="Pole → win" value={`${raceTrends.poleToWinPct.toFixed(0)}%`} />}
            {raceTrends.avgFieldMovement != null && <Fact label="Avg grid shift" value={`${raceTrends.avgFieldMovement.toFixed(1)} places`} />}
            {trackRecords.closestMargin && <Fact label="Closest finish" value={`${trackRecords.closestMargin.sec.toFixed(3)}s (${trackRecords.closestMargin.year})`} />}
            {trackRecords.largestMargin && <Fact label="Largest margin" value={`${trackRecords.largestMargin.sec.toFixed(1)}s (${trackRecords.largestMargin.year})`} />}
          </dl>
        </div>
      )}

      {hasPersonal && (
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500">Your history here</p>
          <div className="mt-2.5 flex flex-col gap-2">
            {personalDrivers.map((d) => (
              <p key={d.code} className="text-sm">
                <span className="font-medium text-white">{d.name}</span>
                <span className="text-neutral-500">
                  {" "}
                  · {d.races} race{d.races === 1 ? "" : "s"}
                  {d.wins > 0 && `, ${d.wins} win${d.wins === 1 ? "" : "s"}`}
                  {d.bestFinish != null && `, best P${d.bestFinish}`}
                </span>
              </p>
            ))}
            {personalTeams.map((t) => (
              <p key={t.name} className="text-sm">
                <span className="font-medium text-white">{t.name}</span>
                <span className="text-neutral-500">
                  {" "}
                  · {t.races} race{t.races === 1 ? "" : "s"}
                  {t.podiums > 0 && `, ${t.podiums} podium${t.podiums === 1 ? "" : "s"}`}
                  {t.wins > 0 && `, ${t.wins} win${t.wins === 1 ? "" : "s"}`}
                </span>
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dd className="truncate font-medium text-white">{value}</dd>
      <dt className="text-[10px] text-neutral-500">{label}</dt>
    </div>
  );
}
