"use client";

import Link from "next/link";
import { useState } from "react";
import { FavoriteButton } from "@/app/archive/components/FavoriteButton";

type FavoriteType = "driver" | "team" | "track";
export type FavoriteItem = { id: string; name: string; href: string };

/** Shows whatever's been favorited from the archive's heart icons (browse by track/driver/team)
 * — a different id scheme (Ergast slugs, team-name slugs) than the current-season picks above,
 * which is why those need their own resolved names/links rather than reusing the chip UI. Removing
 * one here goes through the same /api/archive/favorites toggle the archive page itself uses, so
 * it stays the single source of truth either way. */
export function FavoritesFromArchive({
  drivers,
  teams,
  tracks,
}: {
  drivers: FavoriteItem[];
  teams: FavoriteItem[];
  tracks: FavoriteItem[];
}) {
  const [items, setItems] = useState({ driver: drivers, team: teams, track: tracks });

  function remove(type: FavoriteType, id: string, item: FavoriteItem) {
    setItems((prev) => ({ ...prev, [type]: prev[type].filter((i) => i.id !== id) }));
    fetch("/api/archive/favorites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, id, favorited: false }),
    }).catch(() => {
      // Best-effort revert if the write didn't land — re-add it back to the list.
      setItems((prev) => ({ ...prev, [type]: [...prev[type], item] }));
    });
  }

  const total = items.track.length + items.driver.length + items.team.length;
  if (total === 0) {
    return (
      <p className="text-sm text-neutral-500">
        Nothing favorited yet — tracks, drivers, and teams in the{" "}
        <Link href="/archive" className="text-[var(--f1-red)] hover:underline">
          archive
        </Link>{" "}
        each have a heart icon to add them here.
      </p>
    );
  }

  const sections: { type: FavoriteType; label: string; list: FavoriteItem[] }[] = [
    { type: "track", label: "Tracks", list: items.track },
    { type: "driver", label: "Drivers", list: items.driver },
    { type: "team", label: "Teams", list: items.team },
  ];

  return (
    <div className="space-y-5">
      {sections.map(
        ({ type, label, list }) =>
          list.length > 0 && (
            <div key={type}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">{label}</p>
              <div className="flex flex-wrap gap-2">
                {list.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-2 rounded-full border border-[var(--f1-line)] bg-black/20 py-1 pl-3 pr-2 text-sm"
                  >
                    <Link href={item.href} className="text-white hover:text-[var(--f1-red)]">
                      {item.name}
                    </Link>
                    <FavoriteButton favorited onToggle={() => remove(type, item.id, item)} />
                  </div>
                ))}
              </div>
            </div>
          ),
      )}
    </div>
  );
}
