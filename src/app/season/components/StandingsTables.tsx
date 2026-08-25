"use client";

import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { motion } from "framer-motion";
import { FavoriteButton } from "@/app/archive/components/FavoriteButton";
import { EntityAvatar } from "@/components/EntityAvatar";
import { staggerContainer, staggerItem } from "@/components/motion/variants";
import type { ConstructorStandingRow, DriverStandingRow } from "../services/season.service";

type SortKey = "name" | "wins" | "podiums" | "points";

// Shared by both tables below — same optimistic-toggle-then-POST-then-revert-on-failure pattern
// every other favorite control in the app uses (see FavoriteEntityList.tsx), just parameterized
// on which Set to update since each table owns its own favorited-state.
function toggleFavorite(id: string, willFavorite: boolean, type: "driver" | "team", setFavorites: Dispatch<SetStateAction<Set<string>>>) {
  setFavorites((prev) => {
    const next = new Set(prev);
    if (willFavorite) next.add(id);
    else next.delete(id);
    return next;
  });
  fetch("/api/archive/favorites", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, id, favorited: willFavorite }),
  }).catch(() => {
    setFavorites((prev) => {
      const reverted = new Set(prev);
      if (willFavorite) reverted.delete(id);
      else reverted.add(id);
      return reverted;
    });
  });
}

function sortIndicator(key: SortKey, sortKey: SortKey, sortDir: "asc" | "desc") {
  if (key !== sortKey) return null;
  return <span className="ml-1 text-[var(--f1-red)]">{sortDir === "asc" ? "↑" : "↓"}</span>;
}

export function DriverStandingsTable({ standings, favoriteIds }: { standings: DriverStandingRow[]; favoriteIds: string[] }) {
  const [favorites, setFavorites] = useState(() => new Set(favoriteIds));
  const [sortKey, setSortKey] = useState<SortKey>("points");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

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

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--f1-line)]">
      {/* data-lenis-prevent: allowNestedScroll (useLenisContainer's default) is a heuristic - it
          walks a wheel event's composed path checking computed overflow, and it doesn't reliably
          catch every nested-scroll region. This is Lenis's own documented, deterministic escape
          hatch instead: it skips this element outright, no heuristic involved, so the table always
          scrolls on its own rather than the page underneath it. */}
      <div className="max-h-[420px] overflow-auto" data-lenis-prevent>
        <table className="w-full min-w-[620px] text-sm">
          <thead className="sticky top-0 z-10 bg-[var(--f1-carbon)] text-left text-xs uppercase tracking-wide text-neutral-500">
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
              <th className="w-10 px-4 py-3 text-center">Fav</th>
            </tr>
          </thead>
          <motion.tbody
            key={`${sortKey}-${sortDir}`}
            initial="hidden"
            animate="show"
            variants={staggerContainer}
            className="divide-y divide-[var(--f1-line)]"
          >
            {sorted.map((s, i) => (
              <motion.tr
                key={s.driver}
                variants={staggerItem}
                className={`transition hover:bg-white/[0.05] ${i < 3 ? "bg-white/[0.03]" : ""}`}
              >
                <td className="px-4 py-2.5 font-semibold text-white">{i + 1}</td>
                <td className="whitespace-nowrap px-4 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <EntityAvatar imageUrl={s.headshotUrl} name={s.driverName} size={32} fit="cover" />
                    <span className="text-white">
                      {s.driverName} <span className="text-neutral-500">{s.driver}</span>
                    </span>
                  </div>
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-neutral-400">{s.team}</td>
                <td className="px-4 py-2.5 text-right text-neutral-400">{s.wins}</td>
                <td className="px-4 py-2.5 text-right text-neutral-400">{s.podiums}</td>
                <td className="px-4 py-2.5 text-right font-semibold text-white">{s.points}</td>
                <td className="px-4 py-2.5 text-center">
                  {s.favoriteId && (
                    <FavoriteButton
                      favorited={favorites.has(s.favoriteId)}
                      onToggle={() => toggleFavorite(s.favoriteId!, !favorites.has(s.favoriteId!), "driver", setFavorites)}
                      className="mx-auto"
                    />
                  )}
                </td>
              </motion.tr>
            ))}
          </motion.tbody>
        </table>
      </div>
    </div>
  );
}

export function ConstructorStandingsTable({ standings, favoriteIds }: { standings: ConstructorStandingRow[]; favoriteIds: string[] }) {
  const [favorites, setFavorites] = useState(() => new Set(favoriteIds));
  const [sortKey, setSortKey] = useState<SortKey>("points");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

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

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--f1-line)]">
      <div className="max-h-[420px] overflow-auto" data-lenis-prevent>
        <table className="w-full min-w-[480px] text-sm">
          <thead className="sticky top-0 z-10 bg-[var(--f1-carbon)] text-left text-xs uppercase tracking-wide text-neutral-500">
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
              <th className="w-10 px-4 py-3 text-center">Fav</th>
            </tr>
          </thead>
          <motion.tbody
            key={`${sortKey}-${sortDir}`}
            initial="hidden"
            animate="show"
            variants={staggerContainer}
            className="divide-y divide-[var(--f1-line)]"
          >
            {sorted.map((s, i) => (
              <motion.tr
                key={s.team}
                variants={staggerItem}
                className={`transition hover:bg-white/[0.05] ${i < 3 ? "bg-white/[0.03]" : ""}`}
              >
                <td className="px-4 py-2.5 font-semibold text-white">{i + 1}</td>
                <td className="whitespace-nowrap px-4 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <EntityAvatar imageUrl={s.logoUrl} name={s.team} size={28} shape="square" fit="contain" />
                    <span className="text-white">{s.team}</span>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-right text-neutral-400">{s.wins}</td>
                <td className="px-4 py-2.5 text-right text-neutral-400">{s.podiums}</td>
                <td className="px-4 py-2.5 text-right font-semibold text-white">{s.points}</td>
                <td className="px-4 py-2.5 text-center">
                  <FavoriteButton
                    favorited={favorites.has(s.favoriteId)}
                    onToggle={() => toggleFavorite(s.favoriteId, !favorites.has(s.favoriteId), "team", setFavorites)}
                    className="mx-auto"
                  />
                </td>
              </motion.tr>
            ))}
          </motion.tbody>
        </table>
      </div>
    </div>
  );
}
