"use client";

import { useState } from "react";

type Entrant = { driver: string; driverName: string; team: string };

export function PersonalizationForm({
  entrants,
  initialFavoriteDriver,
  initialFavoriteTeam,
}: {
  entrants: Entrant[];
  initialFavoriteDriver?: string;
  initialFavoriteTeam?: string;
}) {
  const [favoriteDriver, setFavoriteDriver] = useState(initialFavoriteDriver ?? "");
  const [favoriteTeam, setFavoriteTeam] = useState(initialFavoriteTeam ?? "");
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
        body: JSON.stringify({ favoriteDriver, favoriteTeam }),
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
        <label className="mb-2 block text-sm font-medium text-neutral-300">Favorite driver</label>
        <select
          value={favoriteDriver}
          onChange={(e) => setFavoriteDriver(e.target.value)}
          className="w-full rounded-lg border border-[var(--f1-line)] bg-black/20 px-4 py-2 text-sm text-white focus:border-white/30 focus:outline-none"
        >
          <option value="">No preference</option>
          {entrants.map((e) => (
            <option key={e.driver} value={e.driver}>
              {e.driverName}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-neutral-300">Favorite team</label>
        <select
          value={favoriteTeam}
          onChange={(e) => setFavoriteTeam(e.target.value)}
          className="w-full rounded-lg border border-[var(--f1-line)] bg-black/20 px-4 py-2 text-sm text-white focus:border-white/30 focus:outline-none"
        >
          <option value="">No preference</option>
          {teams.map((team) => (
            <option key={team} value={team}>
              {team}
            </option>
          ))}
        </select>
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
