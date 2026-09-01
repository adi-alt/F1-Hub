"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { chart, tooltipStyle } from "@/components/charts/chartTheme";
import { EntityMultiSelect, type MultiSelectOption } from "@/app/season/_components/EntityMultiSelect";
import { QuietTabs } from "@/app/season/_components/QuietTabs";
import { useArchiveLaps } from "../_hooks/useArchiveLaps";
import type { ArchiveLapEntry, ArchiveResultEntry } from "@/lib/supabase/archive";

type DriverSet = "top5" | "top10" | "all" | "custom";

// The shared chartTheme only defines a couple of data colors (built for single/dual-series
// charts like CircuitTrendChart) — a full grid's worth of drivers needs one distinct color each,
// so this generates an evenly-spaced hue rotation instead of trying to stretch a 2-color palette
// across ~20 lines.
function driverColor(index: number, total: number): string {
  const hue = Math.round((index * 360) / Math.max(total, 1));
  return `hsl(${hue}, 65%, 60%)`;
}

type Moment = { lap: number; text: string };

/** Every lead change (the P1 driver changing lap over lap - unambiguous) plus the single biggest
 * one-lap position gain across the whole field - genuinely derivable from real lap-by-lap position
 * data, nothing invented. Capped so this stays a handful of real highlights, not a lap-by-lap
 * transcript. */
function computeMoments(laps: ArchiveLapEntry[], nameFor: (id: string) => string): Moment[] {
  const moments: Moment[] = [];
  let prevLeader: string | null = null;
  let biggestGain: { lap: number; driverId: string; gained: number } | null = null;
  let prevPositions = new Map<string, number>();

  for (const entry of laps) {
    const leader = entry.timings.find((t) => t.position === 1)?.driverId ?? null;
    if (leader && prevLeader && leader !== prevLeader) {
      moments.push({ lap: entry.lap, text: `${nameFor(leader)} took the lead.` });
    }
    if (leader) prevLeader = leader;

    for (const t of entry.timings) {
      if (t.position === null) continue;
      const prev = prevPositions.get(t.driverId);
      if (prev !== undefined) {
        const gained = prev - t.position;
        if (gained > 0 && (!biggestGain || gained > biggestGain.gained)) {
          biggestGain = { lap: entry.lap, driverId: t.driverId, gained };
        }
      }
    }
    prevPositions = new Map(entry.timings.filter((t) => t.position !== null).map((t) => [t.driverId, t.position!]));
  }

  if (biggestGain && biggestGain.gained >= 2) {
    moments.push({ lap: biggestGain.lap, text: `${nameFor(biggestGain.driverId)} gained ${biggestGain.gained} places in a single lap.` });
  }

  return moments.sort((a, b) => a.lap - b.lap).slice(0, 6);
}

