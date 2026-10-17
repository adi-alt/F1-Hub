"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { Camera, Check, Share2 } from "lucide-react";
import { EntityAvatar } from "@/components/EntityAvatar";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Popover } from "@/components/ui/Popover";
import { communityTypeMeta, visibilityLabel } from "@/lib/communities";
import { compactCount } from "@/lib/format";
import type { GroupDetail } from "@/lib/supabase/groups";
import type { GroupStats } from "@/lib/supabase/groupStats";
import { useAuth } from "@/providers/AuthProvider";
import { useCommunityPresence } from "@/hooks/useCommunityPresence";
import { EYEBROW, PANEL } from "@/components/ui/panel";
import { GroupBanner } from "../../components/GroupBanner";

/**
 * The community identity block: cover, avatar, name, what kind of community it is, and the actions
 * that belong at this level - sharing, the membership menu, and (for an admin) the overflow that
 * holds the things only an admin can do.
 *
 * Drawn as Season draws a page's head: one glass panel, the cover fading into it, an eyebrow naming the kind of
 * community, the name, and the week's figures in hairline-divided columns (members, who was active, posts against
 * last week, open rounds, who is here now). GroupBanner's flatter "header" ratio keeps the feed near the top.
 *
 * There is no per-community notification setting in the membership menu. `profiles` has two global
 * notification flags and nothing per-community, so "All activity / Highlights / Muted" would be
 * three radio buttons that change nothing. Left out rather than faked. For the same reason the
 * overflow menu doesn't render at all for an ordinary member: everything in it is an admin action,
 * and a "..." that opens a menu with one item duplicating the Share button beside it is worse than
 * no "..." at all.
 */
