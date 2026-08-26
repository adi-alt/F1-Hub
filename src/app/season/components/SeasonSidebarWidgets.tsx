"use client";

import { Fragment, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { EntityAvatar } from "@/components/EntityAvatar";
import { staggerItem } from "@/components/motion/variants";
import { postFavorite } from "@/lib/favorites";
import type { Fact } from "@/lib/personalization";
import type { ConstructorStandingRow, DriverStandingRow } from "../services/season.service";

const VISIBLE_FACTS = 4;

function gapLabel(points: number, leaderPoints: number): string {
  return points >= leaderPoints ? "—" : `-${leaderPoints - points}`;
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
 * to the label — the header is its own bordered-off div, not just a paragraph floating above the
 * body content. */
function RailCard({ label, action, children }: { label: string; action?: ReactNode; children: ReactNode }) {
  return (
    <motion.div
      initial="hidden"
      whileInView="show"
      viewport={{ once: true }}
      variants={staggerItem}
      className="glass backdrop-blur-2xl overflow-hidden rounded-xl border border-[var(--f1-line)]"
    >
      <div className="flex items-center justify-between border-b border-[var(--f1-line)] px-4 py-2.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-600">{label}</p>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </motion.div>
  );
}

/** Left rail — personalized to whichever driver/team the signed-in user has favorited (the one
 * thing this section was missing: everyone saw the exact same read-only tables). No favorites
 * yet? The widget itself becomes the way to set one, quick-favorite chips right here rather than
 * sending the user back up to the table. */
export function YourSeasonWidget({
  drivers,
  constructors,
  favoriteDriverIds,
  favoriteTeamIds,
}: {
  drivers: DriverStandingRow[];
  constructors: ConstructorStandingRow[];
  favoriteDriverIds: string[];
  favoriteTeamIds: string[];
}) {
  const [favDrivers, setFavDrivers] = useState(() => new Set(favoriteDriverIds));
  const [favTeams, setFavTeams] = useState(() => new Set(favoriteTeamIds));
  const leaderPoints = drivers.length ? Math.max(...drivers.map((d) => d.points)) : 0;

  const favoriteDriver = drivers.find((d) => d.favoriteId && favDrivers.has(d.favoriteId));
  const favoriteTeam = constructors.find((c) => favTeams.has(c.favoriteId));

  function quickFavoriteDriver(d: DriverStandingRow) {
    if (!d.favoriteId) return;
    setFavDrivers((prev) => new Set(prev).add(d.favoriteId!));
    postFavorite("driver", d.favoriteId, true).catch(() => {
      setFavDrivers((prev) => {
        const next = new Set(prev);
        next.delete(d.favoriteId!);
        return next;
      });
    });
  }

  function quickFavoriteTeam(c: ConstructorStandingRow) {
    setFavTeams((prev) => new Set(prev).add(c.favoriteId));
    postFavorite("team", c.favoriteId, true).catch(() => {
      setFavTeams((prev) => {
        const next = new Set(prev);
        next.delete(c.favoriteId);
        return next;
      });
    });
  }

  if (!favoriteDriver && !favoriteTeam) {
    const driverCandidates = drivers.filter((d) => d.favoriteId).slice(0, 3);
    const teamCandidates = constructors.slice(0, 3);
    return (
      <RailCard label="Your season">
        <p className="mb-3 text-sm text-neutral-600">Pick a favorite to track them here instead of hunting through the table.</p>
        <div className="flex flex-col gap-2">
          {driverCandidates.map((d) => (
            <button key={d.driver} onClick={() => quickFavoriteDriver(d)} className="text-left">
              <PointerCard className="flex items-center gap-2.5 text-sm text-neutral-700 transition hover:bg-black/[0.06] hover:text-neutral-900">
                <EntityAvatar imageUrl={d.headshotUrl} name={d.driverName} size={24} fit="cover" />
                {d.driverName}
              </PointerCard>
            </button>
          ))}
        </div>
        <div className="mt-2 flex flex-col gap-2">
          {teamCandidates.map((c) => (
            <button key={c.team} onClick={() => quickFavoriteTeam(c)} className="text-left">
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
        </RailCard>
      )}
    </div>
  );
}

/** Right rail — real computed facts (see buildSeasonFacts in season.service.ts, which returns
 * every candidate that applies, already shuffled) plus a genuinely interactive head-to-head
 * comparator: pick any two drivers from the full standings and see them compared, computed
 * client-side from data already on the page (no new fetch, no backend).
 *
 * `facts` arrives pre-shuffled from the server, so slicing it for the *initial* visible set is
 * deterministic (server and first client render agree - no hydration mismatch). The shuffle
 * button re-picks a fresh subset client-side, but only from a click handler, never from render -
 * that's what keeps this safe (see pickRandom's own note). */
export function SeasonPulseWidget({ facts, drivers }: { facts: Fact[]; drivers: DriverStandingRow[] }) {
  const [visibleFacts, setVisibleFacts] = useState(() => facts.slice(0, VISIBLE_FACTS));
  const [aCode, setACode] = useState(drivers[0]?.driver ?? "");
  const [bCode, setBCode] = useState(drivers[1]?.driver ?? "");
  const a = drivers.find((d) => d.driver === aCode);
  const b = drivers.find((d) => d.driver === bCode);

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
                className="rounded-full p-1.5 text-neutral-600 transition hover:bg-black/5 hover:text-neutral-900"
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
          <div className="flex items-center gap-2">
            <select
              value={aCode}
              onChange={(e) => setACode(e.target.value)}
              className="w-full rounded-lg border border-[var(--f1-line)] bg-neutral-100 px-2 py-1.5 text-sm text-neutral-900"
            >
              {drivers.map((d) => (
                <option key={d.driver} value={d.driver}>
                  {d.driverName}
                </option>
              ))}
            </select>
            <span className="text-xs text-neutral-600">vs</span>
            <select
              value={bCode}
              onChange={(e) => setBCode(e.target.value)}
              className="w-full rounded-lg border border-[var(--f1-line)] bg-neutral-100 px-2 py-1.5 text-sm text-neutral-900"
            >
              {drivers.map((d) => (
                <option key={d.driver} value={d.driver}>
                  {d.driverName}
                </option>
              ))}
            </select>
          </div>
          {a && b && (
            <div className="mt-3 flex flex-col gap-2">
              <div className="grid grid-cols-[1fr_2.5rem_2.5rem] gap-2 px-1 text-[10px] uppercase tracking-wide text-neutral-600">
                <span />
                <span className="text-center">{a.driver}</span>
                <span className="text-center">{b.driver}</span>
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
          )}
        </RailCard>
      )}
    </div>
  );
}
