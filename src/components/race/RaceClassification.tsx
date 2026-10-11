"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Timer } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { DriverIdentity } from "@/components/ui/DriverIdentity";
import { Icon } from "@/components/ui/Icon";
import { ProvenanceLine } from "@/components/ui/ProvenanceLine";
import { Table, type TableColumn } from "@/components/ui/Table";
import { formatLapTime } from "@/lib/format";
import type { RaceResultEntry, TireStint } from "@/lib/types/race";

/** Rows shown before "Show all": the points finishers. */
const INITIAL_ROWS = 10;

// Compound colours with a letter beside them, so the strip never depends on colour alone (spec §3.5, P14).
const COMPOUND: Record<string, { letter: string; color: string }> = {
  SOFT: { letter: "S", color: "#da291c" },
  MEDIUM: { letter: "M", color: "#ffd12e" },
  HARD: { letter: "H", color: "#f0f0ec" },
  INTERMEDIATE: { letter: "I", color: "#43b02a" },
  WET: { letter: "W", color: "#0067ad" },
};

type Row = RaceResultEntry & { fastest: boolean };

function gapLabel(r: RaceResultEntry): string {
  if (r.status === "dnf") return "DNF";
  if (r.finishPosition === 1) return "Leader";
  if (r.status === "lapped") return "Lapped";
  return r.finishGapSec !== null ? `+${r.finishGapSec.toFixed(3)}s` : "–";
}

/** Places gained (positive) or lost from the grid; null when there's no grid slot (a pit-lane start, a DNF). */
export function placesGained(r: RaceResultEntry): number | null {
  if (r.status === "dnf" || r.grid === null || r.grid === 0) return null;
  return r.grid - r.finishPosition;
}

function Gained({ value }: { value: number | null }) {
  if (value === null) return <span className="text-tertiary">–</span>;
  if (value === 0) return <span className="text-tertiary">0</span>;
  const up = value > 0;
  // The arrow and the sign carry the direction; colour only reinforces it.
  return (
    <span className={`inline-flex items-center justify-end gap-0.5 ${up ? "text-success" : "text-danger"}`}>
      <Icon icon={up ? ArrowUp : ArrowDown} size={16} />
      {up ? "+" : "−"}
      {Math.abs(value)}
      <span className="sr-only">{up ? " places gained" : " places lost"}</span>
    </span>
  );
}

function StintStrip({ stints }: { stints: TireStint[] }) {
  const total = stints.reduce((sum, s) => sum + s.lapCount, 0);
  if (total === 0) return null;
  return (
    <div>
      <p className="text-caption text-tertiary">Tyres</p>
      <div className="mt-1.5 flex h-5 w-full max-w-md gap-px overflow-hidden rounded-control" role="img" aria-label={stints.map((s) => `${s.compound.toLowerCase()} for ${s.lapCount} laps`).join(", then ")}>
        {stints.map((s) => {
          const c = COMPOUND[s.compound.toUpperCase()] ?? { letter: "?", color: "var(--text-tertiary)" };
          return (
            <span key={s.stintNumber} className="flex h-full min-w-5 items-center justify-center text-caption font-semibold text-black/80" style={{ width: `${(s.lapCount / total) * 100}%`, backgroundColor: c.color }}>
              {c.letter}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The race result, the first thing a finished race page shows (spec §3.1, §3.5): one table, top ten first,
 * with places gained as a signed number and arrow, the gap in tabular figures, the fastest lap marked, and a
 * row's tyre stints, grid slot and best lap on request. Where the classification came from sits under it.
 */
export function RaceClassification({ results, stints = [], preliminary, className }: { results: RaceResultEntry[]; stints?: TireStint[]; preliminary: boolean; className?: string }) {
  const [showAll, setShowAll] = useState(false);
  const fastestSec = Math.min(...results.map((r) => r.fastestLapSec ?? Infinity));
  const rows: Row[] = [...results].sort((a, b) => a.finishPosition - b.finishPosition).map((r) => ({ ...r, fastest: r.fastestLapSec !== null && r.fastestLapSec === fastestSec }));
  const visible = showAll ? rows : rows.slice(0, INITIAL_ROWS);
  const stintsByDriver = new Map<string, TireStint[]>();
  for (const s of stints) stintsByDriver.set(s.driver, [...(stintsByDriver.get(s.driver) ?? []), s].sort((a, b) => a.stintNumber - b.stintNumber));

  const columns: TableColumn<Row>[] = [
    { key: "finishPosition", header: "Pos", numeric: true, width: "3.5rem", render: (r) => (r.status === "dnf" ? <span className="text-tertiary">DNF</span> : r.finishPosition) },
    {
      key: "driver",
      header: "Driver",
      render: (r) => (
        <span className="flex min-w-0 items-center gap-2">
          <DriverIdentity code={r.driver} name={r.driverName} team={r.team} />
          {r.fastest && <Icon icon={Timer} size={16} label="Fastest lap" className="text-info" />}
        </span>
      ),
    },
    { key: "team", header: "Team", hideBelow: "md", render: (r) => <span className="text-secondary">{r.team}</span> },
    { key: "grid", header: "+/−", align: "end", numeric: true, render: (r) => <Gained value={placesGained(r)} /> },
    { key: "finishGapSec", header: "Gap", align: "end", numeric: true, render: (r) => <span className={r.finishPosition === 1 ? "text-primary" : "text-secondary"}>{gapLabel(r)}</span> },
    { key: "points", header: "Pts", align: "end", numeric: true, render: (r) => (r.points > 0 ? r.points : <span className="text-tertiary">0</span>) },
  ];

  return (
    <div className={className}>
      <Table
        caption="Race classification"
        columns={columns}
        rows={visible}
        getRowKey={(r) => r.driver}
        rowHeader="driver"
        stickyFirstColumn
        expandable
        renderExpanded={(r) => (
          <div className="grid gap-4 px-3 py-3 sm:grid-cols-[auto_auto_1fr] sm:gap-8">
            <div>
              <p className="text-caption text-tertiary">Grid to finish</p>
              <p className="mt-1 tabular text-primary">
                {r.grid ? `P${r.grid}` : "Pit lane"} → {r.status === "dnf" ? "DNF" : `P${r.finishPosition}`}
              </p>
            </div>
            <div>
              <p className="text-caption text-tertiary">Best lap</p>
              <p className="mt-1 tabular text-primary">{r.fastestLapSec !== null ? formatLapTime(r.fastestLapSec) : "–"}</p>
            </div>
            <StintStrip stints={stintsByDriver.get(r.driver) ?? []} />
          </div>
        )}
      />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <ProvenanceLine source={preliminary ? "Live timing (OpenF1)" : "Official classification"} status={preliminary ? "preliminary, can still change after the stewards' decisions" : undefined} />
        {rows.length > INITIAL_ROWS && (
          <Button variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)}>
            {showAll ? "Show top ten" : `Show all ${rows.length}`}
          </Button>
        )}
      </div>
    </div>
  );
}
