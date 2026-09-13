"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EntityAvatar } from "@/components/EntityAvatar";
import { Popover } from "@/components/ui/Popover";
import { communityTypeMeta, visibilityLabel } from "@/lib/communities";
import type { GroupDetail } from "@/lib/supabase/groups";
import { GroupBanner } from "../../components/GroupBanner";

/**
 * The community identity block: banner, avatar, name, what kind of community it is, and the two
 * actions that belong at this level (the membership menu and sharing).
 *
 * Deliberately NOT enormous - a 16:5 banner, a 64px avatar and three lines of metadata, so the
 * actual content starts near the top of the viewport rather than a screen down.
 *
 * There is no per-community notification setting in the membership menu. `profiles` has two global
 * notification flags and nothing per-community, so "All activity / Highlights / Muted" would be
 * three radio buttons that change nothing. Left out rather than faked.
 */
export function CommunityHeader({
  group,
  memberCount,
  pendingRequests,
}: {
  group: GroupDetail;
  memberCount: number;
  /** Only ever passed for admins/moderators - shown as a badge so a waiting request is visible
   * without opening Manage. */
  pendingRequests?: number;
}) {
  const router = useRouter();
  const meta = communityTypeMeta(group.communityType);
  const [copied, setCopied] = useState(false);
  const [leaveError, setLeaveError] = useState("");
  const [leaving, setLeaving] = useState(false);

  async function share() {
    const url = `${window.location.origin}/groups/${group.id}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked (insecure context, denied permission). Selecting the URL for the
      // user beats a toast claiming a copy that didn't happen.
      window.prompt("Copy this community's link:", url);
    }
  }

  async function leave(close: () => void) {
    setLeaving(true);
    setLeaveError("");
    const res = await fetch(`/api/groups/${group.id}/leave`, { method: "POST" }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { error?: string } | null;
    if (!res?.ok) {
      // The real reason ("you're the only admin", "you're the only member") comes from the service
      // layer and is shown verbatim - these are actionable, not generic failures.
      setLeaveError(body?.error ?? "Couldn't leave. Try again.");
      setLeaving(false);
      return;
    }
    close();
    router.push("/groups");
    router.refresh();
  }

  return (
    <header>
      <div className="overflow-hidden rounded-xl border border-[var(--f1-line)]">
        <GroupBanner bannerUrl={group.bannerUrl} seed={group.id} />
      </div>

      <div className="px-1">
        <div className="-mt-8 flex items-end justify-between gap-3">
          <span className="rounded-full ring-4 ring-[var(--background)]">
            <EntityAvatar imageUrl={group.avatarUrl} name={group.name} size={64} />
          </span>

          <div className="mb-1 flex items-center gap-2">
            <button
              type="button"
              onClick={() => void share()}
              className="rounded-full border border-[var(--f1-line)] px-3 py-1.5 text-xs font-medium text-neutral-300 transition hover:border-white/30 hover:text-white"
            >
              {copied ? "Link copied" : "Share"}
            </button>

            <Popover
              align="end"
              ariaLabel="Membership options"
              panelClassName="w-60"
              trigger={({ open, toggle, ref }) => (
                <button
                  ref={ref}
                  type="button"
                  onClick={toggle}
                  aria-expanded={open}
                  className="flex items-center gap-1.5 rounded-full border border-white/20 bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/[0.1]"
                >
                  Joined
                  <svg viewBox="0 0 20 20" className={`h-3 w-3 transition ${open ? "rotate-180" : ""}`} fill="none" aria-hidden>
                    <path d="M5 7.5 10 12.5 15 7.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              )}
            >
              {({ close }) => (
                <div className="p-1">
                  <div className="px-2.5 py-2">
                    <p className="text-[11px] uppercase tracking-wide text-neutral-600">Your role</p>
                    <p className="mt-0.5 text-sm capitalize text-neutral-200">{group.myRole}</p>
                  </div>
                  <div className="my-1 border-t border-white/10" />
                  <button
                    type="button"
                    disabled={leaving}
                    onClick={() => void leave(close)}
                    className="w-full rounded-lg px-2.5 py-2 text-left text-sm text-[var(--f1-red)] transition hover:bg-[var(--f1-red)]/10 disabled:opacity-50"
                  >
                    {leaving ? "Leaving…" : "Leave community"}
                  </button>
                  {leaveError && <p className="px-2.5 pb-1.5 pt-0.5 text-[11px] leading-snug text-[var(--f1-red)]">{leaveError}</p>}
                </div>
              )}
            </Popover>
          </div>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <h1 className="text-2xl font-bold leading-tight text-white">{group.name}</h1>
          {pendingRequests !== undefined && pendingRequests > 0 && (
            <span className="rounded-full bg-[var(--f1-red)]/15 px-2 py-0.5 text-[11px] font-semibold text-[var(--f1-red)]">
              {pendingRequests} request{pendingRequests === 1 ? "" : "s"}
            </span>
          )}
        </div>

        {group.description && <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-neutral-400">{group.description}</p>}

        <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-500">
          <span className="rounded-full border border-[var(--f1-line)] px-2 py-0.5">{meta.label}</span>
          {group.topic && <span className="rounded-full border border-[var(--f1-line)] px-2 py-0.5">{group.topic}</span>}
          <span className="rounded-full border border-[var(--f1-line)] px-2 py-0.5">{visibilityLabel(group.visibility)}</span>
          {group.tags.map((tag) => (
            <span key={tag} className="text-neutral-600">
              #{tag}
            </span>
          ))}
        </div>

        <p className="mt-2 text-xs text-neutral-500">
          {memberCount} member{memberCount === 1 ? "" : "s"} · Created{" "}
          {new Date(group.createdAt).toLocaleDateString(undefined, { month: "short", year: "numeric" })}
        </p>
      </div>
    </header>
  );
}
