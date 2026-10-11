import type { ListenerIdentity } from "./types";

/**
 * The static per-channel listener lists RealtimeManager needs upfront (Supabase requires every
 * `.on()` binding registered before the channel's one `.subscribe()` call — see
 * RealtimeManager.ts's docstring). Three channel groups cover the 6 realtime watchers this app
 * had before this refactor (RaceRealtimeWatcher, CalendarRealtimeWatcher, MediaRealtimeWatcher,
 * FavoritesRealtimeWatcher, GroupRealtimeWatcher, useUsersRealtimeSync) — not because "3" is a
 * required shape (plan safeguard 3), but because that's what the actual dedup key (table + event
 * + filter + auth context, safeguard 4) produces once the two `profiles` subscriptions
 * (Favorites' own-row filter, Users' admin-unfiltered read) are put on one shared channel instead
 * of two competing ones.
 */

// ONE public listener, on `data_version`, replaces the four row listeners (races/calendar/drivers/teams)
// this channel used to carry. Those fired when the pipeline wrote a row - before it had busted the
// server's cache, which happens when the run finishes - so the refresh they triggered rendered the old
// cache and nothing prompted another (audit R-19). The pipeline now bumps a `data_version` row AFTER the
// bust (pipeline/ergast_utils.py bump_data_version), so by the time this event arrives a refresh is
// guaranteed to see the new data. One event per bust also replaces a refresh per written row.
export const GLOBAL_CHANNEL_KEY = "global";
export const GLOBAL_LISTENERS: ListenerIdentity[] = [{ table: "data_version", event: "*", authContext: "public" }];

// One channel per signed-in uid. Two listeners, not one: `profiles` filtered to the viewer's own
// row (drives favorites sync — every signed-in user gets this) and `profiles` unfiltered (drives
// the admin users list — only registered when the viewer is an admin). These are never merged
// into a single listener even though they share a table, per safeguard 4 — different filter,
// different authorization context, kept as genuinely separate `.on()` bindings that happen to
// share one WebSocket channel object.
//
// The unfiltered listener subscribes and, because Realtime enforces RLS per-subscriber, delivers
// events for every profiles row now that the `is_admin()` + "admin read all profiles" policy (see
// supabase/schema.sql) has been applied to the live database — confirmed both were missing from
// the live database despite being checked into schema.sql (a real gap, not just a documentation
// lag), fixed directly against the live DB.
export function userChannelKey(uid: string): string {
  return `user:${uid}`;
}
export function ownProfileListener(uid: string): ListenerIdentity {
  return { table: "profiles", event: "UPDATE", filter: `id=eq.${uid}`, authContext: uid };
}
export function allProfilesListener(): ListenerIdentity {
  return { table: "profiles", event: "*", authContext: "admin" };
}
export function userListeners(uid: string, isAdmin: boolean): ListenerIdentity[] {
  return isAdmin ? [ownProfileListener(uid), allProfilesListener()] : [ownProfileListener(uid)];
}

// One channel per groupId, created only while a group page is actually mounted (unlike GLOBAL/
// USER, which are app-root-mounted for the whole session).
export function groupChannelKey(groupId: string): string {
  return `group:${groupId}`;
}
export function groupListeners(groupId: string): ListenerIdentity[] {
  return [
    { table: "group_race_scores", event: "*", filter: `group_id=eq.${groupId}`, authContext: groupId },
    { table: "group_members", event: "*", filter: `group_id=eq.${groupId}`, authContext: groupId },
    // Both tables were already on the supabase_realtime publication (schema.sql's own
    // `alter publication` statements) - confirmed live - but had no ListenerIdentity anywhere,
    // so the Feed/Predictions tabs never actually got what an earlier migration comment claimed
    // they did. Real gap, fixed here, not a new capability being added for the first time.
    { table: "group_posts", event: "*", filter: `group_id=eq.${groupId}`, authContext: groupId },
    { table: "group_predictions", event: "*", filter: `group_id=eq.${groupId}`, authContext: groupId },
  ];
}
