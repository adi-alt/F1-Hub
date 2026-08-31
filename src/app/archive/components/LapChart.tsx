"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { chart, tooltipStyle } from "@/components/charts/chartTheme";
import { useArchiveLaps } from "../_hooks/useArchiveLaps";
import type { ArchiveResultEntry } from "@/lib/supabase/archive";

// The shared chartTheme only defines a couple of data colors (built for single/dual-series
// charts like CircuitTrendChart) — a full grid's worth of drivers needs one distinct color each,
// so this generates an evenly-spaced hue rotation instead of trying to stretch a 2-color palette
// across ~20 lines.
function driverColor(index: number, total: number): string {
  const hue = Math.round((index * 360) / Math.max(total, 1));
  return `hsl(${hue}, 65%, 60%)`;
}

export function LapChart({
  year,
  round,
  results,
}: {
  year: number;
  round: number;
  results: ArchiveResultEntry[];
}) {
  const [shown, setShown] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [locked, setLocked] = useState<string | null>(null);
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
    // Order by final race position so the legend/line-color order matches the results table.
    return results.filter((r) => ids.has(r.driverId)).map((r) => r.driverId);
  }, [laps, results]);

  const chartData = useMemo(
    () =>
      (laps ?? []).map((lap) => {
        const row: Record<string, number | null> & { lap: number } = { lap: lap.lap };
        for (const t of lap.timings) row[t.driverId] = t.position;
        return row;
      }),
    [laps],
  );

  if (!shown) {
    return (
      <button
        onClick={() => setShown(true)}
        className="rounded-lg border border-[var(--f1-line)] px-4 py-2 text-sm text-neutral-300 transition hover:border-white/30 hover:text-white"
      >
        Show lap chart
      </button>
    );
  }

  if (isLoading) return <p className="text-sm text-neutral-500">Loading lap data…</p>;
  if (isError || chartData.length === 0) {
    return <p className="text-sm text-neutral-500">No lap data available for this race.</p>;
  }

  return (
    <div ref={rootRef}>
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
            {driverIds.map((driverId, i) => {
              const isHighlighted = highlighted === null || highlighted === driverId;
              return (
                <Line
                  key={driverId}
                  type="stepAfter"
                  dataKey={driverId}
                  name={nameFor(driverId)}
                  stroke={driverColor(i, driverIds.length)}
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
        {driverIds.map((driverId, i) => {
          const isActive = highlighted === driverId;
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
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: driverColor(i, driverIds.length) }} />
              {nameFor(driverId)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
