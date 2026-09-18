"use client";

import { useCallback, useSyncExternalStore } from "react";
import { communityPresenceCount, subscribeCommunityPresence } from "@/lib/realtime/presence";

/**
 * How many people have this community's page open right now, or null while that genuinely isn't
 * known - before the first sync, or when the presence channel never connected at all (see
 * lib/realtime/presence.ts). Callers render nothing for null rather than substituting a zero.
 *
 * `useSyncExternalStore` rather than useState + useEffect: presence IS an external store, and this
 * is the hook React provides for reading one - no setState in an effect body, and the server
 * snapshot is null, which is the honest answer during SSR (nobody is tracked yet).
 *
 * `uid` null (signed out) never joins: presence is keyed by user, and there is no user to key by.
 */
export function useCommunityPresence(groupId: string, uid: string | null): number | null {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!uid) return () => {};
      return subscribeCommunityPresence(groupId, uid, onStoreChange);
    },
    [groupId, uid],
  );

  const getSnapshot = useCallback(() => (uid ? communityPresenceCount(groupId) : null), [groupId, uid]);

  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}
