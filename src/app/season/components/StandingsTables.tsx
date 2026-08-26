"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { FavoriteButton } from "@/app/archive/components/FavoriteButton";
import { EntityAvatar } from "@/components/EntityAvatar";
import { ExportMenu } from "@/components/export/ExportMenu";
import { staggerContainer, staggerItem } from "@/components/motion/variants";
import { useNestedLenisScroll } from "@/components/motion/useLenisContainer";
import { tableToCanvas } from "@/lib/export";
import { useSeasonFavorites } from "./SeasonFavoritesContext";
import type { ConstructorStandingRow, DriverStandingRow } from "../services/season.service";

const DRIVER_COLUMNS = ["Pos", "Driver", "Team", "Wins", "Podiums", "Points", "Gap"];
const CONSTRUCTOR_COLUMNS = ["Pos", "Team", "Wins", "Podiums", "Points", "Gap"];

type SortKey = "name" | "wins" | "podiums" | "points";

// Zinc-themed, not white-glass — a deliberately different, opaque material from the rows beneath
// it (see globals.css's .glass) so a table's header reads as its own distinct strip, same idea as
// the rail widgets' own header bar (SeasonSidebarWidgets.tsx's RailCard).
const HEADER_CLASS = "bg-[var(--f1-carbon)] text-left text-xs uppercase tracking-wide text-neutral-400";

function sortIndicator(key: SortKey, sortKey: SortKey, sortDir: "asc" | "desc") {
  if (key !== sortKey) return null;
  return <span className="ml-1 text-[var(--f1-red)]">{sortDir === "asc" ? "↑" : "↓"}</span>;
}

// Always relative to the real points leader, regardless of the table's current sort — a broadcast
// standings-graphic convention, not something re-sorting by name/wins should change.
function gapLabel(points: number, leaderPoints: number): string {
  return points >= leaderPoints ? "—" : `-${leaderPoints - points}`;
}

// A colored left border (not a background tint, which would clash with the existing top-3
// highlight) for whichever rows the user has favorited — kept as a permanent 2px transparent
// border rather than adding one conditionally, so favoriting/unfavoriting doesn't shift layout.
function favoriteRowClass(isFavorited: boolean): string {
  return isFavorited ? "border-l-2 border-l-[var(--f1-red)] bg-[var(--f1-red)]/[0.04]" : "border-l-2 border-l-transparent";
}

