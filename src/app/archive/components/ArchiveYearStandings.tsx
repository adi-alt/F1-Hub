"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { QuietTabs } from "@/app/season/_components/QuietTabs";
import { staggerItem } from "@/components/motion/variants";
import { isVerifiedChampionYear } from "@/lib/eras";
import { useFavDriverIds, useFavTeamIds, useToggleFavorite } from "@/queries/favorites/useFavorites";
import { FavoriteButton } from "./FavoriteButton";
import type { ArchiveConstructorStandingRow, ArchiveDriverStandingRow } from "@/lib/archiveStandings";

const HEADER_CLASS = "text-left text-[11px] font-semibold uppercase tracking-wider text-neutral-500 backdrop-blur-md border-b border-white/[0.08]";
const HEADER_STYLE = { background: "var(--tooltip-surface-strong)" };

type SortKey = "name" | "wins" | "podiums" | "points";

/** The Archive year page's Championship section - a Drivers/Constructors QuietTabs switch over a
 * table using ChampionshipStandings.tsx's own sticky-header constants verbatim, not a re-derived
 * version, the same reuse-not-reinvent rule every other Archive table already follows this session.
 * Not a literal reuse of that component itself - a historical year has no "Compare live"/
 * "Progression chart" to jump into, so the compare/export machinery genuinely doesn't apply here;
 * just its header treatment and row shape. computeArchiveStandings already did the real-data
 * points/wins/podiums reduction (src/lib/archiveStandings.ts) - this only sorts/renders it. */
export function ArchiveYearStandings({
  year,
  drivers,
  constructors,
}: {
  year: number;
  drivers: ArchiveDriverStandingRow[];
  constructors: ArchiveConstructorStandingRow[];
}) {
  const [entityType, setEntityType] = useState<"drivers" | "constructors">("drivers");
  const [sortKey, setSortKey] = useState<SortKey>("points");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const favDrivers = useFavDriverIds();
  const favTeams = useFavTeamIds();
  const toggleFavorite = useToggleFavorite();
  const isDrivers = entityType === "drivers";
  const verified = isVerifiedChampionYear(year);

  const sortedDrivers = useMemo(() => {
    const list = [...drivers];
    list.sort((a, b) => {
      const cmp = sortKey === "name" ? a.driverName.localeCompare(b.driverName) : a[sortKey] - b[sortKey];
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [drivers, sortKey, sortDir]);

  const sortedConstructors = useMemo(() => {
    const list = [...constructors];
    list.sort((a, b) => {
      const cmp = sortKey === "name" ? a.team.localeCompare(b.team) : a[sortKey] - b[sortKey];
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [constructors, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  }

  function indicator(key: SortKey) {
    if (key !== sortKey) return null;
    return <span className="ml-1 text-[var(--f1-red)]">{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">Championship</p>
          <div className="mt-2.5">
            <QuietTabs
              options={[
                { value: "drivers" as const, label: "Drivers" },
                { value: "constructors" as const, label: "Constructors" },
              ]}
              value={entityType}
              onChange={setEntityType}
              className="text-[15px]"
            />
          </div>
        </div>
      </div>

      {!verified && (
        <p className="mb-3 text-xs text-neutral-500">
          Points shown are a full-season sum. F1&rsquo;s actual title rule before 1991 counted only a driver&rsquo;s best results, which can occasionally
          differ from this total.
        </p>
      )}

      <div className="overflow-hidden rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/60">
        <div className="max-h-[480px] overflow-auto scrollbar-hide">
          <table className="w-full min-w-[520px] text-sm">
            <thead className={`sticky top-0 z-10 ${HEADER_CLASS}`} style={HEADER_STYLE}>
              <tr>
                <th className="px-4 py-3 font-semibold">Pos</th>
                <th className="cursor-pointer select-none px-4 py-3 font-semibold" onClick={() => toggleSort("name")}>
                  {isDrivers ? "Driver" : "Team"}
                  {indicator("name")}
                </th>
                {isDrivers && <th className="px-4 py-3 font-semibold">Team</th>}
                <th className="cursor-pointer select-none px-4 py-3 text-right font-semibold" title="Wins" onClick={() => toggleSort("wins")}>
                  W{indicator("wins")}
                </th>
                <th className="cursor-pointer select-none px-4 py-3 text-right font-semibold" title="Podiums" onClick={() => toggleSort("podiums")}>
                  P{indicator("podiums")}
                </th>
                <th className="cursor-pointer select-none px-4 py-3 text-right font-semibold" title="Points" onClick={() => toggleSort("points")}>
                  PTS{indicator("points")}
                </th>
                <th className="w-10 px-4 py-3 text-center font-semibold" title="Favorite">
                  Fav
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--f1-line)]">
              <AnimatePresence initial={false}>
                {isDrivers
                  ? sortedDrivers.map((d, i) => (
                      <motion.tr
                        key={d.driverId}
                        layout
                        initial="hidden"
                        animate="show"
                        exit="hidden"
                        variants={staggerItem}
                        transition={{ layout: { duration: 0.25, ease: [0.22, 1, 0.36, 1] } }}
                        className="transition-colors hover:bg-white/[0.035]"
                      >
                        <td className={`px-4 py-3 font-mono tabular-nums ${i < 3 ? "font-semibold text-white" : "text-neutral-500"}`}>{i + 1}</td>
                        <td className="whitespace-nowrap px-4 py-3 font-medium text-white">{d.driverName}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-neutral-400">{d.team}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-neutral-400">{d.wins}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-neutral-400">{d.podiums}</td>
                        <td className="px-4 py-3 text-right text-base font-bold tabular-nums text-white">{d.points}</td>
                        <td className="px-4 py-3 text-center">
                          <FavoriteButton favorited={favDrivers.has(d.driverId)} onToggle={() => toggleFavorite("driver", d.driverId)} className="mx-auto" />
                        </td>
                      </motion.tr>
                    ))
                  : sortedConstructors.map((c, i) => (
                      <motion.tr
                        key={c.team}
                        layout
                        initial="hidden"
                        animate="show"
                        exit="hidden"
                        variants={staggerItem}
                        transition={{ layout: { duration: 0.25, ease: [0.22, 1, 0.36, 1] } }}
                        className="transition-colors hover:bg-white/[0.035]"
                      >
                        <td className={`px-4 py-3 font-mono tabular-nums ${i < 3 ? "font-semibold text-white" : "text-neutral-500"}`}>{i + 1}</td>
                        <td className="whitespace-nowrap px-4 py-3 font-medium text-white">{c.team}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-neutral-400">{c.wins}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-neutral-400">{c.podiums}</td>
                        <td className="px-4 py-3 text-right text-base font-bold tabular-nums text-white">{c.points}</td>
                        <td className="px-4 py-3 text-center">
                          {c.teamId && <FavoriteButton favorited={favTeams.has(c.teamId)} onToggle={() => toggleFavorite("team", c.teamId!)} className="mx-auto" />}
                        </td>
                      </motion.tr>
                    ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
