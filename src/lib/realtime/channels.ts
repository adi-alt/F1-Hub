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

// races/calendar/drivers/teams are all public (`"public read" using (true)` — verified live, see
// the plan's Live verification section), unfiltered, and low-write-volume enough that one shared
// channel for the whole group costs nothing extra over four separate ones.
export const GLOBAL_CHANNEL_KEY = "global";
export const GLOBAL_LISTENERS: ListenerIdentity[] = [
  { table: "races", event: "*", authContext: "public" },
  { table: "calendar", event: "*", authContext: "public" },
  { table: "drivers", event: "*", authContext: "public" },
  { table: "teams", event: "*", authContext: "public" },
];

// One channel per signed-in uid. Two listeners, not one: `profiles` filtered to the viewer's own
// row (drives favorites sync — every signed-in user gets this) and `profiles` unfiltered (drives
// the admin users list — only registered when the viewer is an admin). These are never merged
// into a single listener even though they share a table, per safeguard 4 — different filter,
// different authorization context, kept as genuinely separate `.on()` bindings that happen to
// share one WebSocket channel object.
//
// The unfiltered listener will subscribe successfully but, because Realtime enforces RLS
// per-subscriber, only actually deliver events for the admin's own row until the `is_admin()` +
// "admin read all profiles" policy (see supabase/schema.sql) is applied to the live database —
// confirmed still not applied as of this refactor (see the plan's Live verification section).
// Registered anyway so it activates automatically the moment that policy lands, with no code
// change needed then.
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
  ];
}
