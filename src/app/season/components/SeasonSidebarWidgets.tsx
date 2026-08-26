"use client";

import { Fragment, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { EntityAvatar } from "@/components/EntityAvatar";
import { staggerItem } from "@/components/motion/variants";
import { postFavorite } from "@/lib/favorites";
import type { Fact } from "@/lib/personalization";
import type { ConstructorStandingRow, DriverStandingRow } from "../services/season.service";

function gapLabel(points: number, leaderPoints: number): string {
  return points >= leaderPoints ? "—" : `-${leaderPoints - points}`;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="font-mono text-sm tabular-nums text-white">{value}</p>
    </div>
  );
}

function RailCard({ label, children }: { label: string; children: ReactNode }) {
  return (
    <motion.div
      initial="hidden"
      whileInView="show"
      viewport={{ once: true }}
      variants={staggerItem}
      className="rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/40 p-4"
    >
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">{label}</p>
      {children}
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
        <p className="mb-3 text-sm text-neutral-400">Pick a favorite to track them here instead of hunting through the table.</p>
        <div className="flex flex-col gap-1">
          {driverCandidates.map((d) => (
            <button
              key={d.driver}
              onClick={() => quickFavoriteDriver(d)}
              className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm text-neutral-300 transition hover:bg-white/5 hover:text-white"
            >
              <EntityAvatar imageUrl={d.headshotUrl} name={d.driverName} size={24} fit="cover" />
              {d.driverName}
            </button>
          ))}
        </div>
        <div className="mt-2 flex flex-col gap-1 border-t border-[var(--f1-line)] pt-2">
          {teamCandidates.map((c) => (
            <button
              key={c.team}
              onClick={() => quickFavoriteTeam(c)}
              className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm text-neutral-300 transition hover:bg-white/5 hover:text-white"
            >
              <EntityAvatar imageUrl={c.logoUrl} name={c.team} size={24} shape="square" fit="contain" />
              {c.team}
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
              <p className="font-semibold text-white">{favoriteDriver.driverName}</p>
              <p className="text-xs text-neutral-500">{favoriteDriver.team}</p>
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
            <p className="font-semibold text-white">{favoriteTeam.team}</p>
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

/** Right rail — real computed facts (see buildSeasonFacts in season.service.ts) plus a genuinely
 * interactive head-to-head comparator instead of another read-only list: pick any two drivers
 * from the full standings and see them compared, computed client-side from data already on the
 * page (no new fetch, no backend). */
export function SeasonPulseWidget({ facts, drivers }: { facts: Fact[]; drivers: DriverStandingRow[] }) {
  const [aCode, setACode] = useState(drivers[0]?.driver ?? "");
  const [bCode, setBCode] = useState(drivers[1]?.driver ?? "");
  const a = drivers.find((d) => d.driver === aCode);
  const b = drivers.find((d) => d.driver === bCode);

  return (
    <div className="space-y-4">
      {facts.length > 0 && (
        <RailCard label="Season pulse">
          <ul className="space-y-3">
            {facts.map((fact) => (
              <li key={fact.text} className="flex items-start gap-2.5">
                <span className="text-base" aria-hidden>
                  {fact.icon}
                </span>
                <p className="text-sm text-neutral-300">{fact.text}</p>
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
              className="w-full rounded-lg border border-[var(--f1-line)] bg-[var(--f1-carbon)] px-2 py-1.5 text-sm text-white"
            >
              {drivers.map((d) => (
                <option key={d.driver} value={d.driver}>
                  {d.driverName}
                </option>
              ))}
            </select>
            <span className="text-xs text-neutral-500">vs</span>
            <select
              value={bCode}
              onChange={(e) => setBCode(e.target.value)}
              className="w-full rounded-lg border border-[var(--f1-line)] bg-[var(--f1-carbon)] px-2 py-1.5 text-sm text-white"
            >
              {drivers.map((d) => (
                <option key={d.driver} value={d.driver}>
                  {d.driverName}
                </option>
              ))}
            </select>
          </div>
          {a && b && (
            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
              <div />
              <p className="text-[10px] uppercase tracking-wide text-neutral-500">{a.driver}</p>
              <p className="text-[10px] uppercase tracking-wide text-neutral-500">{b.driver}</p>
              {([
                ["Points", a.points, b.points],
                ["Wins", a.wins, b.wins],
                ["Podiums", a.podiums, b.podiums],
              ] as const).map(([label, av, bv]) => (
                <Fragment key={label}>
                  <p className="text-left text-neutral-500">{label}</p>
                  <p className={`font-mono tabular-nums ${av > bv ? "font-semibold text-[var(--f1-red)]" : "text-white"}`}>{av}</p>
                  <p className={`font-mono tabular-nums ${bv > av ? "font-semibold text-[var(--f1-red)]" : "text-white"}`}>{bv}</p>
                </Fragment>
              ))}
            </div>
          )}
        </RailCard>
      )}
    </div>
  );
}
