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
  private awaitingReady = false;

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
      this.resyncTimer = null;
      this.runResyncWhenReady();
    }, RESYNC_DEBOUNCE_MS);
  }

  /**
   * A resync means router.refresh(), which issues a real RSC request. Firing that the instant a
   * socket reconnects is what made the app land on "Something went wrong" after being left alone:
   * on a laptop wake or a network blip the channel resubscribes almost immediately, while the tab
   * is often still hidden and the network stack still settling, so the refresh's fetch fails and
   * the failure surfaces as a full-page error boundary.
   *
   * The pending callbacks are kept and replayed once the page is genuinely visible AND online, so
   * the data still resyncs - just at the first moment the request can actually succeed.
   */
  private runResyncWhenReady() {
    if (!this.canResyncNow()) {
      realtimeLog.debug("resync: deferred until the page is visible and online");
      this.waitForReady();
      return;
    }
    const toRun = [...this.pendingResyncs];
    this.pendingResyncs.clear();
    if (toRun.length === 0) return;
    realtimeLog.debug(`resync: running ${toRun.length} coalesced callback(s)`);
    for (const cb of toRun) cb();
  }

  private canResyncNow(): boolean {
    // SSR/tests have no document - nothing to defer for.
    if (typeof document === "undefined") return true;
    const online = typeof navigator === "undefined" || navigator.onLine !== false;
    return document.visibilityState === "visible" && online;
  }

  private waitForReady() {
    if (this.awaitingReady || typeof document === "undefined") return;
    this.awaitingReady = true;
    const onReady = () => {
      if (!this.canResyncNow()) return;
      document.removeEventListener("visibilitychange", onReady);
      window.removeEventListener("online", onReady);
      this.awaitingReady = false;
      this.runResyncWhenReady();
    };
    document.addEventListener("visibilitychange", onReady);
    window.addEventListener("online", onReady);
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