export function CommunityHeader({
  group,
  stats,
  openRounds,
  pendingRequests,
  onOpenManage,
}: {
  group: GroupDetail;
  stats: GroupStats;
  /** Rounds open to predict, where the community runs predictions at all. */
  openRounds?: number;
  /** Only ever passed for admins/moderators - shown as a badge so a waiting request is visible
   * without opening Manage. */
  pendingRequests?: number;
  /** Switches the page to its Manage tab. Only meaningful for an admin, which is the only role the
   * overflow menu renders for. */
  onOpenManage: () => void;
}) {
  const router = useRouter();
  const meta = communityTypeMeta(group.communityType);
  const isAdmin = group.myRole === "admin";
  const [copied, setCopied] = useState(false);
  const [leaveError, setLeaveError] = useState("");
  const [leaving, setLeaving] = useState(false);
  const { user } = useAuth();
  const online = useCommunityPresence(group.id, user?.uid ?? null);

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

  const delta = weeklyDelta(stats);
  const figures: { label: string; value: React.ReactNode; detail?: React.ReactNode }[] = [
    { label: "Members", value: compactCount(stats.members) },
    { label: "Active this week", value: compactCount(stats.activeMembers) },
    {
      label: "Posts this week",
      value: compactCount(stats.weeklyPosts),
      detail: delta === null ? null : <span className={delta > 0 ? "text-success" : "text-tertiary"}>{delta > 0 ? "↑" : delta < 0 ? "↓" : "±"} {Math.abs(delta)}% on last week</span>,
    },
    ...(openRounds !== undefined ? [{ label: "Open rounds", value: openRounds }] : []),
  ];

  return (
    // One panel, Season's glass: the cover across its top, the identity row overlapping the cover's foot, then the
    // figures in hairline-divided columns as Season's snapshot draws them.
    <header className={`overflow-hidden ${PANEL}`}>
      <div className="relative">
        <GroupBanner bannerUrl={group.bannerUrl} seed={group.id} variant="header" />
        {/* The cover fades into the panel, so the name below reads as sitting on it rather than under a photo. */}
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-surface-0/90 to-transparent" />
        {group.tagline && (
          <p className="pointer-events-none absolute bottom-12 right-5 hidden max-w-[min(50%,24rem)] text-right text-body font-medium leading-snug text-white/90 drop-shadow-[0_2px_8px_rgba(0,0,0,0.75)] sm:block">
            <span className="line-clamp-2">{group.tagline}</span>
          </p>
        )}
        {isAdmin && <ChangeCoverButton groupId={group.id} hasBanner={!!group.bannerUrl} />}
      </div>

      <div className="relative px-4 sm:px-5">
        <div className="-mt-10 flex flex-wrap items-end gap-x-4 gap-y-3">
          {/* relative z-10: the cover above is positioned, and would otherwise paint over the half that overlaps it. */}
          <span className="relative z-10 shrink-0 rounded-full ring-4 ring-surface-0">
            <EntityAvatar imageUrl={group.avatarUrl} name={group.name} seed={group.id} size={80} />
          </span>
          <div className="relative z-10 min-w-0 flex-1 basis-56 pb-1">
            <p className={EYEBROW}>
              {meta.label} · {visibilityLabel(group.visibility)} · Est. {new Date(group.createdAt).toLocaleDateString(undefined, { month: "short", year: "numeric" })}
            </p>
            <h1 className="mt-1 break-words text-display-md text-primary">{group.name}</h1>
          </div>

          <div className="relative z-10 flex w-full flex-wrap items-center gap-2 pb-1.5 sm:w-auto">
            {pendingRequests !== undefined && pendingRequests > 0 && (
              <button
                type="button"
                onClick={onOpenManage}
                className="order-last flex h-8 items-center gap-1.5 rounded-control px-2 text-body-sm font-medium text-warning sm:order-none transition-colors duration-fast hover:bg-warning/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
              >
                <span aria-hidden className="size-1.5 rounded-full bg-warning" />
                {pendingRequests} request{pendingRequests === 1 ? "" : "s"} to join
              </button>
            )}
            <Button variant="secondary" size="sm" iconStart={Share2} onClick={() => void share()}>
              {copied ? "Link copied" : "Share"}
            </Button>

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
                  className="flex h-8 items-center gap-1.5 rounded-control border border-strong bg-surface-2 px-3 text-body-sm font-medium text-primary transition-colors duration-fast hover:bg-surface-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                >
                  <Icon icon={Check} size={16} className="size-3.5 text-success" />
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
                    <p className="text-caption text-tertiary">Your role</p>
                    <p className="mt-0.5 text-body-sm capitalize text-primary">{group.myRole}</p>
                  </div>
                  <div className="my-1 border-t border-white/10" />
                  <button
                    type="button"
                    disabled={leaving}
                    onClick={() => void leave(close)}
                    className="w-full rounded-control px-2.5 py-2 text-left text-body-sm text-danger transition-colors duration-fast hover:bg-danger/10 disabled:opacity-50"
                  >
                    {leaving ? "Leaving…" : "Leave community"}
                  </button>
                  {leaveError && <p className="px-2.5 pb-1.5 pt-0.5 text-caption leading-snug text-brand-text">{leaveError}</p>}
                </div>
              )}
            </Popover>

            {isAdmin && <AdminMenu group={group} onOpenManage={onOpenManage} pendingRequests={pendingRequests} />}
          </div>
        </div>

        {group.description && <p className="mt-3 max-w-2xl text-body-sm text-secondary">{group.description}</p>}
        {/* The topic and tags as quiet text, not a row of pills. */}
        {(group.topic || group.tags.length > 0) && (
          <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-caption text-tertiary">
            {group.topic && <span className="text-secondary">{group.topic}</span>}
            {group.tags.map((tag) => (
              <span key={tag}>#{tag}</span>
            ))}
          </p>
        )}
      </div>

      <dl className="mt-4 grid grid-cols-2 border-t border-white/[0.06] sm:flex">
        {figures.map((f, i) => (
          <div key={f.label} className={`min-w-0 px-4 py-3 sm:flex-1 sm:px-5 ${i > 0 ? "sm:border-l sm:border-white/[0.06]" : ""} ${i > 1 ? "border-t border-white/[0.06] sm:border-t-0" : ""}`}>
            <dt className={EYEBROW}>{f.label}</dt>
            <dd className="mt-1 text-title-md tabular text-primary">{f.value}</dd>
            {f.detail && <dd className="truncate text-caption tabular">{f.detail}</dd>}
          </div>
        ))}
        {/* Live presence, only once it has connected: never a made-up zero. */}
        {online !== null && (
          <div className={`min-w-0 px-4 py-3 sm:flex-1 sm:border-l sm:border-white/[0.06] sm:px-5 ${figures.length > 1 ? "border-t border-white/[0.06] sm:border-t-0" : ""}`}>
            <dt className={EYEBROW}>Here now</dt>
            <dd className="mt-1 flex items-center gap-2 text-title-md tabular text-primary">
              <span aria-hidden className="size-2 rounded-full bg-success motion-safe:animate-pulse" />
              {compactCount(online)}
            </dd>
          </div>
        )}
      </dl>
    </header>
  );
}

/** This week's posts against last week's, as a whole percentage; null where that isn't defined (a quiet last week). */
function weeklyDelta({ weeklyPosts, previousWeeklyPosts }: GroupStats): number | null {
  if (previousWeeklyPosts === 0) return null;
  return Math.round(((weeklyPosts - previousWeeklyPosts) / previousWeeklyPosts) * 100);
}

/**
 * Cover upload, in place, on the cover itself - the same `/api/groups/[id]/banner` endpoint
 * Manage > Appearance already uses, so there is exactly one upload path and one set of server-side
 * limits behind both. Errors surface on the button rather than silently reverting.
 */
