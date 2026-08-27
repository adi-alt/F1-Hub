import type { RealtimePostgresChangesPayload, RealtimeChannel } from "@supabase/supabase-js";

/** Every table this app has ever put on the `supabase_realtime` publication (see
 * supabase/schema.sql's `alter publication` statements — verified live, not just read off the
 * schema file, see the plan's "Live verification" section). Adding an 8th realtime table means
 * adding it here first — everything downstream (channels.ts, syncPolicy.ts) is keyed off this. */
export type RealtimeTable = "races" | "calendar" | "drivers" | "teams" | "profiles" | "group_race_scores" | "group_members";

/** Supabase's own channel subscribe callback status, re-exported under one name so nothing in
 * this app imports realtime-js's status string type from three different places. */
export type RealtimeStatus = "SUBSCRIBED" | "CHANNEL_ERROR" | "TIMED_OUT" | "CLOSED";

/** What a `.channel()` object goes through, start to finish: never subscribed yet, actively
 * subscribing, live, or lost. `error` and `reconnecting` are their own booleans (not extra status
 * values) because "lost, currently trying to come back" and "lost, given up" are both real states
 * a diagnostics view needs to tell apart. */
export type ChannelLifecycleState = {
  status: RealtimeStatus | "CONNECTING";
  lastStatusAt: number;
  subscriberCount: number;
  lastEventAt: number | null;
  reconnectAttempts: number;
};

/** One postgres_changes listener's full identity — table + event + filter + the auth context it
 * was registered under. Two listeners on the same table with different filters (an admin's
 * unfiltered `profiles` read vs. a user's own-row-filtered one) are never the same listener, even
 * if they end up multiplexed onto the same underlying `channel()` object — this is what
 * RealtimeManager dedupes *by*, not the table name alone (plan safeguard 4). */
export type ListenerIdentity = {
  table: RealtimeTable;
  event: "INSERT" | "UPDATE" | "DELETE" | "*";
  filter?: string;
  /** Free-form tag for "which auth context is this scoped to" — e.g. a uid, "admin", or "public".
   * Purely for the dedup key; RealtimeManager never enforces authorization itself, Postgres RLS
   * already does that on the wire. */
  authContext: string;
};

/** The raw Supabase payload, translated into one normalized shape every consumer downstream of
 * RealtimeManager reads instead of Supabase's own verbose `RealtimePostgresChangesPayload`. */
export type RealtimeEvent<T extends Record<string, unknown> = Record<string, unknown>> = {
  table: RealtimeTable;
  operation: "INSERT" | "UPDATE" | "DELETE";
  new: T | null;
  old: Partial<T> | null;
};

export function toRealtimeEvent<T extends Record<string, unknown>>(
  table: RealtimeTable,
  payload: RealtimePostgresChangesPayload<T>,
): RealtimeEvent<T> {
  return {
    table,
    operation: payload.eventType,
    new: "new" in payload && Object.keys(payload.new).length ? (payload.new as T) : null,
    old: "old" in payload && Object.keys(payload.old).length ? (payload.old as Partial<T>) : null,
  };
}

export type RealtimeHandler = (event: RealtimeEvent) => void;

/** What RealtimeManager hands back per underlying `channel()` object — only `logger.ts` and
 * `RealtimeManager.ts` itself construct one of these. */
export type ManagedChannel = { channel: RealtimeChannel; key: string };
