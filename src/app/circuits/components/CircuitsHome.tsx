"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CircuitCanvas } from "@/components/circuit/CircuitCanvas";
import { circuitHref } from "@/lib/routes";
import { formatLapTime } from "@/lib/format";
import { teamColor } from "@/lib/teamColors";
import { nodeStatus } from "./nodeStatus";
import { CircuitApexScope } from "./ai/CircuitApexScope";
import { CircuitApexTake } from "./ai/CircuitApexTake";
import { TabList, Tabs } from "@/components/ui/Tabs";
import type { CircuitExplorerEntry } from "../services/circuits.service";

type Filter = "all" | "raced" | "to-come" | "favourites";

const BRAND = "#e10600";

const dateOf = (iso: string | null) => (iso ? new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) : "Date TBC");
const inDays = (d: number | null) => (d === null ? null : d <= 0 ? "This weekend" : d === 1 ? "Tomorrow" : `In ${d} days`);

/**
 * The circuits home, built for browsing (audit P1: cards for browsing). The next race leads - its circuit, when, the
 * forecast and its key figures - then every circuit on the calendar as a card in season order: its shape, the date,
 * and who won there this year or how long until it's raced. Filters narrow the grid; every card opens its circuit.
 */
export function CircuitsHome({
  entries,
  favoriteTracks,
  year,
  completedCount,
  remainingCount,
}: {
  entries: CircuitExplorerEntry[];
  favoriteTracks: string[];
  year: number;
  completedCount: number;
  remainingCount: number;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const next = entries.find((e) => nodeStatus(e.race) === "current") ?? null;
  const isFav = (e: CircuitExplorerEntry) => favoriteTracks.includes(e.race.circuit ?? e.race.name);
  const shown = useMemo(
    () =>
      entries.filter((e) => {
        const s = nodeStatus(e.race);
        return filter === "all" || (filter === "raced" ? s === "completed" : filter === "to-come" ? s !== "completed" : isFav(e));
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entries, filter, favoriteTracks],
  );
  const filters: { value: Filter; label: string; count: number }[] = [
    { value: "all", label: "All", count: entries.length },
    { value: "raced", label: "Raced", count: completedCount },
    { value: "to-come", label: "To come", count: remainingCount },
    ...(favoriteTracks.length ? [{ value: "favourites" as const, label: "Favourites", count: entries.filter(isFav).length }] : []),
  ];

  return (
    <>
      {next && (
        <CircuitApexScope
          location={next.race.circuit ?? next.race.name}
          circuitName={next.facts?.venueName ?? next.race.circuit ?? next.race.name}
          year={year}
          status={next.race.state}
        />
      )}

      <header className="mb-8 flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
        <div>
          <p className="text-body-sm text-secondary">{year} season</p>
          <h1 className="mt-1 text-display-lg font-bold text-primary">Circuits</h1>
        </div>
        <p className="text-body-sm text-secondary">
          <span className="font-semibold tabular text-primary">{entries.length}</span> circuits · <span className="font-semibold tabular text-primary">{completedCount}</span> raced ·{" "}
          <span className="font-semibold tabular text-primary">{remainingCount}</span> to come
        </p>
      </header>

      {next && <NextUp entry={next} year={year} />}

      <section aria-labelledby="calendar-heading" className="mt-12">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h2 id="calendar-heading" className="text-title-lg text-primary">
            The calendar
          </h2>
          <div role="group" aria-label="Show" className="flex gap-1 rounded-control border border-subtle p-1">
            {filters.map((f) => (
              <button
                key={f.value}
                type="button"
                aria-pressed={filter === f.value}
                onClick={() => setFilter(f.value)}
                className={`rounded-sm px-3 py-1 text-body-sm transition-colors duration-fast ${filter === f.value ? "bg-white/[0.08] text-primary" : "text-secondary hover:text-primary"}`}
              >
                {f.label} <span className="tabular text-tertiary">{f.count}</span>
              </button>
            ))}
          </div>
        </div>
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {shown.map((e) => (
            <li key={e.race.round}>
              <CircuitCard entry={e} isNext={e === next} favourite={isFav(e)} />
            </li>
          ))}
        </ul>
        {shown.length === 0 && <p className="text-body-sm text-secondary">Nothing here yet.</p>}
      </section>
    </>
  );
}

/** The next race, first: its circuit drawn (always), and beside it a tab for the weekend - when, the forecast and the
 * figures that matter - or Apex's read of the circuit. One card instead of a banner plus a separate Apex section. */
function NextUp({ entry, year }: { entry: CircuitExplorerEntry; year: number }) {
  const { race, facts, drawing, daysToGo } = entry;
  const href = circuitHref(race.circuit ?? race.name);
  const [tab, setTab] = useState<"weekend" | "apex">("weekend");
  return (
    <section aria-label="Next race" className="grid grid-cols-1 items-center gap-8 rounded-card bg-surface-1 p-5 sm:p-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,2fr)] lg:gap-10">
      <div className="min-w-0">{drawing ? <CircuitCanvas drawing={drawing} className="max-h-64" caption={false} lapColor={BRAND} lapSeconds={6} /> : null}</div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-caption text-brand-text">
              {race.weekendStatus === "live" ? "Live now" : "Next race"} · Round {race.round}
            </p>
            <h2 className="mt-1 text-display-md font-semibold text-primary">{race.name}</h2>
            <p className="mt-1 text-body text-secondary">{[facts?.venueName ?? race.circuit, race.country].filter(Boolean).join(", ")}</p>
          </div>
          <Tabs variant="segmented" value={tab} onValueChange={(v) => setTab(v as "weekend" | "apex")} items={[{ value: "weekend", label: "The weekend" }, { value: "apex", label: "Apex's take" }]}>
            <TabList aria-label="About the next race" />
          </Tabs>
        </div>
        <div className="mt-6 min-h-40">
          {tab === "weekend" ? (
            <div className="grid grid-cols-1 gap-8 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
              <div>
                <p className="text-title-lg font-semibold text-primary">
                  {dateOf(race.raceDate)} · <span className="text-secondary">{inDays(daysToGo) ?? "Date TBC"}</span>
                </p>
                {race.forecast && (
                  <p className="mt-1 text-body-sm text-secondary">
                    {Math.round(race.forecast.airTempC)}°C, {Math.round(race.forecast.rainProbability * 100)}% chance of rain
                  </p>
                )}
                <Link
                  href={href}
                  className="mt-6 inline-flex items-center gap-1 rounded-control bg-brand px-4 py-2 text-body-sm font-semibold text-white transition-colors hover:bg-brand/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                >
                  Open the circuit →
                </Link>
              </div>
              {facts && (
                <dl className="grid min-w-0 grid-cols-2 gap-x-6 gap-y-5 md:border-l md:border-subtle md:pl-8">
                  <Fact label="Length · turns" value={`${facts.lengthKm.toFixed(3)} km · ${facts.turns}`} />
                  <Fact label="Type" value={facts.trackType === "street" ? `Street${facts.nightRace ? ", at night" : ""}` : facts.trackType === "hybrid" ? "Hybrid" : "Permanent"} />
                  {facts.lapRecord && <Fact label={`Lap record · ${facts.lapRecord.driverName}, ${facts.lapRecord.year}`} value={formatLapTime(facts.lapRecord.timeSec)} />}
                  <Fact label="First Grand Prix" value={String(facts.firstGrandPrix)} />
                </dl>
              )}
            </div>
          ) : (
            <CircuitApexTake location={race.circuit ?? race.name} year={year} status={race.state} bare />
          )}
        </div>
      </div>
    </section>
  );
}

/** One round on the calendar: the circuit's shape, when, and its result or how long to go. */
function CircuitCard({ entry, isNext, favourite }: { entry: CircuitExplorerEntry; isNext: boolean; favourite: boolean }) {
  const { race, facts, drawing, hasReplay, daysToGo } = entry;
  const status = nodeStatus(race);
  const winner = race.results.find((r) => r.finishPosition === 1);
  const cancelled = race.weekendStatus === "cancelled";
  return (
    <Link
      href={circuitHref(race.circuit ?? race.name)}
      className={`group flex h-full flex-col rounded-card border bg-surface-1 p-4 transition-colors duration-fast hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${isNext ? "border-brand/60" : "border-transparent"}`}
    >
      <div className="flex items-baseline justify-between gap-2 text-caption">
        <span className="tabular text-secondary">
          Round {race.round} · {dateOf(race.raceDate)}
        </span>
        <span className={isNext ? "text-brand-text" : status === "completed" ? "text-secondary" : "text-tertiary"}>
          {cancelled ? "Cancelled" : isNext ? "Next" : status === "completed" ? "Raced" : (inDays(daysToGo) ?? "To come")}
        </span>
      </div>
      <div className="my-3 flex h-28 items-center justify-center">
        {drawing ? (
          <CircuitCanvas
            drawing={{ ...drawing, turns: [] }}
            className="max-h-28"
            caption={false}
            // The car is the winner's team colour once the race is run, red for the next one, and a faint white
            // for the rest of the calendar - colour that says where the season stands.
            lapColor={cancelled ? null : status === "completed" && winner ? teamColor(winner.team) : isNext ? BRAND : "rgb(255 255 255 / 0.5)"}
            lapSeconds={status === "completed" || isNext ? 6 : 10}
            lapDelay={(race.round * 1.37) % 6}
          />
        ) : (
          <span className="text-caption text-tertiary">No drawing yet</span>
        )}
      </div>
      <p className="truncate text-body font-semibold text-primary">
        {race.name}
        {favourite && <span className="ml-1.5 text-caption text-secondary">★</span>}
      </p>
      <p className="truncate text-caption text-secondary">{[facts?.venueName ?? race.circuit, race.country].filter(Boolean).join(", ")}</p>
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-subtle pt-3 text-body-sm">
        {status === "completed" && winner ? (
          <span className="flex min-w-0 items-center gap-2">
            <span aria-hidden className="h-3.5 w-0.5 shrink-0" style={{ backgroundColor: teamColor(winner.team) }} />
            <span className="truncate text-primary">{winner.driverName}</span>
            <span className="shrink-0 text-caption text-tertiary">won{winner.grid ? ` from P${winner.grid}` : ""}</span>
          </span>
        ) : (
          <span className="text-secondary">{facts ? `${facts.lengthKm.toFixed(3)} km · ${facts.turns} turns` : " "}</span>
        )}
        {hasReplay && <span className="shrink-0 rounded-sm border border-subtle px-1.5 py-0.5 text-caption text-secondary">Replay</span>}
      </div>
    </Link>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-caption text-secondary" title={label}>
        {label}
      </dt>
      <dd className="mt-1 text-body font-semibold tabular text-primary">{value}</dd>
    </div>
  );
}
