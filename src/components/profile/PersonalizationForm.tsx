"use client";

import { useState } from "react";
import type { ConstructorStanding, DriverStanding } from "@/lib/standings";

type Entrant = { driver: string; driverName: string; team: string };

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
        active
          ? "bg-[var(--f1-red)] text-white"
          : "border border-[var(--f1-line)] text-neutral-300 hover:border-white/30 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

export function PersonalizationForm({
  entrants,
  driverStandings,
  constructorStandings,
  initialFavoriteDrivers,
  initialFavoriteTeams,
}: {
  entrants: Entrant[];
  driverStandings: DriverStanding[];
  constructorStandings: ConstructorStanding[];
  initialFavoriteDrivers?: string[];
  initialFavoriteTeams?: string[];
}) {
  const [favoriteDrivers, setFavoriteDrivers] = useState<string[]>(initialFavoriteDrivers ?? []);
  const [favoriteTeams, setFavoriteTeams] = useState<string[]>(initialFavoriteTeams ?? []);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const teams = [...new Set(entrants.map((e) => e.team))].sort();

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ favoriteDrivers, favoriteTeams }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError("Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <label className="mb-2 block text-sm font-medium text-neutral-300">Favorite drivers</label>
        <div className="flex flex-wrap gap-2">
          {entrants.map((e) => (
            <Chip
              key={e.driver}
              active={favoriteDrivers.includes(e.driver)}
              onClick={() => setFavoriteDrivers((prev) => toggle(prev, e.driver))}
            >
              {e.driverName}
            </Chip>
          ))}
        </div>
        <div className="mt-3 space-y-2">
          {driverStandings
            .map((d, i) => ({ ...d, position: i + 1 }))
            .filter((d) => favoriteDrivers.includes(d.driver))
            .map((d) => (
              <div
                key={d.driver}
                className="flex items-center justify-between rounded-lg border border-[var(--f1-line)] bg-black/20 px-4 py-3"
              >
                <div>
                  <p className="font-semibold text-white">{d.driverName}</p>
                  <p className="text-xs text-neutral-400">{d.team}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-white">P{d.position}</p>
                  <p className="text-xs text-neutral-400">
                    {d.points} pts · {d.wins} wins · {d.podiums} podiums
                  </p>
                </div>
              </div>
            ))}
        </div>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-neutral-300">Favorite teams</label>
        <div className="flex flex-wrap gap-2">
          {teams.map((team) => (
            <Chip key={team} active={favoriteTeams.includes(team)} onClick={() => setFavoriteTeams((prev) => toggle(prev, team))}>
              {team}
            </Chip>
          ))}
        </div>
        <div className="mt-3 space-y-2">
          {constructorStandings
            .map((c, i) => ({ ...c, position: i + 1 }))
            .filter((c) => favoriteTeams.includes(c.team))
            .map((c) => (
              <div
                key={c.team}
                className="flex items-center justify-between rounded-lg border border-[var(--f1-line)] bg-black/20 px-4 py-3"
              >
                <p className="font-semibold text-white">{c.team}</p>
                <div className="text-right">
                  <p className="text-lg font-bold text-white">P{c.position}</p>
                  <p className="text-xs text-neutral-400">
                    {c.points} pts · {c.wins} wins · {c.podiums} podiums
                  </p>
                </div>
              </div>
            ))}
        </div>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
      <button
        onClick={() => void save()}
        disabled={saving}
        className="rounded-full bg-[var(--f1-red)] px-5 py-2 text-sm font-semibold text-white transition hover:brightness-110 active:brightness-95 disabled:opacity-50"
      >
        {saving ? "Saving…" : saved ? "Saved" : "Save"}
      </button>
    </div>
  );
}
