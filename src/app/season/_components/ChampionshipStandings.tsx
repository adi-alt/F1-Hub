"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { FavoriteButton } from "@/app/archive/components/FavoriteButton";
import { EntityAvatar } from "@/components/EntityAvatar";
import { ExportMenu } from "@/components/export/ExportMenu";
import { Table, sortRows, type TableColumn, type TableSort } from "@/components/ui/Table";
import { tableToCanvas } from "@/lib/export";
import { useFavDriverIds, useFavTeamIds, useToggleFavorite } from "@/queries/favorites/useFavorites";
import { averageFinish, driverResults, recentForm, teamResults } from "../_utils/seasonStats";
import { TabList, TabPanels, Tabs, type TabItem } from "@/components/ui/Tabs";
import { useSeasonExplorer, type EntityType } from "../_context/SeasonExplorerContext";
import type { ConstructorStandingRow, DriverStandingRow, PersonalSeasonContext, RaceSummary } from "../_service/season.pure";

// Underline: which championship the page is reading is this section's main switch.
const ENTITY_TABS: TabItem<EntityType>[] = [
  { value: "drivers", label: "Drivers" },
  { value: "constructors", label: "Constructors" },
];

/** Read at call time rather than through a hook: this is consulted inside an effect, where a
 * re-render-triggering hook would be the wrong tool. */
function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function gapLabel(points: number, leaderPoints: number): string {
  return points >= leaderPoints ? "-" : `-${leaderPoints - points}`;
}

/** The one standings table for the whole page — a Drivers/Constructors tab switch swaps
 * its rows in place (see spec: "the same analytical system updates", not two separate tables
 * stacked or two separate pages). Clicking a row expands an inline detail panel instead of
 * navigating away; "Compare"/"Progression" from there jump into the analysis workspace below
 * with this row already loaded, rather than making the user re-select it there. Kept a solid,
 * readable surface on purpose — this is the page's visual anchor, not another glass card. */
