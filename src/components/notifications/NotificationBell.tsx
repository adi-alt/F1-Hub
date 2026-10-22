"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Bell, CheckCheck, Settings } from "lucide-react";
import { EntityAvatar } from "@/components/EntityAvatar";
import { Icon } from "@/components/ui/Icon";
import { Popover } from "@/components/ui/Popover";
import { timeAgo } from "@/lib/format";
import type { NotificationItem } from "@/lib/supabase/notifications";

/** How often the badge re-checks while the tab is open; it also re-checks when the tab regains focus. */
const POLL_MS = 60_000;
const SETTINGS_HREF = "/?section=profile&tab=notifications";

/**
 * The notification centre: a bell in the header with the unread count, opening the latest notifications - what
 * happened, who did it, when - newest first. Opening one marks it read and goes where it points; "Mark all read"
 * clears the badge. The count is polled (and refreshed on focus) rather than pushed: notifications are about
 * settled rounds and replies, nothing that needs to arrive within the second.
 */
export function NotificationBell() {
  const router = useRouter();
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [failed, setFailed] = useState(false);

  const refreshCount = useCallback(() => {
    fetch("/api/notifications?count=1")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { unread?: number } | null) => typeof d?.unread === "number" && setUnread(d.unread))
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshCount();
    const id = setInterval(refreshCount, POLL_MS);
    const onFocus = () => document.visibilityState === "visible" && refreshCount();
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [refreshCount]);

  async function load() {
    setFailed(false);
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { items: NotificationItem[]; unread: number };
      setItems(data.items);
      setUnread(data.unread);
    } catch {
      setFailed(true);
    }
  }

  async function markRead(ids?: string[]) {
    setItems((prev) => prev?.map((n) => (!ids || ids.includes(n.id) ? { ...n, readAt: n.readAt ?? new Date().toISOString() } : n)) ?? prev);
    setUnread((u) => (ids ? Math.max(0, u - ids.length) : 0));
    await fetch("/api/notifications/read", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(ids ? { ids } : {}) }).catch(() => {});
  }

  return (
    <Popover
      align="end"
      ariaLabel="Notifications"
      panelClassName="w-[min(24rem,calc(100vw-2rem))]"
      trigger={({ open, toggle, ref }) => (
        <button
          ref={ref}
          type="button"
          onClick={() => {
            if (!open) void load();
            toggle();
          }}
          aria-expanded={open}
          aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
          className={`relative flex size-9 items-center justify-center rounded-lg border transition-colors duration-fast focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${open ? "border-white/25 bg-white/[0.08] text-primary" : "border-white/10 text-secondary hover:border-white/20 hover:text-primary"}`}
        >
          <Icon icon={Bell} size={16} />
          {unread > 0 && (
            <span aria-hidden className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-caption font-semibold leading-none tabular text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      )}
    >
      {({ close }) => (
        <div className="flex max-h-[min(32rem,calc(100dvh-6rem))] flex-col">
          <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3.5 py-2.5">
            <p className="text-body-sm font-semibold text-primary">Notifications</p>
            <div className="flex items-center gap-1">
              {unread > 0 && (
                <button type="button" onClick={() => void markRead()} className="flex items-center gap-1 rounded-control px-2 py-1 text-caption text-secondary transition-colors duration-fast hover:bg-white/[0.06] hover:text-primary">
                  <Icon icon={CheckCheck} size={16} className="size-3.5" />
                  Mark all read
                </button>
              )}
              <Link href={SETTINGS_HREF} onClick={close} aria-label="Notification settings" title="Notification settings" className="flex size-7 items-center justify-center rounded-control text-secondary transition-colors duration-fast hover:bg-white/[0.06] hover:text-primary">
                <Icon icon={Settings} size={16} className="size-3.5" />
              </Link>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {failed ? (
              <p className="px-3.5 py-6 text-center text-body-sm text-secondary">
                Couldn&apos;t load notifications.{" "}
                <button type="button" onClick={() => void load()} className="font-medium text-primary underline-offset-4 hover:underline">
                  Try again
                </button>
              </p>
            ) : items === null ? (
              <ul aria-hidden className="space-y-3 p-3.5">
                {[0, 1, 2].map((i) => (
                  <li key={i} className="flex gap-3">
                    <span className="size-8 shrink-0 animate-pulse rounded-full bg-white/[0.06]" />
                    <span className="flex-1 space-y-1.5">
                      <span className="block h-3.5 w-4/5 animate-pulse rounded bg-white/[0.06]" />
                      <span className="block h-3 w-2/5 animate-pulse rounded bg-white/[0.06]" />
                    </span>
                  </li>
                ))}
              </ul>
            ) : items.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <p className="text-body-sm font-medium text-primary">You&apos;re all caught up</p>
                <p className="mt-1 text-caption text-secondary">Settled predictions, replies and community news show up here.</p>
              </div>
            ) : (
              <ul className="py-1">
                {items.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => {
                        if (!n.readAt) void markRead([n.id]);
                        close();
                        if (n.href) router.push(n.href);
                      }}
                      className="flex w-full items-start gap-3 px-3.5 py-2.5 text-left transition-colors duration-fast hover:bg-white/[0.05] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring"
                    >
                      {n.actor ? (
                        <EntityAvatar imageUrl={n.actor.avatarUrl} name={n.actor.name} size={32} />
                      ) : (
                        <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-tertiary">
                          <Icon icon={Bell} size={16} className="size-3.5" />
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className={`block text-body-sm ${n.readAt ? "text-secondary" : "font-medium text-primary"}`}>{n.title}</span>
                        {n.body && <span className="mt-0.5 block text-caption text-secondary">{n.body}</span>}
                        <span suppressHydrationWarning className="mt-0.5 block text-caption text-tertiary">
                          {timeAgo(n.createdAt)}
                        </span>
                      </span>
                      {!n.readAt && <span aria-label="Unread" className="mt-1.5 size-2 shrink-0 rounded-full bg-brand" />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Popover>
  );
}
