"use client";

import { supabase } from "@/lib/supabase/client";
import { realtimeLog } from "./logger";

/**
 * Who is looking at a community right now.
 *
 * The SECOND (and only other) place in this app allowed to call `supabase.channel(...)` -
 * RealtimeManager's docstring names itself as the first. The split is deliberate, not an oversight:
 * RealtimeManager multiplexes `postgres_changes` bindings, whose whole model is "declare every
 * table/event/filter listener upfront, then subscribe once". A presence channel has no table
 * bindings at all, needs a per-user `presence.key` baked into its own config at creation time, and
 * must `track()` after subscribing. Threading that through a registry built for row-change
 * listeners would have meant two incompatible lifecycles in one class. It lives here instead, with
 * the same refcounted-per-key discipline so N mounted widgets share one socket.
 *
 * Shaped as a `useSyncExternalStore` source (subscribe + snapshot) rather than a callback API,
 * because that is exactly what it is: an external system React reads from. That also keeps the
 * consuming hook free of any setState-inside-an-effect.
 *
 * What it is NOT: a membership count, an "active this week" figure, or anything derived from the
 * database. It is exactly the set of signed-in people with this community's page open, which is
 * what "online" means. Before the first sync - and whenever the channel fails to reach SUBSCRIBED
 * (realtime disabled, a blocked WebSocket, an offline browser) - the snapshot is null and the UI
 * omits the stat rather than printing a 0 or a 1 that would be a claim we can't support.
 */

type Entry = {
  leave: () => void;
  subscribers: Set<() => void>;
  count: number | null;
  /** Set the instant we choose to leave, so the CLOSED status that removeChannel triggers on the
   * way out isn't mistaken for the socket dropping. */
  leaving: boolean;
};

const entries = new Map<string, Entry>();

function channelKeyFor(groupId: string): string {
  return `presence:group:${groupId}`;
}

/** The current headcount for a community, or null when it genuinely isn't known yet. Returns a
 * primitive, so `useSyncExternalStore`'s identity check is a value comparison and an unchanged
 * count can never cause a re-render loop. */
export function communityPresenceCount(groupId: string): number | null {
  return entries.get(channelKeyFor(groupId))?.count ?? null;
}

/**
 * Joins (or re-uses) this community's presence channel as `uid`. The returned unsubscribe drops
 * this subscriber and, once the last one for the community goes, leaves the channel entirely.
 */
export function subscribeCommunityPresence(groupId: string, uid: string, onStoreChange: () => void): () => void {
  const key = channelKeyFor(groupId);
  let entry = entries.get(key);

  if (!entry) {
    // `presence.key` is the viewer's own uid, so the same person with the page open in three tabs
    // counts once - a headcount of people, not of browser tabs.
    const channel = supabase.channel(key, { config: { presence: { key: uid } } });
    const created: Entry = {
      count: null,
      subscribers: new Set(),
      leaving: false,
      leave: () => {
        created.leaving = true;
        void supabase.removeChannel(channel);
      },
    };

    const publish = (count: number | null) => {
      if (created.count === count) return;
      created.count = count;
      for (const notify of created.subscribers) notify();
    };

    channel
      // presenceState() is keyed by presence key; its key count is the number of distinct people.
      .on("presence", { event: "sync" }, () => publish(Object.keys(channel.presenceState()).length))
      .on("presence", { event: "join" }, () => publish(Object.keys(channel.presenceState()).length))
      .on("presence", { event: "leave" }, () => publish(Object.keys(channel.presenceState()).length))
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          // Tracking is what puts this viewer INTO the count; without it they'd be an observer of
          // everyone else. The payload carries nothing identifying beyond the key already used.
          void channel.track({ at: new Date().toISOString() });
          return;
        }
        // Leaving on purpose (the last subscriber unmounted) closes the channel, which arrives
        // here as CLOSED. That is the happy path, not a failure: logging it would put a
        // console.error in front of every user who navigates away from a community - and
        // realtimeLog.error logs in EVERY environment by design, so it would be real production
        // noise, which is exactly what this module's neighbours exist to avoid.
        if (created.leaving) return;
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          realtimeLog.error(`presence ${key}: ${status}`);
          // Back to "we don't know", not to 0 - a dropped socket is not an empty room.
          publish(null);
        }
      });

    entry = created;
    entries.set(key, created);
  }

  entry.subscribers.add(onStoreChange);

  return () => {
    const current = entries.get(key);
    if (!current) return;
    current.subscribers.delete(onStoreChange);
    if (current.subscribers.size === 0) {
      current.leave();
      entries.delete(key);
    }
  };
}