export function ChampionshipStandings({
  drivers,
  constructors,
  raceSummaries,
  personal,
}: {
  drivers: DriverStandingRow[];
  constructors: ConstructorStandingRow[];
  raceSummaries: RaceSummary[];
  personal: PersonalSeasonContext;
}) {
  const { entityType, setEntityType, openCompare, setAnalysisTab, focus } = useSeasonExplorer();
  const scrollBodyRef = useRef<HTMLDivElement>(null);
  const championshipLabelId = useId();
  const [marked, setMarked] = useState<string | null>(null);
  const favDrivers = useFavDriverIds();
  const favTeams = useFavTeamIds();
  const toggleFavorite = useToggleFavorite();
  const toggleDriver = (id: string) => toggleFavorite("driver", id);
  const toggleTeam = (id: string) => toggleFavorite("team", id);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<TableSort>({ key: "points", direction: "descending" });
  const [expanded, setExpanded] = useState<string | null>(null);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const favoriteCodes = new Set<string>(entityType === "drivers" ? personal.driverCodes : personal.teamNames);
  const canFilterFavorites = favoriteCodes.size > 0;

  const isDrivers = entityType === "drivers";
  // The championship position (the standings' own points order), never the row index, which changed with sorting
  // and filtering (a search for one driver showed them as 1st).
  const champPos = useMemo(
    () => new Map<string, number>((isDrivers ? drivers.map((d) => d.driver) : constructors.map((c) => c.team)).map((id, k) => [id, k + 1])),
    [isDrivers, drivers, constructors],
  );
  const favoriteDriverCodes = useMemo(() => new Set(personal.driverCodes), [personal.driverCodes]);
  const favoriteTeamNames = useMemo(() => new Set(personal.teamNames), [personal.teamNames]);
  const leaderPoints = isDrivers
    ? Math.max(0, ...drivers.map((d) => d.points))
    : Math.max(0, ...constructors.map((c) => c.points));

  const filteredDrivers = useMemo(
    () =>
      drivers.filter(
        (d) =>
          (!search || d.driverName.toLowerCase().includes(search.toLowerCase()) || d.team.toLowerCase().includes(search.toLowerCase())) &&
          (!favoritesOnly || favoriteDriverCodes.size === 0 || favoriteDriverCodes.has(d.driver)),
      ),
    [drivers, search, favoritesOnly, favoriteDriverCodes],
  );
  const filteredConstructors = useMemo(
    () => constructors.filter((c) => (!search || c.team.toLowerCase().includes(search.toLowerCase())) && (!favoritesOnly || favoriteTeamNames.size === 0 || favoriteTeamNames.has(c.team))),
    [constructors, search, favoritesOnly, favoriteTeamNames],
  );

  const posColumn = <Row extends { points: number }>(idOf: (row: Row) => string): TableColumn<Row> => ({
    key: "pos",
    header: "Pos",
    numeric: true,
    align: "start",
    width: "3.5rem",
    render: (row) => {
      const pos = champPos.get(idOf(row)) ?? 0;
      return <span className={`font-mono ${pos <= 3 ? "font-semibold text-primary" : "text-tertiary"}`}>{pos}</span>;
    },
  });
  const statColumns = <Row extends { wins: number; podiums: number; points: number }>(): TableColumn<Row>[] => [
    { key: "wins", header: "Wins", numeric: true, sortable: true },
    { key: "podiums", header: "Podiums", numeric: true, sortable: true },
    { key: "points", header: "Pts", numeric: true, sortable: true, render: (row) => <span className="font-semibold text-primary">{row.points}</span> },
    { key: "gap", header: "Gap", numeric: true, render: (row) => <span className="font-mono text-tertiary">{gapLabel(row.points, leaderPoints)}</span> },
  ];
  const favColumn = <Row,>(favoriteIdOf: (row: Row) => string | null | undefined, isFav: (id: string) => boolean, toggle: (id: string) => void): TableColumn<Row & object> => ({
    key: "favorite",
    header: "Fav",
    width: "3.5rem",
    render: (row) => {
      const id = favoriteIdOf(row);
      return id ? <FavoriteButton favorited={isFav(id)} onToggle={() => toggle(id)} /> : null;
    },
  });
  // The row's anchor for Snapshot / What-changed focus: the effect below finds it and scrolls to its row.
  const nameCell = (id: string, avatar: ReactNode, label: ReactNode) => (
    <span data-entity-id={id} className={`flex items-center gap-2.5 rounded-control transition-colors duration-500 ${marked === id ? "bg-[var(--f1-red)]/[0.14]" : ""}`}>
      <span className="shrink-0 overflow-hidden rounded-full">{avatar}</span>
      <span className="font-medium text-primary">{label}</span>
    </span>
  );

  const driverColumns: TableColumn<DriverStandingRow>[] = [
    posColumn<DriverStandingRow>((d) => d.driver),
    {
      key: "name",
      header: "Driver",
      sortable: true,
      firstSortDirection: "ascending",
      sortValue: (d) => d.driverName,
      render: (d) =>
        nameCell(
          d.driver,
          <EntityAvatar imageUrl={d.headshotUrl} name={d.driverName} size={32} fit="cover" />,
          <>
            {d.driverName} <span className="font-mono text-caption font-normal text-tertiary">{d.driver}</span>
          </>,
        ),
    },
    {
      key: "team",
      header: "Team",
      hideBelow: "md",
      render: (d) => (
        <span className="flex items-center gap-2 text-secondary">
          <EntityAvatar imageUrl={d.teamLogoUrl} name={d.team} size={18} shape="square" fit="contain" />
          {d.team}
        </span>
      ),
    },
    ...statColumns<DriverStandingRow>(),
    favColumn<DriverStandingRow>((d) => d.favoriteId, (id) => favDrivers.has(id), toggleDriver),
  ];
  const constructorColumns: TableColumn<ConstructorStandingRow>[] = [
    posColumn<ConstructorStandingRow>((c) => c.team),
    {
      key: "name",
      header: "Team",
      sortable: true,
      firstSortDirection: "ascending",
      sortValue: (c) => c.team,
      render: (c) => nameCell(c.team, <EntityAvatar imageUrl={c.logoUrl} name={c.team} size={28} shape="square" fit="contain" />, c.team),
    },
    ...statColumns<ConstructorStandingRow>(),
    favColumn<ConstructorStandingRow>((c) => c.favoriteId, (id) => favTeams.has(id), toggleTeam),
  ];
  const sortedDrivers = sortRows(filteredDrivers, driverColumns, sort);
  const sortedConstructors = sortRows(filteredConstructors, constructorColumns, sort);

  function switchEntityType(next: EntityType) {
    setEntityType(next);
    setExpanded(null);
  }

  // Snapshot / What-changed clicks land here. Scrolling INSIDE the table's own scroll container
  // (rather than scrollIntoView on the page) is what keeps the page position stable while still
  // bringing the row into view; the mark fades on its own so it never becomes permanent state.
  useEffect(() => {
    if (!focus || focus.entityType !== entityType) return;
    const container = scrollBodyRef.current;
    const row = container?.querySelector<HTMLElement>(`[data-entity-id="${CSS.escape(focus.entityId)}"]`)?.closest("tr");
    if (!container || !row) return;
    container.scrollTo({ top: Math.max(0, row.offsetTop - container.clientHeight / 2 + row.clientHeight / 2), behavior: prefersReducedMotion() ? "auto" : "smooth" });
    setMarked(focus.entityId);
    const timer = window.setTimeout(() => setMarked(null), 2200);
    return () => window.clearTimeout(timer);
  }, [focus, entityType]);

  // Distinguishes "your filter matched nothing" from "this championship has no rows yet" - the
  // two need different wording, and a bare empty table answers neither.
  const visibleCount = isDrivers ? sortedDrivers.length : sortedConstructors.length;
  const emptyMessage =
    visibleCount > 0
      ? null
      : search.trim()
        ? `No ${isDrivers ? "drivers" : "teams"} match "${search.trim()}".`
        : favoritesOnly
          ? `None of your favorites are in the ${isDrivers ? "drivers'" : "constructors'"} championship yet.`
          : `No ${isDrivers ? "driver" : "team"} has scored yet this season.`;

  const driverRows = (): { columns: string[]; rows: (string | number)[][] } => ({
    columns: ["Pos", "Driver", "Team", "Wins", "Podiums", "Points", "Gap"],
    rows: sortedDrivers.map((d, i) => [i + 1, d.driverName, d.team, d.wins, d.podiums, d.points, gapLabel(d.points, leaderPoints)]),
  });
  const constructorRows = (): { columns: string[]; rows: (string | number)[][] } => ({
    columns: ["Pos", "Team", "Wins", "Podiums", "Points", "Gap"],
    rows: sortedConstructors.map((c, i) => [i + 1, c.team, c.wins, c.podiums, c.points, gapLabel(c.points, leaderPoints)]),
  });

  return (
    // Fills its grid cell so the table body (not the whole component) is what scrolls - the
    // header/tabs/search stay pinned and the bottom edge lands exactly where What Changed's does.
    <div className="flex h-full min-h-0 flex-col">
      <Tabs value={entityType} onValueChange={switchEntityType} items={ENTITY_TABS}>
        <div className="mb-4 flex shrink-0 flex-wrap items-end justify-between gap-4">
          <div>
            <p id={championshipLabelId} className="text-caption font-semibold uppercase tracking-[0.18em] text-tertiary">Championship</p>
            <div className="mt-2.5">
              <TabList aria-labelledby={championshipLabelId} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canFilterFavorites && (
              <button
                type="button"
                onClick={() => setFavoritesOnly((v) => !v)}
                aria-pressed={favoritesOnly}
                // A fixed `h-9` on both this button and the search input beside it, rather than
                // matching padding - text-xs and text-sm have different line-heights, so identical
                // padding alone still rendered two different total heights. An explicit height is
                // the only thing that's actually pixel-exact regardless of font metrics.
                className={`flex h-9 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--f1-red)] ${
                  favoritesOnly ? "border-[var(--f1-red)]/45 bg-[var(--f1-red)]/[0.09] text-white" : "border-[var(--f1-line)] text-neutral-400 hover:border-white/20 hover:text-neutral-200"
                }`}
              >
                <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--f1-red)]" />
                My favourites
              </button>
            )}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={isDrivers ? "Search drivers or teams…" : "Search teams…"}
              className="h-9 w-48 rounded-lg border border-[var(--f1-line)] bg-white/[0.02] px-3 text-sm text-white placeholder:text-tertiary focus:border-white/20 focus:outline-none"
            />
            <ExportMenu
              filename={isDrivers ? "drivers-championship" : "constructors-championship"}
              getRows={isDrivers ? driverRows : constructorRows}
              getImage={async () => tableToCanvas((isDrivers ? driverRows() : constructorRows()).columns, (isDrivers ? driverRows() : constructorRows()).rows)}
            />
          </div>
        </div>

        <TabPanels className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div ref={scrollBodyRef} className="min-h-0 flex-1 overflow-auto scroll-pt-12 scrollbar-subtle">
              {isDrivers ? (
                <Table
                  columns={driverColumns}
                  rows={sortedDrivers}
                  getRowKey={(d) => d.driver}
                  caption="Drivers' championship"
                  rowHeader="name"
                  sort={sort}
                  onSortChange={setSort}
                  expandable
                  expandedKeys={expanded ? [expanded] : []}
                  onExpandedChange={(keys) => setExpanded((keys.at(-1) as string | undefined) ?? null)}
                  renderExpanded={(d) => {
                    const i = sortedDrivers.indexOf(d);
                    return (
                      <DriverDetail
                        driver={d}
                        rivalCode={sortedDrivers[i === 0 ? 1 : i - 1]?.driver}
                        raceSummaries={raceSummaries}
                        onCompare={(rivalCode) => openCompare("drivers", d.driver, rivalCode)}
                        onProgression={() => setAnalysisTab("progression")}
                      />
                    );
                  }}
                />
              ) : (
                <Table
                  columns={constructorColumns}
                  rows={sortedConstructors}
                  getRowKey={(c) => c.team}
                  caption="Constructors' championship"
                  rowHeader="name"
                  sort={sort}
                  onSortChange={setSort}
                  expandable
                  expandedKeys={expanded ? [expanded] : []}
                  onExpandedChange={(keys) => setExpanded((keys.at(-1) as string | undefined) ?? null)}
                  renderExpanded={(c) => {
                    const i = sortedConstructors.indexOf(c);
                    return (
                      <TeamDetail
                        team={c}
                        rivalId={sortedConstructors[i === 0 ? 1 : i - 1]?.team}
                        raceSummaries={raceSummaries}
                        onCompare={(rivalId) => openCompare("constructors", c.team, rivalId)}
                        onProgression={() => setAnalysisTab("progression")}
                      />
                    );
                  }}
                />
              )}
              {emptyMessage && (
                <div className="flex min-h-[140px] items-center justify-center px-6">
                  <p className="text-center text-sm text-tertiary">{emptyMessage}</p>
                </div>
              )}
            </div>
          </div>
        </TabPanels>
      </Tabs>
    </div>
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
    <div className="surface-inset flex flex-wrap items-center gap-6 rounded-md border border-white/[0.07] bg-white/[0.02] px-5 py-4">
      <Metric label="Wins" value={driver.wins} />
      <Metric label="Podiums" value={driver.podiums} />
      <Metric label="Avg finish" value={avg !== null ? `P${avg.toFixed(1)}` : "-"} />
      {form.length > 0 && (
        <div>
          <p className="mb-1 text-caption uppercase tracking-wide text-tertiary">Recent</p>
          <div className="flex gap-1">
            {form.map((f) => (
              <span
                key={f.round}
                className={`rounded-md px-1.5 py-0.5 text-xs font-semibold ${f.position <= 3 ? "bg-[var(--f1-red)]/20 text-brand-text" : "bg-white/5 text-neutral-300"}`}
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
            className="rounded-md border border-white/10 px-3 py-1.5 text-xs font-medium text-neutral-300 transition hover:border-white/25 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--f1-red)]"
          >
            Compare
          </button>
        )}
        <button
          onClick={onProgression}
          className="rounded-md border border-white/10 px-3 py-1.5 text-xs font-medium text-neutral-300 transition hover:border-white/25 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--f1-red)]"
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
    <div className="surface-inset flex flex-wrap items-center gap-6 rounded-md border border-white/[0.07] bg-white/[0.02] px-5 py-4">
      <Metric label="Wins" value={team.wins} />
      <Metric label="Podiums" value={team.podiums} />
      <Metric label="Best-car avg finish" value={avg !== null ? `P${avg.toFixed(1)}` : "-"} />
      {form.length > 0 && (
        <div>
          <p className="mb-1 text-caption uppercase tracking-wide text-tertiary">Recent</p>
          <div className="flex gap-1">
            {form.map((f) => (
              <span
                key={f.round}
                className={`rounded-md px-1.5 py-0.5 text-xs font-semibold ${f.position <= 3 ? "bg-[var(--f1-red)]/20 text-brand-text" : "bg-white/5 text-neutral-300"}`}
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
            className="rounded-md border border-white/10 px-3 py-1.5 text-xs font-medium text-neutral-300 transition hover:border-white/25 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--f1-red)]"
          >
            Compare
          </button>
        )}
        <button
          onClick={onProgression}
          className="rounded-md border border-white/10 px-3 py-1.5 text-xs font-medium text-neutral-300 transition hover:border-white/25 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--f1-red)]"
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
      <p className="text-caption uppercase tracking-wide text-tertiary">{label}</p>
      <p className="font-mono text-sm font-semibold tabular-nums text-white">{value}</p>
    </div>
  );
}
