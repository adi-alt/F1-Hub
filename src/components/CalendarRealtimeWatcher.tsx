"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

/**
 * Same idea as RaceRealtimeWatcher: renders nothing, refreshes the page the moment
 * sync_calendar.py writes a schedule/session-time change, instead of waiting for a manual reload
 * or the next time the "calendar" cache tag happens to get busted for an unrelated reason.
 * getCalendarEntry/getCalendarEntriesByYear (src/lib/supabase/calendar.ts) use
 * `revalidate: false` — sync_calendar.py's own trigger_revalidation("calendar") call is the real
 * freshness signal, this just tells an already-open browser to go pull it.
 *
 * Unscoped (the whole table, not filtered to one year) — the calendar table is small and low-
 * write-volume (a weekly cron at most), so there's no real cost to watching all of it the way
 * there would be for a busier table.
 */
export function CalendarRealtimeWatcher() {
  const router = useRouter();

  useEffect(() => {
    const channel = supabase
      .channel("calendar-all")
      .on("postgres_changes", { event: "*", schema: "public", table: "calendar" }, () => router.refresh())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [router]);

  return null;
}
