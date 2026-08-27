"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

/**
 * Same idea as GroupRealtimeWatcher: one channel, two subscriptions on it (drivers + teams are
 * always fetched together, see getSeasonPageData) — refreshes the page the moment fetch_races.py
 * updates the current-season roster (a new driver, a team-color/logo change), instead of waiting
 * for a manual reload. getAllCurrentDrivers/getAllCurrentTeams (src/lib/supabase/media.ts) use
 * `revalidate: false` — fetch_races.py's own trigger_revalidation("media") call is the real
 * freshness signal, this just tells an already-open browser to go pull it.
 */
export function MediaRealtimeWatcher() {
  const router = useRouter();

  useEffect(() => {
    const channel = supabase
      .channel("media-all")
      .on("postgres_changes", { event: "*", schema: "public", table: "drivers" }, () => router.refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "teams" }, () => router.refresh())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [router]);

  return null;
}
