"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

/**
 * Same idea as RaceRealtimeWatcher: renders nothing, refreshes the group page the moment
 * pipeline/compute_group_scores.py writes a new score or another member joins via the invite
 * link, instead of waiting for a manual reload.
 *
 * No cache-tag dance needed here the way races.ts required — getGroupDetail/getGroupLeaderboard
 * (src/lib/supabase/groups.ts) aren't wrapped in `unstable_cache` at all: a group's page already
 * reads the session (cookies()), which forces it fully dynamic regardless, so there's no separate
 * data-layer cache sitting in the way of a plain `router.refresh()`.
 */
export function GroupRealtimeWatcher({ groupId }: { groupId: string }) {
  const router = useRouter();

  useEffect(() => {
    const channel = supabase
      .channel(`group-${groupId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "group_race_scores", filter: `group_id=eq.${groupId}` },
        () => router.refresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "group_members", filter: `group_id=eq.${groupId}` },
        () => router.refresh(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [groupId, router]);

  return null;
}