export function LapChart({
  year,
  round,
  results,
  shown,
}: {
  year: number;
  round: number;
  results: ArchiveResultEntry[];
  // Lifted to the parent (ArchiveRaceDashboard) so the collapsed state can render as a single
  // compact row (with its own "Show chart" button) instead of a full-height card wrapping just a
  // button - see the dashboard's own comment on why. LapChart renders nothing at all until then.
  shown: boolean;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [locked, setLocked] = useState<string | null>(null);
  const [driverSet, setDriverSet] = useState<DriverSet>("top5");
  const [customIds, setCustomIds] = useState<string[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);
  const { data: laps, isLoading, isError } = useArchiveLaps(year, round, shown);

  // Click anywhere outside the chart/legend clears a locked driver - the same click-outside shape
  // EntityMultiSelect's own dropdown already uses.
  useEffect(() => {
    if (!locked) return;
    function onPointerDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setLocked(null);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [locked]);

  const nameFor = (driverId: string) => results.find((r) => r.driverId === driverId)?.driverName ?? driverId;
  const highlighted = locked ?? hovered;

  const driverIds = useMemo(() => {
    const ids = new Set<string>();
    for (const lap of laps ?? []) for (const t of lap.timings) ids.add(t.driverId);
    // Order by real final race position (not however `results` happened to arrive) so the
    // legend/line-color order - and the Top 5/Top 10 slice below - matches the results table.
    return [...results]
      .filter((r) => ids.has(r.driverId))
      .sort((a, b) => a.position - b.position)
      .map((r) => r.driverId);
  }, [laps, results]);

  // A full grid's worth of lines by default is the exact "too many lines, too many colours"
  // problem the redesign flagged - Top 5 (the sensible default) keeps the chart readable; hover/
  // click-lock still work within whichever set is currently visible.
  const visibleDriverIds = useMemo(() => {
    if (driverSet === "all") return driverIds;
    if (driverSet === "custom") return driverIds.filter((id) => customIds.includes(id));
    return driverIds.slice(0, driverSet === "top5" ? 5 : 10);
  }, [driverIds, driverSet, customIds]);

  const chartData = useMemo(
    () =>
      (laps ?? []).map((lap) => {
        const row: Record<string, number | null> & { lap: number } = { lap: lap.lap };
        for (const t of lap.timings) row[t.driverId] = t.position;
        return row;
      }),
    [laps],
  );

  const moments = useMemo(() => (laps ? computeMoments(laps, nameFor) : []), [laps]); // eslint-disable-line react-hooks/exhaustive-deps -- nameFor is derived from the same `results` prop each render, not its own changing input

  if (!shown) return null; // the collapsed row itself is rendered by the parent now

  if (isLoading) return <p className="text-sm text-neutral-500">Loading lap data…</p>;
  if (isError || chartData.length === 0) {
    return <p className="text-sm text-neutral-500">No lap data available for this race.</p>;
  }

  const multiSelectOptions: MultiSelectOption[] = driverIds.map((id, i) => ({
    code: id,
    label: nameFor(id),
    color: driverColor(i, driverIds.length),
  }));

  return (
    <div ref={rootRef}>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <QuietTabs
          options={[
            { value: "top5" as const, label: "Top 5" },
            { value: "top10" as const, label: "Top 10" },
            { value: "all" as const, label: "All drivers" },
            { value: "custom" as const, label: "Custom" },
          ]}
          value={driverSet}
          onChange={setDriverSet}
          className="text-xs"
        />
        {driverSet === "custom" && (
          <EntityMultiSelect options={multiSelectOptions} selected={customIds} onChange={setCustomIds} placeholder="Select drivers" />
        )}
      </div>
      {/* A driver's default state is deliberately quiet (every line the same modest weight) -
          hovering (or clicking, to lock it while the mouse moves to the chart itself) picks one
          out and fades the rest, rather than ~20 equally-loud lines competing for attention. */}
      <motion.div initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.3, ease: "easeOut" }}>
        <ResponsiveContainer width="100%" height={420}>
          <LineChart data={chartData} margin={{ left: 8, right: 16, top: 8 }}>
            <CartesianGrid stroke={chart.gridline} vertical={false} />
            <XAxis
              dataKey="lap"
              tick={{ fill: chart.mutedInk, fontSize: 12 }}
              axisLine={{ stroke: chart.gridline }}
              tickLine={false}
              label={{ value: "Lap", position: "insideBottom", offset: -4, fill: chart.mutedInk, fontSize: 12 }}
            />
            <YAxis
              reversed
              allowDecimals={false}
              tick={{ fill: chart.mutedInk, fontSize: 12 }}
              axisLine={{ stroke: chart.gridline }}
              tickLine={false}
              width={32}
              label={{ value: "Position", angle: -90, position: "insideLeft", fill: chart.mutedInk, fontSize: 12 }}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              labelFormatter={(lap) => `Lap ${lap}`}
              formatter={(value, name) => [`P${value}`, nameFor(String(name))]}
            />
            {visibleDriverIds.map((driverId) => {
              const isHighlighted = highlighted === null || highlighted === driverId;
              // Color is keyed off the full grid's index, not the visible subset's - so a
              // driver's line color stays the same one when switching Top 5 -> All, not reshuffled.
              const colorIndex = driverIds.indexOf(driverId);
              return (
                <Line
                  key={driverId}
                  type="stepAfter"
                  dataKey={driverId}
                  name={nameFor(driverId)}
                  stroke={driverColor(colorIndex, driverIds.length)}
                  strokeWidth={highlighted === driverId ? 2.5 : 1.5}
                  strokeOpacity={isHighlighted ? 1 : 0.15}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </motion.div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {visibleDriverIds.map((driverId) => {
          const isActive = highlighted === driverId;
          const colorIndex = driverIds.indexOf(driverId);
          return (
            <button
              key={driverId}
              type="button"
              onMouseEnter={() => setHovered(driverId)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => setLocked((prev) => (prev === driverId ? null : driverId))}
              className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition ${
                isActive ? "border-white/25 bg-white/[0.06] text-white" : "border-transparent text-neutral-400 hover:text-white"
              }`}
            >
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: driverColor(colorIndex, driverIds.length) }} />
              {nameFor(driverId)}
            </button>
          );
        })}
      </div>

      {moments.length > 0 && (
        <div className="mt-6 border-t border-white/10 pt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">Key race moments</p>
          <ul className="space-y-1.5">
            {moments.map((m, i) => (
              <li key={i} className="flex gap-2 text-sm text-neutral-300">
                <span className="w-12 shrink-0 font-mono text-xs text-neutral-500">Lap {m.lap}</span>
                {m.text}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
