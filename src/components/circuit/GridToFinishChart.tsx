"use client";

import { useMemo, useState } from "react";
import { teamColor } from "@/lib/teamColors";
import type { TireStint } from "@/lib/types/race";

// A custom SVG bump chart, not Recharts - a real, deliberate exception, not a second charting
// library creeping in. Recharts' own curve types (monotone/natural/basis) only bend a line that
// has three or more real data points to bend BETWEEN; a grid->finish series is exactly two real
// points (nothing happens "during" the race that this app has continuous data for - see
// TrackMap's own lap-interpolated replay for where real intermediate data exists instead), so
// asking Recharts for a "curve" here would mean either a dead-straight line (what shipped before)
// or fabricating a fake third point purely to bend it - exactly the "don't create misleading
// data" line this app holds everywhere else. A cubic bezier with control points at the horizontal
// midpoint is the standard, honest "bump chart" curve: it visually eases between two REAL values
// without asserting a third one ever existed.

type DriverMeta = { driver: string; driverName: string; team: string; grid: number; finish: number };

/** Only the fields this chart actually reads - both real callers pass a different result type
 * (TrackMap's full `RaceResultEntry`, CurrentSeasonPerformance's smaller `RaceResultSummary`),
 * and they already agree structurally on every field used here. */
type ResultLike = { driver: string; driverName: string; team: string; grid: number | null; finishPosition: number };

const WIDTH = 620;
const PAD_X = 46;
const PAD_Y = 20;
const ROW_H = 24; // vertical space per rank - tuned so a 20-driver field stays legible, not cramped

export function GridToFinishChart({
  results,
  hoverDriver: hoverDriverProp,
  onHoverDriver,
}: {
  results: ResultLike[];
  tireStints: TireStint[];
  /** Optional external control, e.g. from a parent syncing this chart's hover with the track
   * map's own driver dots - falls back to real internal state when the caller doesn't pass one,
   * so this component still works completely on its own. */
  hoverDriver?: string | null;
  onHoverDriver?: (driver: string | null) => void;
}) {
  const [internalHover, setInternalHover] = useState<string | null>(null);
  const hoverDriver = hoverDriverProp !== undefined ? hoverDriverProp : internalHover;
  const setHoverDriver = onHoverDriver ?? setInternalHover;

  const drivers = useMemo<DriverMeta[]>(() => {
    return results
      .filter((r) => r.grid != null && r.grid > 0 && r.finishPosition > 0)
      .map((r) => ({ driver: r.driver, driverName: r.driverName, team: r.team, grid: r.grid as number, finish: r.finishPosition }))
      .sort((a, b) => a.finish - b.finish);
  }, [results]);

  if (drivers.length === 0) {
    return <p className="text-sm text-neutral-500">No position data available for this race.</p>;
  }

  const maxRank = Math.max(...drivers.flatMap((d) => [d.grid, d.finish]));
  const height = PAD_Y * 2 + (maxRank - 1) * ROW_H;
  const xStart = PAD_X;
  const xEnd = WIDTH - PAD_X;
  const xMid = (xStart + xEnd) / 2;
  const yFor = (rank: number) => PAD_Y + (rank - 1) * ROW_H;

  const hovered = drivers.find((d) => d.driver === hoverDriver) ?? null;

  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
      {/* No overflow-x-auto/min-width here on purpose - the viewBox scales the whole chart down
          to fit any container width instead of forcing a horizontal scrollbar. Labels shrink
          proportionally rather than truncating or requiring a scroll to read. */}
      <svg viewBox={`0 0 ${WIDTH} ${height}`} className="h-auto w-full" role="img" aria-label="Grid to finish position change for every classified driver">
        <text x={xStart} y={8} textAnchor="middle" fontSize={10} fontWeight={600} fill="rgba(255,255,255,0.35)" letterSpacing="0.08em">
          GRID
        </text>
        <text x={xEnd} y={8} textAnchor="middle" fontSize={10} fontWeight={600} fill="rgba(255,255,255,0.35)" letterSpacing="0.08em">
          FINISH
        </text>
        <line x1={xStart} y1={PAD_Y - 8} x2={xStart} y2={height - PAD_Y + 8} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
        <line x1={xEnd} y1={PAD_Y - 8} x2={xEnd} y2={height - PAD_Y + 8} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />

        {drivers.map((d) => {
          const active = hoverDriver === d.driver;
          const dimmed = hoverDriver !== null && !active;
          const color = teamColor(d.team);
          const y1 = yFor(d.grid);
          const y2 = yFor(d.finish);
          const path = `M ${xStart} ${y1} C ${xMid} ${y1} ${xMid} ${y2} ${xEnd} ${y2}`;
          return (
            <g
              key={d.driver}
              opacity={dimmed ? 0.16 : 1}
              style={{ transition: "opacity 0.2s ease" }}
              className="cursor-pointer"
              onMouseEnter={() => setHoverDriver(d.driver)}
              onMouseLeave={() => setHoverDriver(null)}
            >
              {/* Wide invisible hit area - the visible stroke is thin, this makes the whole curve easy to hover. */}
              <path d={path} fill="none" stroke="transparent" strokeWidth={14} />
              <path d={path} fill="none" stroke={color} strokeWidth={active ? 3.5 : 2.25} strokeLinecap="round" />
              <circle cx={xStart} cy={y1} r={active ? 4 : 3} fill={color} />
              <circle cx={xEnd} cy={y2} r={active ? 4 : 3} fill={color} />
              <text x={xEnd + 8} y={y2} dominantBaseline="middle" fontSize={active ? 11 : 9.5} fontWeight={active ? 700 : 500} fill={active ? "white" : "rgba(255,255,255,0.4)"}>
                {d.driver}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="mt-2 flex min-h-[40px] items-center justify-center text-xs">
        {hovered ? (
          <div className="flex flex-col items-center gap-1">
            <span className="font-semibold text-white" style={{ color: teamColor(hovered.team) }}>
              {hovered.driverName}
            </span>
            <span className="text-neutral-300">
              Started P{hovered.grid}, finished P{hovered.finish}
              <span className={`ml-2 font-mono tabular-nums ${hovered.grid - hovered.finish > 0 ? "text-emerald-400" : hovered.grid - hovered.finish < 0 ? "text-red-400" : "text-neutral-500"}`}>
                {hovered.grid - hovered.finish > 0 ? `▲ +${hovered.grid - hovered.finish}` : hovered.grid - hovered.finish < 0 ? `▼ ${hovered.grid - hovered.finish}` : "—"}
              </span>
            </span>
          </div>
        ) : (
          <span className="text-[11px] text-neutral-600">Hover a curve for grid → finish detail</span>
        )}
      </div>
    </div>
  );
}
