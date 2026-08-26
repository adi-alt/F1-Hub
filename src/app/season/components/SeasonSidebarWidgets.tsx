"use client";

import Link from "next/link";
import { Fragment, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { EntityAvatar } from "@/components/EntityAvatar";
import { staggerItem } from "@/components/motion/variants";
import { SearchableSelect, type SearchableOption } from "@/components/ui/SearchableSelect";
import type { Fact } from "@/lib/personalization";
import type { NewsItem } from "@/lib/supabase/news";
import { newsHref } from "@/lib/routes";
import { useSeasonFavorites } from "./SeasonFavoritesContext";
import type { ConstructorStandingRow, DriverStandingRow, TrackPerformance } from "../services/season.service";

const VISIBLE_FACTS = 5;

function gapLabel(points: number, leaderPoints: number): string {
  return points >= leaderPoints ? "—" : `-${leaderPoints - points}`;
}

function shortLabel(name: string): string {
  return name.slice(0, 3).toUpperCase();
}

// Fisher-Yates, same as season.service.ts's own shuffled() — this one runs client-side, only ever
// from the shuffle button's click handler, never during render (see SeasonPulseWidget).
function pickRandom<T>(items: T[], count: number): T[] {
  const list = [...items];
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list.slice(0, count);
}

function recentForm(code: string, trackPerformance: TrackPerformance[], count = 5): { trackShort: string; position: number }[] {
  return trackPerformance
    .filter((t) => code in t.driverPositions)
    .slice(-count)
    .map((t) => ({ trackShort: t.trackShort, position: t.driverPositions[code] }));
}

function bestDriverResult(code: string, trackPerformance: TrackPerformance[]): { trackShort: string; position: number } | null {
  let best: { trackShort: string; position: number } | null = null;
  for (const t of trackPerformance) {
    const pos = t.driverPositions[code];
    if (pos !== undefined && (!best || pos < best.position)) best = { trackShort: t.trackShort, position: pos };
  }
  return best;
}

function bestTeamResult(team: string, trackPerformance: TrackPerformance[]): { trackShort: string; position: number } | null {
  let best: { trackShort: string; position: number } | null = null;
  for (const t of trackPerformance) {
    const pos = t.teamBestPositions[team];
    if (pos !== undefined && (!best || pos < best.position)) best = { trackShort: t.trackShort, position: pos };
  }
  return best;
}

function driverContributionSplit(team: string, drivers: DriverStandingRow[]): { name: string; points: number; pct: number }[] {
  const teamDrivers = drivers.filter((d) => d.team === team);
  const total = teamDrivers.reduce((sum, d) => sum + d.points, 0);
  return teamDrivers.map((d) => ({ name: d.driverName, points: d.points, pct: total > 0 ? Math.round((d.points / total) * 100) : 0 }));
}

/** One "pointer" — a fact, a stat, a candidate to favorite — as its own bordered card instead of
 * a plain list row, per your ask. */
function PointerCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-[var(--f1-line)] bg-black/[0.03] p-3 ${className}`}>{children}</div>;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <PointerCard>
      <p className="text-[10px] uppercase tracking-wide text-neutral-600">{label}</p>
      <p className="font-mono text-sm tabular-nums text-neutral-900">{value}</p>
    </PointerCard>
  );
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M4.5 10a5.5 5.5 0 0 1 9.5-3.8M15.5 10a5.5 5.5 0 0 1-9.5 3.8" />
      <path d="M14.5 3v3.5H11M5.5 17v-3.5H9" />
    </svg>
  );
}

/** `action` is a small control (the shuffle button, say) that sits in the header's own row, next
 * to the label. The header is a zinc-dark strip (matching the tables' own header, see
 * StandingsTables.tsx's HEADER_CLASS) — deliberately a different, opaque material from the white
 * glass body beneath it, not just a paragraph floating above it with no separation at all. */
function RailCard({ label, action, children }: { label: string; action?: ReactNode; children: ReactNode }) {
  return (
    <motion.div
      initial="hidden"
      whileInView="show"
      viewport={{ once: true }}
      variants={staggerItem}
      className="glass backdrop-blur-2xl overflow-hidden rounded-xl border border-[var(--f1-line)]"
    >
      <div className="flex items-center justify-between bg-[var(--f1-carbon)] px-4 py-2.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">{label}</p>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </motion.div>
  );
}

/** Left rail — personalized to whichever driver/team the signed-in user has favorited (the one
 * thing this section was missing: everyone saw the exact same read-only tables). No favorites
 * yet? The widget itself becomes the way to set one, quick-favorite chips right here rather than
 * sending the user back up to the table. Favorite state comes from SeasonFavoritesContext, shared
 * with the standings tables — toggling a favorite anywhere updates here immediately, no refresh. */
export function YourSeasonWidget({
  drivers,
  constructors,
  trackPerformance,
}: {
  drivers: DriverStandingRow[];
  constructors: ConstructorStandingRow[];
  trackPerformance: TrackPerformance[];
}) {
  const { favDrivers, favTeams, toggleDriver, toggleTeam } = useSeasonFavorites();
  const leaderPoints = drivers.length ? Math.max(...drivers.map((d) => d.points)) : 0;

  const favoriteDriver = drivers.find((d) => d.favoriteId && favDrivers.has(d.favoriteId));
  const favoriteTeam = constructors.find((c) => favTeams.has(c.favoriteId));

  if (!favoriteDriver && !favoriteTeam) {
    const driverCandidates = drivers.filter((d) => d.favoriteId).slice(0, 3);
    const teamCandidates = constructors.slice(0, 3);
    return (
      <RailCard label="Your season">
        <p className="mb-3 text-sm text-neutral-600">Pick a favorite to track them here instead of hunting through the table.</p>
        <div className="flex flex-col gap-2">
          {driverCandidates.map((d) => (
            <button key={d.driver} onClick={() => toggleDriver(d.favoriteId!)} className="text-left">
              <PointerCard className="flex items-center gap-2.5 text-sm text-neutral-700 transition hover:bg-black/[0.06] hover:text-neutral-900">
                <EntityAvatar imageUrl={d.headshotUrl} name={d.driverName} size={24} fit="cover" />
                {d.driverName}
              </PointerCard>
            </button>
          ))}
        </div>
        <div className="mt-2 flex flex-col gap-2">
          {teamCandidates.map((c) => (
            <button key={c.team} onClick={() => toggleTeam(c.favoriteId)} className="text-left">
              <PointerCard className="flex items-center gap-2.5 text-sm text-neutral-700 transition hover:bg-black/[0.06] hover:text-neutral-900">
                <EntityAvatar imageUrl={c.logoUrl} name={c.team} size={24} shape="square" fit="contain" />
                {c.team}
              </PointerCard>
            </button>
          ))}
        </div>
      </RailCard>
    );
  }

  const teammate = favoriteDriver ? drivers.find((d) => d.team === favoriteDriver.team && d.driver !== favoriteDriver.driver) : undefined;
  const form = favoriteDriver ? recentForm(favoriteDriver.driver, trackPerformance) : [];
  const bestDriver = favoriteDriver ? bestDriverResult(favoriteDriver.driver, trackPerformance) : null;
  const bestTeam = favoriteTeam ? bestTeamResult(favoriteTeam.team, trackPerformance) : null;
  const contribution = favoriteTeam ? driverContributionSplit(favoriteTeam.team, drivers) : [];

  return (
    <div className="space-y-4">
      {favoriteDriver && (
        <RailCard label="Your driver">
          <div className="flex items-center gap-3">
            <EntityAvatar imageUrl={favoriteDriver.headshotUrl} name={favoriteDriver.driverName} size={40} fit="cover" />
            <div>
              <p className="font-semibold text-neutral-900">{favoriteDriver.driverName}</p>
              <p className="text-xs text-neutral-600">{favoriteDriver.team}</p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Stat label="Position" value={`P${drivers.indexOf(favoriteDriver) + 1}`} />
            <Stat label="Points" value={favoriteDriver.points} />
            <Stat label="Gap to lead" value={gapLabel(favoriteDriver.points, leaderPoints)} />
            <Stat label="Wins" value={favoriteDriver.wins} />
          </div>

          {form.length > 0 && (
            <div className="mt-3">
              <p className="mb-1.5 text-[10px] uppercase tracking-wide text-neutral-600">Recent form</p>
              <div className="flex gap-1.5">
                {form.map((f, i) => (
                  <div key={i} className="flex-1 rounded-md border border-[var(--f1-line)] bg-black/[0.03] py-1.5 text-center">
                    <p className="text-[9px] text-neutral-600">{f.trackShort}</p>
                    <p className={`text-sm font-semibold ${f.position <= 3 ? "text-[var(--f1-red)]" : "text-neutral-900"}`}>P{f.position}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {bestDriver && (
            <PointerCard className="mt-3 text-sm text-neutral-700">
              Best result: <span className="font-semibold text-neutral-900">P{bestDriver.position}</span> at {bestDriver.trackShort}
            </PointerCard>
          )}

          {teammate && (
            <PointerCard className="mt-2 text-sm text-neutral-700">
              {favoriteDriver.points >= teammate.points ? "Leading" : "Trailing"} teammate{" "}
              <span className="font-semibold text-neutral-900">{teammate.driverName}</span> by{" "}
              <span className="font-semibold text-neutral-900">{Math.abs(favoriteDriver.points - teammate.points)}</span> pts
            </PointerCard>
          )}
        </RailCard>
      )}

      {favoriteTeam && (
        <RailCard label="Your team">
          <div className="flex items-center gap-3">
            <EntityAvatar imageUrl={favoriteTeam.logoUrl} name={favoriteTeam.team} size={36} shape="square" fit="contain" />
            <p className="font-semibold text-neutral-900">{favoriteTeam.team}</p>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Stat label="Position" value={`P${constructors.indexOf(favoriteTeam) + 1}`} />
            <Stat label="Points" value={favoriteTeam.points} />
            <Stat label="Wins" value={favoriteTeam.wins} />
            <Stat label="Podiums" value={favoriteTeam.podiums} />
          </div>

          {contribution.length > 0 && (
            <div className="mt-3">
              <p className="mb-1.5 text-[10px] uppercase tracking-wide text-neutral-600">Driver contribution</p>
              <div className="flex flex-col gap-1.5">
                {contribution.map((c) => (
                  <PointerCard key={c.name} className="flex items-center justify-between text-sm">
                    <span className="text-neutral-700">{c.name}</span>
                    <span className="font-mono tabular-nums text-neutral-900">
                      {c.points} pts <span className="text-neutral-600">({c.pct}%)</span>
                    </span>
                  </PointerCard>
                ))}
              </div>
            </div>
          )}

          {bestTeam && (
            <PointerCard className="mt-3 text-sm text-neutral-700">
              Best result: <span className="font-semibold text-neutral-900">P{bestTeam.position}</span> at {bestTeam.trackShort}
            </PointerCard>
          )}
        </RailCard>
      )}
    </div>
  );
}

/** Right rail — real computed facts (see buildSeasonFacts in season.service.ts, which returns
 * every candidate that applies, already shuffled) plus a genuinely interactive head-to-head
 * comparator: pick any two drivers *or* two teams and see them compared, including a per-track
 * breakdown, computed client-side from data already on the page (no new fetch, no backend).
 *
 * `facts` arrives pre-shuffled from the server, so slicing it for the *initial* visible set is
 * deterministic (server and first client render agree - no hydration mismatch). The shuffle
 * button re-picks a fresh subset client-side, but only from a click handler, never from render. */
export function SeasonPulseWidget({
  facts,
  drivers,
  constructors,
  trackPerformance,
}: {
  facts: Fact[];
  drivers: DriverStandingRow[];
  constructors: ConstructorStandingRow[];
  trackPerformance: TrackPerformance[];
}) {
  const [visibleFacts, setVisibleFacts] = useState(() => facts.slice(0, VISIBLE_FACTS));
  const [mode, setMode] = useState<"drivers" | "teams">("drivers");
  const [aCode, setACode] = useState(drivers[0]?.driver ?? "");
  const [bCode, setBCode] = useState(drivers[1]?.driver ?? "");
  const [aTeam, setATeam] = useState(constructors[0]?.team ?? "");
  const [bTeam, setBTeam] = useState(constructors[1]?.team ?? "");

  const driverOptions: SearchableOption[] = drivers.map((d) => ({ value: d.driver, label: d.driverName }));
  const teamOptions: SearchableOption[] = constructors.map((c) => ({ value: c.team, label: c.team }));

  const a = mode === "drivers" ? drivers.find((d) => d.driver === aCode) : constructors.find((c) => c.team === aTeam);
  const b = mode === "drivers" ? drivers.find((d) => d.driver === bCode) : constructors.find((c) => c.team === bTeam);
  const aKey = mode === "drivers" ? aCode : aTeam;
  const bKey = mode === "drivers" ? bCode : bTeam;
  const aLabel = mode === "drivers" ? aCode : shortLabel(aTeam);
  const bLabel = mode === "drivers" ? bCode : shortLabel(bTeam);

  const trackRows = trackPerformance
    .map((t) => ({
      trackShort: t.trackShort,
      aPos: mode === "drivers" ? t.driverPositions[aKey] : t.teamBestPositions[aKey],
      bPos: mode === "drivers" ? t.driverPositions[bKey] : t.teamBestPositions[bKey],
    }))
    .filter((r) => r.aPos !== undefined || r.bPos !== undefined);

  return (
    <div className="space-y-4">
      {visibleFacts.length > 0 && (
        <RailCard
          label="Season pulse"
          action={
            facts.length > VISIBLE_FACTS && (
              <button
                onClick={() => setVisibleFacts(pickRandom(facts, VISIBLE_FACTS))}
                aria-label="Show different facts"
                className="rounded-full p-1.5 text-neutral-400 transition hover:bg-white/10 hover:text-white"
              >
                <RefreshIcon />
              </button>
            )
          }
        >
          <ul className="flex flex-col gap-2">
            {visibleFacts.map((fact) => (
              <li key={fact.text}>
                <PointerCard className="flex items-start gap-2.5">
                  <span className="text-base" aria-hidden>
                    {fact.icon}
                  </span>
                  <p className="text-sm text-neutral-700">{fact.text}</p>
                </PointerCard>
              </li>
            ))}
          </ul>
        </RailCard>
      )}

      {drivers.length >= 2 && (
        <RailCard label="Head-to-head">
          <div className="mb-3 flex gap-1.5">
            {(["drivers", "teams"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 rounded-full py-1 text-xs font-medium capitalize transition ${
                  mode === m ? "bg-[var(--f1-red)] text-white" : "bg-black/[0.04] text-neutral-600 hover:bg-black/[0.08]"
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            {mode === "drivers" ? (
              <>
                <SearchableSelect
                  value={aCode}
                  onChange={setACode}
                  options={driverOptions}
                  placeholder="Driver A"
                  className="w-full rounded-lg border border-[var(--f1-line)] bg-neutral-100 px-2 py-1.5 text-sm text-neutral-900"
                />
                <span className="text-xs text-neutral-600">vs</span>
                <SearchableSelect
                  value={bCode}
                  onChange={setBCode}
                  options={driverOptions}
                  placeholder="Driver B"
                  className="w-full rounded-lg border border-[var(--f1-line)] bg-neutral-100 px-2 py-1.5 text-sm text-neutral-900"
                />
              </>
            ) : (
              <>
                <SearchableSelect
                  value={aTeam}
                  onChange={setATeam}
                  options={teamOptions}
                  placeholder="Team A"
                  className="w-full rounded-lg border border-[var(--f1-line)] bg-neutral-100 px-2 py-1.5 text-sm text-neutral-900"
                />
                <span className="text-xs text-neutral-600">vs</span>
                <SearchableSelect
                  value={bTeam}
                  onChange={setBTeam}
                  options={teamOptions}
                  placeholder="Team B"
                  className="w-full rounded-lg border border-[var(--f1-line)] bg-neutral-100 px-2 py-1.5 text-sm text-neutral-900"
                />
              </>
            )}
          </div>

          {a && b && (
            <>
              <div className="mt-3 flex flex-col gap-2">
                <div className="grid grid-cols-[1fr_2.5rem_2.5rem] gap-2 px-1 text-[10px] uppercase tracking-wide text-neutral-600">
                  <span />
                  <span className="text-center">{aLabel}</span>
                  <span className="text-center">{bLabel}</span>
                </div>
                {(
                  [
                    ["Points", a.points, b.points],
                    ["Wins", a.wins, b.wins],
                    ["Podiums", a.podiums, b.podiums],
                  ] as const
                ).map(([label, av, bv]) => (
                  <Fragment key={label}>
                    <PointerCard className="grid grid-cols-[1fr_2.5rem_2.5rem] items-center gap-2 text-sm">
                      <span className="text-neutral-600">{label}</span>
                      <span className={`text-center font-mono tabular-nums ${av > bv ? "font-semibold text-[var(--f1-red)]" : "text-neutral-900"}`}>{av}</span>
                      <span className={`text-center font-mono tabular-nums ${bv > av ? "font-semibold text-[var(--f1-red)]" : "text-neutral-900"}`}>{bv}</span>
                    </PointerCard>
                  </Fragment>
                ))}
              </div>

              {trackRows.length > 0 && (
                <div className="mt-3">
                  <p className="mb-1.5 text-[10px] uppercase tracking-wide text-neutral-600">By track — finishing position</p>
                  <div className="max-h-48 overflow-y-auto rounded-lg border border-[var(--f1-line)]">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-[var(--f1-carbon)] text-[10px] uppercase text-neutral-400">
                        <tr>
                          <th className="px-2 py-1.5 text-left">Track</th>
                          <th className="px-2 py-1.5 text-center">{aLabel}</th>
                          <th className="px-2 py-1.5 text-center">{bLabel}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--f1-line)]">
                        {trackRows.map((r, i) => (
                          <tr key={i}>
                            <td className="px-2 py-1.5 text-neutral-700">{r.trackShort}</td>
                            <td
                              className={`px-2 py-1.5 text-center font-mono tabular-nums ${
                                r.aPos !== undefined && r.bPos !== undefined && r.aPos < r.bPos ? "font-semibold text-[var(--f1-red)]" : "text-neutral-900"
                              }`}
                            >
                              {r.aPos ?? "—"}
                            </td>
                            <td
                              className={`px-2 py-1.5 text-center font-mono tabular-nums ${
                                r.aPos !== undefined && r.bPos !== undefined && r.bPos < r.aPos ? "font-semibold text-[var(--f1-red)]" : "text-neutral-900"
                              }`}
                            >
                              {r.bPos ?? "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </RailCard>
      )}
    </div>
  );
}

/** Left rail, alongside "Your season" — just titles (see /news for the full section + detail
 * view with the actual description and the direct Formula1.com source link). Each title is its
 * own pointer-card, same as everywhere else in these rails. */
export function NewsWidget({ items }: { items: NewsItem[] }) {
  if (items.length === 0) return null;
  return (
    <RailCard label="F1 news">
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.guid}>
            <Link href={newsHref(item.guid)}>
              <PointerCard className="text-sm text-neutral-700 transition hover:bg-black/[0.06] hover:text-neutral-900">{item.title}</PointerCard>
            </Link>
          </li>
        ))}
      </ul>
      <Link href="/news" className="mt-3 block text-center text-xs text-neutral-600 transition hover:text-neutral-900">
        See all news →
      </Link>
    </RailCard>
  );
}
