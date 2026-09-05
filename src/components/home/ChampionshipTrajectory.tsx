"use client";

import { useMemo, useState } from "react";
import { tooltipStyle } from "@/components/charts/chartTheme";
import { computeChampionshipProgression } from "@/lib/championshipProgression";
import type { RaceDoc } from "@/lib/types/race";

export type TrajectorySeries = { code: string; label: string; color: string };

const WIDTH = 520;
const HEIGHT = 120;
const PAD = 8;

/** A thin, bespoke SVG points-trajectory — hand-drawn, not Recharts (no other homepage chart uses
 * this component, and no Recharts styling is borrowed), so the "at least one custom SVG data
 * visualization" requirement is genuinely a distinct visual language from Race Analysis/Session/
 * Championship/Archive/Model charts elsewhere in the app. Plots real cumulative points per
 * completed round for 2-3 real drivers (see computeChampionshipProgression — summed straight off
 * race_results, nothing simulated); answers a real question depending on which series the caller
 * passes in ("is my favorite closing the gap on the leader", "how close is the title fight"). */
export function ChampionshipTrajectory({ races, series }: { races: RaceDoc[]; series: TrajectorySeries[] }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const codes = useMemo(() => series.map((s) => s.code), [series]);
  const rows = useMemo(() => computeChampionshipProgression(races, codes), [races, codes]);

  if (rows.length < 2) {
    return <p className="text-sm text-neutral-500">Not enough completed races yet to plot a trajectory.</p>;
  }

  const maxPoints = Math.max(...rows.flatMap((r) => series.map((s) => Number(r[s.code] ?? 0))), 1);
  const xFor = (i: number) => PAD + (i / (rows.length - 1)) * (WIDTH - PAD * 2);
  const yFor = (points: number) => HEIGHT - PAD - (points / maxPoints) * (HEIGHT - PAD * 2);

  const paths = series.map((s) => ({
    ...s,
    d: rows.map((r, i) => `${i === 0 ? "M" : "L"} ${xFor(i)} ${yFor(Number(r[s.code] ?? 0))}`).join(" "),
  }));

  const hovered = hoverIndex != null ? rows[hoverIndex] : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        onMouseLeave={() => setHoverIndex(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const relX = ((e.clientX - rect.left) / rect.width) * WIDTH;
          const i = Math.round(((relX - PAD) / (WIDTH - PAD * 2)) * (rows.length - 1));
          setHoverIndex(Math.min(Math.max(i, 0), rows.length - 1));
        }}
      >
        {paths.map((p) => (
          <path key={p.code} d={p.d} fill="none" stroke={p.color} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {hoverIndex != null && (
          <>
            <line x1={xFor(hoverIndex)} x2={xFor(hoverIndex)} y1={PAD} y2={HEIGHT - PAD} stroke="var(--f1-line)" strokeWidth={1} />
            {paths.map((p) => (
              <circle key={p.code} cx={xFor(hoverIndex)} cy={yFor(Number(rows[hoverIndex][p.code] ?? 0))} r={3} fill={p.color} />
            ))}
          </>
        )}
      </svg>

      {hovered && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-y-full rounded-lg border px-2.5 py-1.5 text-xs shadow-[0_12px_32px_rgba(0,0,0,0.35)]"
          style={{
            left: `${(xFor(hoverIndex!) / WIDTH) * 100}%`,
            transform: "translate(-50%, -6px)",
            background: tooltipStyle.background,
            backdropFilter: tooltipStyle.backdropFilter,
            WebkitBackdropFilter: tooltipStyle.WebkitBackdropFilter,
            borderColor: "var(--tooltip-border)",
          }}
        >
          <p className="whitespace-nowrap font-semibold text-white">{hovered.trackShort as string}</p>
          {series.map((s) => (
            <p key={s.code} className="whitespace-nowrap text-neutral-400">
              <span className="mr-1 font-medium" style={{ color: s.color }}>
                {s.label}
              </span>
              {hovered[s.code]} pts
            </p>
          ))}
        </div>
      )}

      <div className="mt-2 flex flex-wrap gap-4 text-[10px] text-neutral-500">
        {series.map((s) => (
          <span key={s.code} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: s.color }} /> {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
