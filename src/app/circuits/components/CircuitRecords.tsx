import Image from "next/image";
import { computeRaceTrends, computeTrackRecords, joinNames, type CircuitYearRecord } from "@/lib/circuitIntelligence";
import type { WinnerMedia } from "../services/circuits.service";

type Row = { label: string; value: string; detail?: string; photo?: string | null };

/** The circuit's records as a rail of rows with real faces, the way the home page's track intelligence reads: who
 * has won here most, who took most poles, who won here last, and the patterns. A record is left out when the history
 * doesn't have it. */
export function CircuitRecords({ timeline, winnerMedia }: { timeline: CircuitYearRecord[]; winnerMedia: Map<number, WinnerMedia> }) {
  const records = computeTrackRecords(timeline);
  const trends = computeRaceTrends(timeline);
  const photoOf = new Map<string, string>();
  for (const t of timeline) {
    const url = winnerMedia.get(t.year)?.photoUrl;
    if (t.winnerDriver && url && !photoOf.has(t.winnerDriver)) photoOf.set(t.winnerDriver, url);
  }
  const latest = timeline.find((t) => t.winnerDriver);
  const rows = ([
    latest && { label: `Won here in ${latest.year}`, value: latest.winnerDriver as string, detail: latest.winnerTeam ?? undefined, photo: photoOf.get(latest.winnerDriver as string) ?? null },
    records.mostWins && { label: "Most wins", value: joinNames(records.mostWins.drivers), detail: `${records.mostWins.count} wins`, photo: photoOf.get(records.mostWins.drivers[0]) ?? null },
    records.mostPoles && { label: "Most poles", value: joinNames(records.mostPoles.drivers), detail: `${records.mostPoles.count} poles`, photo: photoOf.get(records.mostPoles.drivers[0]) ?? null },
    trends.poleToWinPct != null && { label: "Won from pole", value: `${Math.round(trends.poleToWinPct)}%`, detail: "of races with a known pole" },
    records.closestMargin && { label: "Closest finish", value: `${records.closestMargin.sec.toFixed(3)}s`, detail: String(records.closestMargin.year) },
    trends.avgFieldMovement != null && { label: "Places gained or lost", value: trends.avgFieldMovement.toFixed(1), detail: "per driver, on average" },
  ] as (Row | false | null | undefined)[]).filter((r): r is Row => !!r);
  if (rows.length === 0) return null;
  const years = timeline.map((t) => t.year);
  return (
    <div>
      <ul className="grid grid-cols-1 gap-x-10 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) =>
          r.photo !== undefined ? (
            // A person: their face, the record, the count.
            <li key={r.label} className="flex items-center gap-3 border-t border-subtle py-4">
              {r.photo ? (
                <Image src={r.photo} alt="" width={36} height={36} className="size-9 shrink-0 rounded-full bg-white/[0.06] object-cover object-top" />
              ) : (
                <span aria-hidden className="size-9 shrink-0 rounded-full bg-white/[0.06]" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-caption text-secondary">{r.label}</p>
                <p className="truncate text-body-sm font-semibold text-primary" title={r.value}>
                  {r.value}
                </p>
              </div>
              {r.detail && <p className="shrink-0 text-right text-caption text-secondary">{r.detail}</p>}
            </li>
          ) : (
            // A figure: what it is, and the number on the right.
            <li key={r.label} className="flex items-center justify-between gap-3 border-t border-subtle py-4">
              <div className="min-w-0">
                <p className="text-body-sm text-primary">{r.label}</p>
                {r.detail && <p className="text-caption text-secondary">{r.detail}</p>}
              </div>
              <p className="shrink-0 text-title-md font-semibold tabular text-primary">{r.value}</p>
            </li>
          ),
        )}
      </ul>
      <p className="mt-4 text-caption text-tertiary">
        {timeline.length} classified races, {Math.min(...years)}–{Math.max(...years)} · Official results
      </p>
    </div>
  );
}
