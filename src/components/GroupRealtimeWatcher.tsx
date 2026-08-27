"use client";

import { useRouter } from "next/navigation";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import { groupChannelKey, groupListeners } from "@/lib/realtime/channels";

/**
 * Renders nothing — refreshes the group page the moment pipeline/compute_group_scores.py writes a
 * new score or another member joins via the invite link, instead of waiting for a manual reload.
 * Built on the shared `useRealtimeSubscription`/RealtimeManager infra (see syncPolicy.ts:
 * `group_race_scores`/`group_members` both resolve to "refresh" — a group's leaderboard is a
 * server-only computed rank/total, the same "can't safely patch a client cache" reasoning
 * races/calendar/drivers/teams get) rather than opening its own raw Supabase channel directly,
 * same as every other realtime consumer in this app now.
 *
 * Unlike GLOBAL/USER (root-mounted for the whole session in AppRealtimeSync), this channel is
 * created on demand, per-groupId, only while a group page is actually mounted — a session might
 * never visit a group page at all, so there's no reason to hold this channel open app-wide.
 *
 * No cache-tag dance needed here the way races.ts required — getGroupDetail/getGroupLeaderboard
 * (src/lib/supabase/groups.ts) aren't wrapped in `unstable_cache` at all: a group's page already
 * reads the session (cookies()), which forces it fully dynamic regardless, so there's no separate
 * data-layer cache sitting in the way of a plain `router.refresh()`.
 */
export function GroupRealtimeWatcher({ groupId }: { groupId: string }) {
  const router = useRouter();
  const refresh = () => router.refresh();

  const channelKey = groupChannelKey(groupId);
  const listeners = groupListeners(groupId);
  useRealtimeSubscription(channelKey, listeners, listeners[0], refresh, refresh);
  useRealtimeSubscription(channelKey, listeners, listeners[1], refresh, refresh);

  return null;
}
