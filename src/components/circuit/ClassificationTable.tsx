"use client";

import { useMemo, useState } from "react";
import { EntityAvatar } from "@/components/EntityAvatar";
import type { RaceResultEntry } from "@/lib/types/race";
import type { CurrentDriver, CurrentTeam } from "@/lib/supabase/media";

const HEADER_STYLE = { background: "var(--tooltip-surface-strong)" };

/**
 * This season's classification at the circuit - built on the same table structure and theme as
 * the Season page's own Championship table (sticky translucent header, EntityAvatar for a real
 * driver headshot and a real team logo instead of a plain color dot, top-3 rows in bold white),
 * not a bespoke look for this one page. Shares hover/selection with the track map and the
 * grid->finish curve when a parent wires those props through - falls back to real internal state
 * when it doesn't, so this still works completely on its own.
 */
export function ClassificationTable({
  results,
  currentDrivers,
  currentTeams,
  hoverDriver: hoverDriverProp,
  onHoverDriver,
  selectedDriver: selectedDriverProp,
  onSelectedDriver,
}: {
  results: RaceResultEntry[];
  currentDrivers: CurrentDriver[];
  currentTeams: CurrentTeam[];
  hoverDriver?: string | null;
  onHoverDriver?: (driver: string | null) => void;
  selectedDriver?: string | null;
  onSelectedDriver?: (driver: string | null) => void;
}) {
  const [internalHover, setInternalHover] = useState<string | null>(null);
  const hoverDriver = hoverDriverProp !== undefined ? hoverDriverProp : internalHover;
  const setHoverDriver = onHoverDriver ?? setInternalHover;
  const [internalSelected, setInternalSelected] = useState<string | null>(null);
  const selectedDriver = selectedDriverProp !== undefined ? selectedDriverProp : internalSelected;
  const setSelectedDriver = onSelectedDriver ?? setInternalSelected;

  const photoByCode = useMemo(() => new Map(currentDrivers.map((d) => [d.code, d.headshotUrl])), [currentDrivers]);
  const logoByTeam = useMemo(() => new Map(currentTeams.map((t) => [t.name, t.logoUrl])), [currentTeams]);

  const ranked = [...results].filter((r) => r.grid != null).sort((a, b) => a.finishPosition - b.finishPosition);
  if (ranked.length === 0) return null;

  const active = selectedDriver ?? hoverDriver;

  return (
    <div className="overflow-hidden rounded-lg border border-white/[0.07] bg-[var(--f1-carbon)]/50">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 border-b border-white/[0.08] text-left text-[11px] font-semibold uppercase tracking-wider text-neutral-500 backdrop-blur-md" style={HEADER_STYLE}>
          <tr>
            <th className="px-3 py-2.5 font-semibold">Pos</th>
            <th className="px-3 py-2.5 font-semibold">Driver</th>
            <th className="px-3 py-2.5 font-semibold">Team</th>
            <th className="px-3 py-2.5 text-right font-semibold">Gap</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--f1-line)]">
          {ranked.map((r) => {
            const isActive = active === r.driver;
            return (
              <tr
                key={r.driver}
                className={`group cursor-pointer transition-colors ${isActive ? "bg-white/[0.05]" : "hover:bg-white/[0.02]"}`}
                onMouseEnter={() => setHoverDriver(r.driver)}
                onMouseLeave={() => setHoverDriver(null)}
                onClick={() => setSelectedDriver(selectedDriver === r.driver ? null : r.driver)}
              >
                <td className={`px-3 py-2 font-mono tabular-nums ${r.finishPosition <= 3 ? "font-semibold text-white" : "text-neutral-500"}`}>{r.finishPosition}</td>
                <td className="whitespace-nowrap px-3 py-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0 overflow-hidden rounded-full transition-transform duration-200 group-hover:scale-[1.08]">
                      <EntityAvatar imageUrl={photoByCode.get(r.driver) ?? null} name={r.driverName} size={26} fit="cover" />
                    </span>
                    <span className="min-w-0 truncate font-medium text-white">
                      {r.driverName} <span className="font-mono text-[10px] font-normal text-neutral-500">{r.driver}</span>
                    </span>
                  </div>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-neutral-400">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <EntityAvatar imageUrl={logoByTeam.get(r.team) ?? null} name={r.team} size={16} shape="square" fit="contain" />
                    <span className="truncate">{r.team}</span>
                  </div>
                </td>
                <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-neutral-500">
                  {r.status === "dnf" ? "DNF" : r.finishPosition === 1 ? "Leader" : r.finishGapSec != null ? `+${r.finishGapSec.toFixed(1)}s` : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
