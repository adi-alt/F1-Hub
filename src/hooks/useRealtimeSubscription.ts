"use client";

import { useEffect, useRef } from "react";
import { realtimeManager } from "@/lib/realtime/RealtimeManager";
import type { ListenerIdentity, RealtimeHandler } from "@/lib/realtime/types";

/**
 * The only hook any component/page/feature hook is allowed to use to reach realtime data — it
 * never touches Supabase directly, only `RealtimeManager` (see that file's docstring for why).
 * `channelKey`/`allListeners` come from `src/lib/realtime/channels.ts`'s factory functions;
 * `targetListener` is which one of that channel's listeners this particular call cares about.
 *
 * `handler`/`onResync` are read through refs so passing a fresh inline closure every render (the
 * normal way to write a callback in a component) doesn't tear down and recreate the underlying
 * subscription — only a real identity change (`channelKey` or the listener's own identity) does
 * that. StrictMode's dev-only mount→unmount→mount double-invoke is safe here because
 * RealtimeManager tracks subscribers by refcount, not by effect lifecycle directly: the extra
 * mount/unmount pair nets out to the same count it would with a single mount.
 */
export function useRealtimeSubscription(
  channelKey: string,
  allListeners: ListenerIdentity[],
  targetListener: ListenerIdentity,
  handler: RealtimeHandler,
  onResync?: () => void,
  enabled = true,
): void {
  const handlerRef = useRef(handler);
  const onResyncRef = useRef(onResync);
  useEffect(() => {
    handlerRef.current = handler;
    onResyncRef.current = onResync;
  });

  const listenerIdKey = `${targetListener.table}:${targetListener.event}:${targetListener.filter ?? ""}:${targetListener.authContext}`;

  useEffect(() => {
    // `enabled` lets a caller that doesn't yet know its own filter value (e.g. AppRealtimeSync
    // before a uid exists) skip subscribing at all, rather than subscribing with a placeholder
    // identity and immediately tearing it down once the real value arrives.
    if (!enabled) return;
    return realtimeManager.subscribe(
      channelKey,
      allListeners,
      targetListener,
      (event) => handlerRef.current(event),
      onResyncRef.current ? () => onResyncRef.current?.() : undefined,
    );
    // `allListeners`/`targetListener` are rebuilt (new references, same content) by
    // channels.ts's factory functions on every render — channelKey + the listener's own identity
    // string is the real dependency here; resubscribing on every new array/object reference would
    // tear down and recreate the shared channel for no reason.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelKey, listenerIdKey, enabled]);
}
