"use client";

import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import { realtimeLog } from "./logger";
import { toRealtimeEvent } from "./types";
import type { ChannelLifecycleState, ListenerIdentity, RealtimeHandler, RealtimeStatus } from "./types";

function listenerKey(l: ListenerIdentity): string {
  return `${l.table}:${l.event}:${l.filter ?? ""}:${l.authContext}`;
}

type ChannelEntry = {
  channel: RealtimeChannel;
  state: ChannelLifecycleState;
  handlers: Map<string, Set<RealtimeHandler>>; // listenerKey -> fanned-out consumer callbacks
  resyncCallbacks: Set<() => void>;
  wasEverSubscribed: boolean;
};

// Batches simultaneous multi-channel reconnects (a laptop sleep/wake, a network blip that drops
// every open channel at once) into one resync pass instead of one per channel — plan safeguard 8.
const RESYNC_DEBOUNCE_MS = 400;

/**
 * The one place in this app allowed to call `supabase.channel(...)` — see the two hard rules in
 * the realtime/cache refactor plan: components/pages/hooks never own a channel directly, and a
 * realtime event never triggers `router.refresh()` except through a documented sync-policy
 * strategy. Everything else (useRealtimeSubscription, syncPolicy.ts) is a thin layer on top of
 * this registry.
 *
 * Channels are keyed by `channelKey` (one underlying `RealtimeChannel`/WebSocket subscription,
 * e.g. "global", "user:<uid>", "group:<groupId>") and multiplex any number of listeners
 * (`ListenerIdentity` — table + event + filter + auth context, see types.ts) declared upfront by
 * the caller that first asks for that channel. Supabase requires every `.on()` binding to be
 * registered before the one `.subscribe()` call, so the full listener list for a channel must be
 * known at creation time — channels.ts is what supplies that static list; this class doesn't
 * discover it incrementally. A listener already declared just gets another consumer callback
 * fanned into its handler set; asking for a channelKey with a listener that wasn't in its
 * original list is a programming error (logged, not thrown — a misconfigured feature shouldn't be
 * able to take the rest of realtime down with it).
 */
class RealtimeManagerClass {
  private channels = new Map<string, ChannelEntry>();
  private resyncTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingResyncs = new Set<() => void>();

  subscribe(
    channelKey: string,
    allListeners: ListenerIdentity[],
    targetListener: ListenerIdentity,
    handler: RealtimeHandler,
    onResync?: () => void,
  ): () => void {
    const tKey = listenerKey(targetListener);
    let entry = this.channels.get(channelKey);
    if (!entry) {
      entry = this.createChannel(channelKey, allListeners);
      this.channels.set(channelKey, entry);
    }

    const handlers = entry.handlers.get(tKey);
    if (!handlers) {
      realtimeLog.error(`subscribe(${channelKey}): listener "${tKey}" isn't in this channel's static list — check channels.ts`);
      return () => {};
    }

    handlers.add(handler);
    entry.state.subscriberCount += 1;
    if (onResync) entry.resyncCallbacks.add(onResync);
    realtimeLog.debug(`+listener ${channelKey}/${tKey} (${entry.state.subscriberCount} total on this channel)`);

    return () => {
      handlers.delete(handler);
      entry!.state.subscriberCount -= 1;
      if (onResync) entry!.resyncCallbacks.delete(onResync);
      realtimeLog.debug(`-listener ${channelKey}/${tKey} (${entry!.state.subscriberCount} left on this channel)`);
      if (entry!.state.subscriberCount <= 0) this.destroyChannel(channelKey);
    };
  }

  private createChannel(channelKey: string, allListeners: ListenerIdentity[]): ChannelEntry {
    const handlers = new Map<string, Set<RealtimeHandler>>();
    for (const l of allListeners) handlers.set(listenerKey(l), new Set());

    const state: ChannelLifecycleState = {
      status: "CONNECTING",
      lastStatusAt: Date.now(),
      subscriberCount: 0,
      lastEventAt: null,
      reconnectAttempts: 0,
    };
    const resyncCallbacks = new Set<() => void>();

    let channel = supabase.channel(channelKey);
    for (const l of allListeners) {
      const key = listenerKey(l);
      // supabase-js's .on() overloads are resolved by a literal event string, which a
      // dynamically-built ListenerIdentity can't satisfy statically (event is
      // "INSERT"|"UPDATE"|"DELETE"|"*" here, not one fixed literal) — this is the one place in
      // the file that steps outside that overload resolution, deliberately: toRealtimeEvent below
      // normalizes every payload shape identically regardless of which overload would have fired.
      channel = channel.on(
        "postgres_changes",
        { event: l.event, schema: "public", table: l.table, ...(l.filter ? { filter: l.filter } : {}) } as never,
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          state.lastEventAt = Date.now();
          const event = toRealtimeEvent(l.table, payload);
          realtimeLog.debug(`event ${channelKey}/${key}`, event.operation);
          for (const h of handlers.get(key) ?? []) h(event);
        },
      );
    }

    const entry: ChannelEntry = { channel, state, handlers, resyncCallbacks, wasEverSubscribed: false };

    channel.subscribe((status, err) => {
      const prevStatus = state.status;
      state.status = status as RealtimeStatus;
      state.lastStatusAt = Date.now();

      if (status === "SUBSCRIBED") {
        if (entry.wasEverSubscribed && prevStatus !== "SUBSCRIBED") {
          realtimeLog.debug(`${channelKey}: reconnected after ${prevStatus}, scheduling resync`);
          this.scheduleResync(entry.resyncCallbacks);
        } else {
          realtimeLog.debug(`${channelKey}: SUBSCRIBED`);
        }
        entry.wasEverSubscribed = true;
        state.reconnectAttempts = 0;
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        state.reconnectAttempts += 1;
        realtimeLog.error(`${channelKey}: ${status} (attempt ${state.reconnectAttempts})`, err ?? "");
      } else {
        realtimeLog.debug(`${channelKey}: ${status}`);
      }
    });

    return entry;
  }

  private scheduleResync(callbacks: Set<() => void>) {
    for (const cb of callbacks) this.pendingResyncs.add(cb);
    if (this.resyncTimer) clearTimeout(this.resyncTimer);
    this.resyncTimer = setTimeout(() => {
      const toRun = [...this.pendingResyncs];
      this.pendingResyncs.clear();
      this.resyncTimer = null;
      realtimeLog.debug(`resync: running ${toRun.length} coalesced callback(s)`);
      for (const cb of toRun) cb();
    }, RESYNC_DEBOUNCE_MS);
  }

  private destroyChannel(channelKey: string) {
    const entry = this.channels.get(channelKey);
    if (!entry) return;
    supabase.removeChannel(entry.channel);
    this.channels.delete(channelKey);
    realtimeLog.debug(`${channelKey}: removed (no subscribers left)`);
  }

  /** Dev-mode visibility into every live channel — status, subscriber count, last event, reconnect
   * attempts. Not wired to a UI anywhere; call `realtimeManager.getDiagnostics()` from the browser
   * console when debugging a realtime issue. */
  getDiagnostics(): Record<string, ChannelLifecycleState & { listenerKeys: string[] }> {
    const out: Record<string, ChannelLifecycleState & { listenerKeys: string[] }> = {};
    for (const [key, entry] of this.channels) {
      out[key] = { ...entry.state, listenerKeys: [...entry.handlers.keys()] };
    }
    return out;
  }
}

export const realtimeManager = new RealtimeManagerClass();

if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
  (window as unknown as { __realtimeManager?: RealtimeManagerClass }).__realtimeManager = realtimeManager;
}