export function DriverStandingsTable({ standings }: { standings: DriverStandingRow[] }) {
  const { favDrivers, toggleDriver } = useSeasonFavorites();
  const [sortKey, setSortKey] = useState<SortKey>("points");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const scrollRef = useNestedLenisScroll();
  const leaderPoints = standings.length ? Math.max(...standings.map((s) => s.points)) : 0;

  const sorted = useMemo(() => {
    const list = [...standings];
    list.sort((a, b) => {
      const cmp = sortKey === "name" ? a.driverName.localeCompare(b.driverName) : a[sortKey] - b[sortKey];
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [standings, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  }

  const driverRows = (): { columns: string[]; rows: (string | number)[][] } => ({
    columns: DRIVER_COLUMNS,
    rows: sorted.map((s, i) => [i + 1, s.driverName, s.team, s.wins, s.podiums, s.points, gapLabel(s.points, leaderPoints)]),
  });

  return (
    <div className="glass backdrop-blur-2xl overflow-hidden rounded-xl border border-[var(--f1-line)]">
      {/* Its own Lenis instance (see useNestedLenisScroll) rather than plain native overflow-auto
          scroll or the old data-lenis-prevent — the table gets real Lenis smoothing, and the
          page's own root instance defers to it via the nested-region registry instead of fighting
          it (see nestedLenisRegistry.ts). */}
      <div ref={scrollRef} className="max-h-[420px] overflow-auto scrollbar-hide">
        <table className="w-full min-w-[680px] text-sm">
          <thead className={`sticky top-0 z-10 ${HEADER_CLASS}`}>
            <tr>
              <th className="px-4 py-3">Pos</th>
              <th className="cursor-pointer select-none px-4 py-3" onClick={() => toggleSort("name")}>
                Driver{sortIndicator("name", sortKey, sortDir)}
              </th>
              <th className="px-4 py-3">Team</th>
              <th className="cursor-pointer select-none px-4 py-3 text-right" onClick={() => toggleSort("wins")}>
                Wins{sortIndicator("wins", sortKey, sortDir)}
              </th>
              <th className="cursor-pointer select-none px-4 py-3 text-right" onClick={() => toggleSort("podiums")}>
                Podiums{sortIndicator("podiums", sortKey, sortDir)}
              </th>
              <th className="cursor-pointer select-none px-4 py-3 text-right" onClick={() => toggleSort("points")}>
                Points{sortIndicator("points", sortKey, sortDir)}
              </th>
              <th className="px-4 py-3 text-right">Gap</th>
              <th className="w-10 px-4 py-3 text-center">Fav</th>
              <th className="w-10 px-2 py-3 text-center">
                <ExportMenu
                  filename="drivers-championship"
                  getRows={driverRows}
                  getImage={async () => tableToCanvas(driverRows().columns, driverRows().rows)}
                  className="mx-auto"
                />
              </th>
            </tr>
          </thead>
          <motion.tbody initial="hidden" animate="show" variants={staggerContainer} className="divide-y divide-[var(--f1-line)]">
            {sorted.map((s, i) => {
              const isFavorited = !!s.favoriteId && favDrivers.has(s.favoriteId);
              return (
                <motion.tr
                  key={s.driver}
                  layout
                  variants={staggerItem}
                  transition={{ layout: { duration: 0.35, ease: "easeOut" } }}
                  className={`transition hover:bg-black/[0.05] ${i < 3 ? "bg-black/[0.03]" : ""} ${favoriteRowClass(isFavorited)}`}
                >
                  <td className="px-4 py-2.5 font-semibold text-neutral-900">{i + 1}</td>
                  <td className="whitespace-nowrap px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <EntityAvatar imageUrl={s.headshotUrl} name={s.driverName} size={32} fit="cover" />
                      <span className="text-neutral-900">
                        {s.driverName} <span className="text-neutral-600">{s.driver}</span>
                      </span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-neutral-600">{s.team}</td>
                  <td className="px-4 py-2.5 text-right text-neutral-600">{s.wins}</td>
                  <td className="px-4 py-2.5 text-right text-neutral-600">{s.podiums}</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-neutral-900">{s.points}</td>
                  <td className="px-4 py-2.5 text-right text-neutral-600">{gapLabel(s.points, leaderPoints)}</td>
                  <td className="px-4 py-2.5 text-center">
                    {s.favoriteId && (
                      <FavoriteButton favorited={isFavorited} onToggle={() => toggleDriver(s.favoriteId!)} className="mx-auto" />
                    )}
                  </td>
                  <td />
                </motion.tr>
              );
            })}
          </motion.tbody>
        </table>
      </div>
    </div>
  );
}

export function ConstructorStandingsTable({ standings }: { standings: ConstructorStandingRow[] }) {
  const { favTeams, toggleTeam } = useSeasonFavorites();
  const [sortKey, setSortKey] = useState<SortKey>("points");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const scrollRef = useNestedLenisScroll();
  const leaderPoints = standings.length ? Math.max(...standings.map((s) => s.points)) : 0;

  const sorted = useMemo(() => {
    const list = [...standings];
    list.sort((a, b) => {
      const cmp = sortKey === "name" ? a.team.localeCompare(b.team) : a[sortKey] - b[sortKey];
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [standings, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  }

  const constructorRows = (): { columns: string[]; rows: (string | number)[][] } => ({
    columns: CONSTRUCTOR_COLUMNS,
    rows: sorted.map((s, i) => [i + 1, s.team, s.wins, s.podiums, s.points, gapLabel(s.points, leaderPoints)]),
  });

  return (
    <div className="glass backdrop-blur-2xl overflow-hidden rounded-xl border border-[var(--f1-line)]">
      <div ref={scrollRef} className="max-h-[420px] overflow-auto scrollbar-hide">
        <table className="w-full min-w-[540px] text-sm">
          <thead className={`sticky top-0 z-10 ${HEADER_CLASS}`}>
            <tr>
              <th className="px-4 py-3">Pos</th>
              <th className="cursor-pointer select-none px-4 py-3" onClick={() => toggleSort("name")}>
                Team{sortIndicator("name", sortKey, sortDir)}
              </th>
              <th className="cursor-pointer select-none px-4 py-3 text-right" onClick={() => toggleSort("wins")}>
                Wins{sortIndicator("wins", sortKey, sortDir)}
              </th>
              <th className="cursor-pointer select-none px-4 py-3 text-right" onClick={() => toggleSort("podiums")}>
                Podiums{sortIndicator("podiums", sortKey, sortDir)}
              </th>
              <th className="cursor-pointer select-none px-4 py-3 text-right" onClick={() => toggleSort("points")}>
                Points{sortIndicator("points", sortKey, sortDir)}
              </th>
              <th className="px-4 py-3 text-right">Gap</th>
              <th className="w-10 px-4 py-3 text-center">Fav</th>
              <th className="w-10 px-2 py-3 text-center">
                <ExportMenu
                  filename="constructors-championship"
                  getRows={constructorRows}
                  getImage={async () => tableToCanvas(constructorRows().columns, constructorRows().rows)}
                  className="mx-auto"
                />
              </th>
            </tr>
          </thead>
          <motion.tbody initial="hidden" animate="show" variants={staggerContainer} className="divide-y divide-[var(--f1-line)]">
            {sorted.map((s, i) => {
              const isFavorited = favTeams.has(s.favoriteId);
              return (
                <motion.tr
                  key={s.team}
                  layout
                  variants={staggerItem}
                  transition={{ layout: { duration: 0.35, ease: "easeOut" } }}
                  className={`transition hover:bg-black/[0.05] ${i < 3 ? "bg-black/[0.03]" : ""} ${favoriteRowClass(isFavorited)}`}
                >
                  <td className="px-4 py-2.5 font-semibold text-neutral-900">{i + 1}</td>
                  <td className="whitespace-nowrap px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <EntityAvatar imageUrl={s.logoUrl} name={s.team} size={28} shape="square" fit="contain" />
                      <span className="text-neutral-900">{s.team}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right text-neutral-600">{s.wins}</td>
                  <td className="px-4 py-2.5 text-right text-neutral-600">{s.podiums}</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-neutral-900">{s.points}</td>
                  <td className="px-4 py-2.5 text-right text-neutral-600">{gapLabel(s.points, leaderPoints)}</td>
                  <td className="px-4 py-2.5 text-center">
                    <FavoriteButton favorited={isFavorited} onToggle={() => toggleTeam(s.favoriteId)} className="mx-auto" />
                  </td>
                  <td />
                </motion.tr>
              );
            })}
          </motion.tbody>
        </table>
      </div>
    </div>
  );
}
