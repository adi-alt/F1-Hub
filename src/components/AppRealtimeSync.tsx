"use client";

import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/providers/AuthProvider";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import {
  GLOBAL_CHANNEL_KEY,
  GLOBAL_LISTENERS,
  userChannelKey,
  userListeners,
  ownProfileListener,
  allProfilesListener,
} from "@/lib/realtime/channels";
import { favoritesKeys } from "@/queries/favorites/favoritesKeys";
import { usersKeys } from "@/app/users/_queries/usersKeys";

/**
 * Root-mounted once, in AppProviders — replaces the old per-page RaceRealtimeWatcher/
 * CalendarRealtimeWatcher/MediaRealtimeWatcher/FavoritesRealtimeWatcher, and centralizes what
 * useUsersRealtimeSync used to open as its own separate channel. Renders nothing.
 *
 * Owns the app's two always-on channels (see channels.ts): GLOBAL (races/calendar/drivers/teams —
 * public, no auth needed, mounted regardless of sign-in state) and USER (per-uid `profiles`, only
 * while signed in). Every table's actual sync strategy is documented in syncPolicy.ts, not decided
 * here — races/calendar/drivers/teams all resolve to "refresh" (their consumers are server-only
 * derived computations — standings, battles, progression — that can't safely be patched into a
 * client cache), `profiles` resolves to "invalidate" against the two query-cache resources that
 * actually exist for it (Favorites, Users).
 */
export function AppRealtimeSync() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, role, refreshPointsBalance } = useAuth();

  // One handler for all 4 GLOBAL listeners — they share the same "refresh" strategy, so there's
  // no reason for four separate router.refresh() call sites. Registering the same function
  // reference as onResync from every call below is intentional, not redundant: RealtimeManager
  // dedupes resync callbacks by reference (a Set), and reconnects across GLOBAL/USER already
  // coalesce into one resync pass regardless (see RealtimeManager's debounce).
  const refreshOnGlobalChange = () => router.refresh();
  useRealtimeSubscription(GLOBAL_CHANNEL_KEY, GLOBAL_LISTENERS, GLOBAL_LISTENERS[0], refreshOnGlobalChange, refreshOnGlobalChange);
  useRealtimeSubscription(GLOBAL_CHANNEL_KEY, GLOBAL_LISTENERS, GLOBAL_LISTENERS[1], refreshOnGlobalChange, refreshOnGlobalChange);
  useRealtimeSubscription(GLOBAL_CHANNEL_KEY, GLOBAL_LISTENERS, GLOBAL_LISTENERS[2], refreshOnGlobalChange, refreshOnGlobalChange);
  useRealtimeSubscription(GLOBAL_CHANNEL_KEY, GLOBAL_LISTENERS, GLOBAL_LISTENERS[3], refreshOnGlobalChange, refreshOnGlobalChange);

  // USER channel — two listeners, only ever both active for an admin (see channels.ts). uid falls
  // back to "" when signed out purely so the hook always receives a string; `enabled: false` is
  // what actually stops it from subscribing, not the placeholder value.
  const uid = user?.uid ?? "";
  const isAdmin = role === "admin";
  const channelKey = userChannelKey(uid);
  const allListeners = userListeners(uid, isAdmin);

  // Same own-row subscription Favorites already needed - a prediction entry/payout (groups.ts's
  // spendPoints/creditPoints) updates this exact row, so refreshing the header's points balance
  // here is free: no new channel/listener, just one more thing this one already-open one does.
  const onOwnProfileChange = () => {
    void queryClient.invalidateQueries({ queryKey: favoritesKeys.all() });
    refreshPointsBalance();
  };
  useRealtimeSubscription(channelKey, allListeners, ownProfileListener(uid), onOwnProfileChange, onOwnProfileChange, !!user);

  const invalidateUsers = () => {
    void queryClient.invalidateQueries({ queryKey: usersKeys.list() });
    void queryClient.invalidateQueries({ queryKey: usersKeys.searchAll() });
  };
  useRealtimeSubscription(channelKey, allListeners, allProfilesListener(), invalidateUsers, invalidateUsers, isAdmin);

  return null;
}
