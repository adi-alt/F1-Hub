"use client";

import { useMemo, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { FavoriteButton } from "@/app/archive/components/FavoriteButton";
import { EntityAvatar } from "@/components/EntityAvatar";
import { ExportMenu } from "@/components/export/ExportMenu";
import { staggerContainer, staggerItem } from "@/components/motion/variants";
import { useNestedLenisScroll } from "@/components/motion/useLenisContainer";
import { tableToCanvas } from "@/lib/export";
import { averageFinish, driverResults, recentForm, teamResults } from "../lib/seasonStats";
import { QuietTabs } from "./QuietTabs";
import { useSeasonExplorer } from "./SeasonExplorerContext";
import { useSeasonFavorites } from "./SeasonFavoritesContext";
import type { ConstructorStandingRow, DriverStandingRow, RaceSummary } from "../services/season.service";

type SortKey = "name" | "wins" | "podiums" | "points";

const HEADER_CLASS = "text-left text-[11px] font-semibold uppercase tracking-wider text-neutral-500 backdrop-blur-md border-b border-white/[0.08]";
// Sticky headers need real opacity behind that blur, not the table's own near-transparent
// surface tint — otherwise rows scrolling underneath visibly bleed through. Reuses the same
// translucent-dark token every other floating/sticky surface on the site already uses.
const HEADER_STYLE = { background: "var(--tooltip-surface-strong)" };

function gapLabel(points: number, leaderPoints: number): string {
  return points >= leaderPoints ? "-" : `-${leaderPoints - points}`;
}

function sortIndicator(key: SortKey, sortKey: SortKey, sortDir: "asc" | "desc") {
  if (key !== sortKey) return null;
  return <span className="ml-1 text-[var(--f1-red)]">{sortDir === "asc" ? "↑" : "↓"}</span>;
}

/** The one standings table for the whole page — a Drivers/Constructors quiet-tab switch swaps
 * its rows in place (see spec: "the same analytical system updates", not two separate tables
 * stacked or two separate pages). Clicking a row expands an inline detail panel instead of
 * navigating away; "Compare"/"Progression" from there jump into the analysis workspace below
 * with this row already loaded, rather than making the user re-select it there. Kept a solid,
 * readable surface on purpose — this is the page's visual anchor, not another glass card. */
export function ChampionshipStandings({
  drivers,
  constructors,
  raceSummaries,
}: {
  drivers: DriverStandingRow[];
  constructors: ConstructorStandingRow[];
  raceSummaries: RaceSummary[];
}) {
  const { entityType, setEntityType, openCompare, setAnalysisTab } = useSeasonExplorer();
  const { favDrivers, favTeams, toggleDriver, toggleTeam } = useSeasonFavorites();
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("points");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [expanded, setExpanded] = useState<string | null>(null);
  const scrollRef = useNestedLenisScroll(entityType);

  const isDrivers = entityType === "drivers";
  const leaderPoints = isDrivers
    ? Math.max(0, ...drivers.map((d) => d.points))
    : Math.max(0, ...constructors.map((c) => c.points));

  const sortedDrivers = useMemo(() => {
    const list = drivers.filter((d) => !search || d.driverName.toLowerCase().includes(search.toLowerCase()) || d.team.toLowerCase().includes(search.toLowerCase()));
    list.sort((a, b) => {
      const cmp = sortKey === "name" ? a.driverName.localeCompare(b.driverName) : a[sortKey] - b[sortKey];
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [drivers, search, sortKey, sortDir]);

  const sortedConstructors = useMemo(() => {
    const list = constructors.filter((c) => !search || c.team.toLowerCase().includes(search.toLowerCase()));
    list.sort((a, b) => {
      const cmp = sortKey === "name" ? a.team.localeCompare(b.team) : a[sortKey] - b[sortKey];
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [constructors, search, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  }

  function toggleExpanded(id: string) {
    setExpanded((prev) => (prev === id ? null : id));
  }

  const driverRows = (): { columns: string[]; rows: (string | number)[][] } => ({
    columns: ["Pos", "Driver", "Team", "Wins", "Podiums", "Points", "Gap"],
    rows: sortedDrivers.map((d, i) => [i + 1, d.driverName, d.team, d.wins, d.podiums, d.points, gapLabel(d.points, leaderPoints)]),
  });
  const constructorRows = (): { columns: string[]; rows: (string | number)[][] } => ({
    columns: ["Pos", "Team", "Wins", "Podiums", "Points", "Gap"],
    rows: sortedConstructors.map((c, i) => [i + 1, c.team, c.wins, c.podiums, c.points, gapLabel(c.points, leaderPoints)]),
  });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">Championship</p>
          <div className="mt-2.5">
            <QuietTabs
              options={[
                { value: "drivers" as const, label: "Drivers" },
                { value: "constructors" as const, label: "Constructors" },
              ]}
              value={entityType}
              onChange={(t) => {
                setEntityType(t);
                setExpanded(null);
              }}
              className="text-[15px]"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={isDrivers ? "Search drivers or teams…" : "Search teams…"}
            className="w-48 rounded-lg border border-[var(--f1-line)] bg-white/[0.02] px-3 py-1.5 text-sm text-white placeholder:text-neutral-500 focus:border-white/20 focus:outline-none"
          />
          <ExportMenu
            filename={isDrivers ? "drivers-championship" : "constructors-championship"}
            getRows={isDrivers ? driverRows : constructorRows}
            getImage={async () => tableToCanvas((isDrivers ? driverRows() : constructorRows()).columns, (isDrivers ? driverRows() : constructorRows()).rows)}
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/60">
        <div ref={scrollRef} className="max-h-[480px] overflow-auto scrollbar-hide">
          <table className="w-full min-w-[680px] text-sm">
            <thead className={`sticky top-0 z-10 ${HEADER_CLASS}`} style={HEADER_STYLE}>
              <tr>
                <th className="px-4 py-3 font-semibold">Pos</th>
                <th className="cursor-pointer select-none px-4 py-3 font-semibold" onClick={() => toggleSort("name")}>
                  {isDrivers ? "Driver" : "Team"}
                  {sortIndicator("name", sortKey, sortDir)}
                </th>
                {isDrivers && <th className="px-4 py-3 font-semibold">Team</th>}
                <th className="cursor-pointer select-none px-4 py-3 text-right font-semibold" title="Wins" onClick={() => toggleSort("wins")}>
                  W{sortIndicator("wins", sortKey, sortDir)}
                </th>
                <th className="cursor-pointer select-none px-4 py-3 text-right font-semibold" title="Podiums" onClick={() => toggleSort("podiums")}>
                  P{sortIndicator("podiums", sortKey, sortDir)}
                </th>
                <th className="cursor-pointer select-none px-4 py-3 text-right font-semibold" title="Points" onClick={() => toggleSort("points")}>
                  PTS{sortIndicator("points", sortKey, sortDir)}
                </th>
                <th className="px-4 py-3 text-right font-semibold" title="Gap to leader">Gap</th>
                <th className="w-10 px-4 py-3 text-center font-semibold" title="Favorite">Fav</th>
              </tr>
            </thead>
            <motion.tbody initial="hidden" animate="show" variants={staggerContainer} className="divide-y divide-[var(--f1-line)]">
              {isDrivers
                ? sortedDrivers.map((d, i) => {
                    const isFavorited = !!d.favoriteId && favDrivers.has(d.favoriteId);
                    const isExpanded = expanded === d.driver;
                    return (
                      <RowGroup
                        key={d.driver}
                        isFavorited={isFavorited}
                        isExpanded={isExpanded}
                        colSpan={8}
                        onRowClick={() => toggleExpanded(d.driver)}
                        cells={
                          <>
                            <td className={`px-4 py-3 font-mono tabular-nums ${i < 3 ? "font-semibold text-white" : "text-neutral-500"}`}>{i + 1}</td>
                            <td className="whitespace-nowrap px-4 py-3">
                              <div className="flex items-center gap-2.5">
                                <span className="shrink-0 overflow-hidden rounded-full transition-transform duration-200 group-hover:scale-[1.08]">
                                  <EntityAvatar imageUrl={d.headshotUrl} name={d.driverName} size={32} fit="cover" />
                                </span>
                                <span className="font-medium text-white">
                                  {d.driverName} <span className="font-mono text-xs font-normal text-neutral-500">{d.driver}</span>
                                </span>
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-neutral-400">{d.team}</td>
                            <td className="px-4 py-3 text-right tabular-nums text-neutral-400">{d.wins}</td>
                            <td className="px-4 py-3 text-right tabular-nums text-neutral-400">{d.podiums}</td>
                            <td className="px-4 py-3 text-right text-base font-bold tabular-nums text-white">{d.points}</td>
                            <td className="px-4 py-3 text-right font-mono text-xs tabular-nums text-neutral-500">{gapLabel(d.points, leaderPoints)}</td>
                            <td className="px-4 py-3 text-center">
                              {d.favoriteId && (
                                <FavoriteButton favorited={isFavorited} onToggle={() => toggleDriver(d.favoriteId!)} className={`mx-auto transition-opacity ${isFavorited ? "" : "opacity-40 group-hover:opacity-100"}`} />
                              )}
                            </td>
                          </>
                        }
                        detail={
                          isExpanded && (
                            <DriverDetail
                              driver={d}
                              rivalCode={sortedDrivers[i === 0 ? 1 : i - 1]?.driver}
                              raceSummaries={raceSummaries}
                              onCompare={(rivalCode) => openCompare("drivers", d.driver, rivalCode)}
                              onProgression={() => setAnalysisTab("progression")}
                            />
                          )
                        }
                      />
                    );
                  })
                : sortedConstructors.map((c, i) => {
                    const isFavorited = favTeams.has(c.favoriteId);
                    const isExpanded = expanded === c.team;
                    return (
                      <RowGroup
                        key={c.team}
                        isFavorited={isFavorited}
                        isExpanded={isExpanded}
                        colSpan={7}
                        onRowClick={() => toggleExpanded(c.team)}
                        cells={
                          <>
                            <td className={`px-4 py-3 font-mono tabular-nums ${i < 3 ? "font-semibold text-white" : "text-neutral-500"}`}>{i + 1}</td>
                            <td className="whitespace-nowrap px-4 py-3">
                              <div className="flex items-center gap-2.5">
                                <span className="shrink-0 transition-transform duration-200 group-hover:scale-[1.08]">
                                  <EntityAvatar imageUrl={c.logoUrl} name={c.team} size={28} shape="square" fit="contain" />
                                </span>
                                <span className="font-medium text-white">{c.team}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums text-neutral-400">{c.wins}</td>
                            <td className="px-4 py-3 text-right tabular-nums text-neutral-400">{c.podiums}</td>
                            <td className="px-4 py-3 text-right text-base font-bold tabular-nums text-white">{c.points}</td>
                            <td className="px-4 py-3 text-right font-mono text-xs tabular-nums text-neutral-500">{gapLabel(c.points, leaderPoints)}</td>
                            <td className="px-4 py-3 text-center">
                              <FavoriteButton favorited={isFavorited} onToggle={() => toggleTeam(c.favoriteId)} className={`mx-auto transition-opacity ${isFavorited ? "" : "opacity-40 group-hover:opacity-100"}`} />
                            </td>
                          </>
                        }
                        detail={
                          isExpanded && (
                            <TeamDetail
                              team={c}
                              rivalId={sortedConstructors[i === 0 ? 1 : i - 1]?.team}
                              raceSummaries={raceSummaries}
                              onCompare={(rivalId) => openCompare("constructors", c.team, rivalId)}
                              onProgression={() => setAnalysisTab("progression")}
                            />
                          )
                        }
                      />
                    );
                  })}
            </motion.tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function RowGroup({
  isFavorited,
  isExpanded,
  colSpan,
  onRowClick,
  cells,
  detail,
}: {
  isFavorited: boolean;
  isExpanded: boolean;
  colSpan: number;
  onRowClick: () => void;
  cells: ReactNode;
  detail: ReactNode;
}) {
  return (
    <>
      <motion.tr
        layout
        variants={staggerItem}
        transition={{ layout: { duration: 0.3, ease: "easeOut" } }}
        onClick={onRowClick}
        className={`group cursor-pointer border-l-2 transition-colors duration-150 hover:bg-white/[0.035] ${
          isFavorited ? "border-l-[var(--f1-red)] bg-[var(--f1-red)]/[0.045]" : "border-l-transparent"
        } ${isExpanded ? "bg-white/[0.05]" : ""}`}
        style={isFavorited ? { backgroundImage: "linear-gradient(90deg, rgba(225,6,0,0.055), transparent 55%)" } : undefined}
      >
        {cells}
      </motion.tr>
      {detail && (
        <tr>
          <td colSpan={colSpan} className="p-2">
            {detail}
          </td>
        </tr>
      )}
    </>
  );
}

function DriverDetail({
  driver,
  rivalCode,
  raceSummaries,
  onCompare,
  onProgression,
}: {
  driver: DriverStandingRow;
  rivalCode?: string;
  raceSummaries: RaceSummary[];
  onCompare: (rivalCode: string) => void;
  onProgression: () => void;
}) {
  const results = driverResults(raceSummaries, driver.driver);
  const avg = averageFinish(results);
  const form = recentForm(results);

  return (
    <div className="glass-surface flex flex-wrap items-center gap-6 rounded-lg px-5 py-4">
      <Metric label="Wins" value={driver.wins} />
      <Metric label="Podiums" value={driver.podiums} />
      <Metric label="Avg finish" value={avg !== null ? `P${avg.toFixed(1)}` : "-"} />
      {form.length > 0 && (
        <div>
          <p className="mb-1 text-[10px] uppercase tracking-wide text-neutral-500">Recent</p>
          <div className="flex gap-1">
            {form.map((f) => (
              <span
                key={f.round}
                className={`rounded-md px-1.5 py-0.5 text-xs font-semibold ${f.position <= 3 ? "bg-[var(--f1-red)]/20 text-[var(--f1-red)]" : "bg-white/5 text-neutral-300"}`}
                title={f.trackShort}
              >
                P{f.position}
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="ml-auto flex gap-2">
        {rivalCode && (
          <button
            onClick={() => onCompare(rivalCode)}
            className="rounded-md border border-white/10 px-3 py-1.5 text-xs font-medium text-neutral-300 transition hover:border-white/25 hover:text-white"
          >
            Compare
          </button>
        )}
        <button
          onClick={onProgression}
          className="rounded-md border border-white/10 px-3 py-1.5 text-xs font-medium text-neutral-300 transition hover:border-white/25 hover:text-white"
        >
          Progression
        </button>
      </div>
    </div>
  );
}

function TeamDetail({
  team,
  rivalId,
  raceSummaries,
  onCompare,
  onProgression,
}: {
  team: ConstructorStandingRow;
  rivalId?: string;
  raceSummaries: RaceSummary[];
  onCompare: (rivalId: string) => void;
  onProgression: () => void;
}) {
  const results = teamResults(raceSummaries, team.team);
  const avg = averageFinish(results);
  const form = recentForm(results);

  return (
    <div className="glass-surface flex flex-wrap items-center gap-6 rounded-lg px-5 py-4">
      <Metric label="Wins" value={team.wins} />
      <Metric label="Podiums" value={team.podiums} />
      <Metric label="Best-car avg finish" value={avg !== null ? `P${avg.toFixed(1)}` : "-"} />
      {form.length > 0 && (
        <div>
          <p className="mb-1 text-[10px] uppercase tracking-wide text-neutral-500">Recent</p>
          <div className="flex gap-1">
            {form.map((f) => (
              <span
                key={f.round}
                className={`rounded-md px-1.5 py-0.5 text-xs font-semibold ${f.position <= 3 ? "bg-[var(--f1-red)]/20 text-[var(--f1-red)]" : "bg-white/5 text-neutral-300"}`}
                title={f.trackShort}
              >
                P{f.position}
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="ml-auto flex gap-2">
        {rivalId && (
          <button
            onClick={() => onCompare(rivalId)}
            className="rounded-md border border-white/10 px-3 py-1.5 text-xs font-medium text-neutral-300 transition hover:border-white/25 hover:text-white"
          >
            Compare
          </button>
        )}
        <button
          onClick={onProgression}
          className="rounded-md border border-white/10 px-3 py-1.5 text-xs font-medium text-neutral-300 transition hover:border-white/25 hover:text-white"
        >
          Progression
        </button>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="font-mono text-sm font-semibold tabular-nums text-white">{value}</p>
    </div>
  );
}