function ChangeCoverButton({ groupId, hasBanner }: { groupId: string; hasBanner: boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "removing">("idle");
  const [error, setError] = useState("");
  const busy = status !== "idle";

  async function upload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setStatus("uploading");
    setError("");
    const form = new FormData();
    form.append("banner", file);
    const res = await fetch(`/api/groups/${groupId}/banner`, { method: "POST", body: form }).catch(() => null);
    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Upload failed.");
      setStatus("idle");
      return;
    }
    setStatus("idle");
    router.refresh();
  }

  async function remove(close: () => void) {
    setStatus("removing");
    setError("");
    const res = await fetch(`/api/groups/${groupId}/banner`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Could not remove cover.");
      setStatus("idle");
      return;
    }
    setStatus("idle");
    close();
    router.refresh();
  }

  return (
    <div className="absolute right-3 top-3 z-20 flex flex-col items-end gap-1.5">
      {error && <p className="max-w-[16rem] rounded-md bg-black/80 px-2 py-1 text-right text-caption leading-snug text-brand-text">{error}</p>}

      {hasBanner ? (
        <Popover
          align="end"
          ariaLabel="Cover image options"
          panelClassName="w-48"
          trigger={({ open, toggle, ref }) => (
            <button
              ref={ref}
              type="button"
              onClick={toggle}
              aria-expanded={open}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-lg bg-black/60 px-2.5 py-1.5 text-caption font-medium text-white backdrop-blur-sm transition hover:bg-black/80 disabled:opacity-60"
            >
              <Icon icon={Camera} size={16} />
              {busy ? "Working…" : "Change cover"}
            </button>
          )}
        >
          {({ close }) => (
            <div className="p-1">
              <button
                type="button"
                onClick={() => {
                  close();
                  inputRef.current?.click();
                }}
                className="w-full rounded-lg px-2.5 py-2 text-left text-sm text-neutral-200 transition hover:bg-white/[0.06]"
              >
                Replace cover
              </button>
              <button
                type="button"
                onClick={() => void remove(close)}
                className="w-full rounded-lg px-2.5 py-2 text-left text-sm text-danger transition hover:bg-danger/10"
              >
                Remove cover
              </button>
            </div>
          )}
        </Popover>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-lg bg-black/60 px-2.5 py-1.5 text-caption font-medium text-white backdrop-blur-sm transition hover:bg-black/80 disabled:opacity-60"
        >
          <Icon icon={Camera} size={16} />
          {busy ? "Uploading…" : "Add cover"}
        </button>
      )}

      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => void upload(e)} />
    </div>
  );
}

/** Admin-only, and only because every item in it is an admin action. See the component docstring. */
function AdminMenu({ group, onOpenManage, pendingRequests }: { group: GroupDetail; onOpenManage: () => void; pendingRequests?: number }) {
  const router = useRouter();
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");

  async function uploadAvatar(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    const form = new FormData();
    form.append("avatar", file);
    const res = await fetch(`/api/groups/${group.id}/avatar`, { method: "POST", body: form }).catch(() => null);
    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Upload failed.");
      return;
    }
    router.refresh();
  }

  return (
    <>
      <Popover
        align="end"
        ariaLabel="Community options"
        panelClassName="w-56"
        trigger={({ open, toggle, ref }) => (
          <button
            ref={ref}
            type="button"
            onClick={toggle}
            aria-expanded={open}
            aria-label="Community options"
            className={`flex size-8 items-center justify-center rounded-control border transition-colors duration-fast focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${
              open ? "border-white/25 bg-white/[0.1] text-white" : "border-white/10 text-secondary hover:border-white/30 hover:text-white"
            }`}
          >
            <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor" aria-hidden>
              <circle cx="4" cy="10" r="1.5" />
              <circle cx="10" cy="10" r="1.5" />
              <circle cx="16" cy="10" r="1.5" />
            </svg>
          </button>
        )}
      >
        {({ close }) => (
          <div className="p-1">
            <button
              type="button"
              onClick={() => {
                close();
                avatarInputRef.current?.click();
              }}
              className="w-full rounded-lg px-2.5 py-2 text-left text-sm text-neutral-200 transition hover:bg-white/[0.06]"
            >
              Change icon
            </button>
            <button
              type="button"
              onClick={() => {
                close();
                onOpenManage();
              }}
              className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-neutral-200 transition hover:bg-white/[0.06]"
            >
              Manage community
              {pendingRequests !== undefined && pendingRequests > 0 && (
                <span className="shrink-0 rounded-control bg-warning/15 px-1.5 py-0.5 text-caption font-semibold tabular text-warning">{pendingRequests}</span>
              )}
            </button>
            {error && <p className="px-2.5 pb-1.5 pt-0.5 text-caption leading-snug text-brand-text">{error}</p>}
          </div>
        )}
      </Popover>
      <input ref={avatarInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => void uploadAvatar(e)} />
    </>
  );
}
