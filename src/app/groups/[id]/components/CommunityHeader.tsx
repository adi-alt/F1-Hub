"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { EntityAvatar } from "@/components/EntityAvatar";
import { Popover } from "@/components/ui/Popover";
import { communityTypeMeta, visibilityLabel } from "@/lib/communities";
import { compactCount } from "@/lib/format";
import type { GroupDetail } from "@/lib/supabase/groups";
import { GroupBanner } from "../../components/GroupBanner";

/**
 * The community identity block: cover, avatar, name, what kind of community it is, and the actions
 * that belong at this level - sharing, the membership menu, and (for an admin) the overflow that
 * holds the things only an admin can do.
 *
 * Deliberately NOT enormous - GroupBanner's flatter "header" ratio, a 64px avatar, and three lines
 * of metadata, so the actual content starts near the top of the viewport rather than a screen down.
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
  memberCount,
  pendingRequests,
  onOpenManage,
}: {
  group: GroupDetail;
  memberCount: number;
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
      <div className="relative overflow-hidden rounded-2xl border border-[var(--f1-line)]">
        <GroupBanner bannerUrl={group.bannerUrl} seed={group.id} variant="header" />

        {/* The tagline sits ON the cover, which is the whole reason it's a separate field from the
            description below the name. Right-aligned and capped so it can never grow into the
            avatar's corner, and simply absent when a community hasn't set one. */}
        {group.tagline && (
          <p className="pointer-events-none absolute inset-y-0 right-4 hidden max-w-[min(55%,26rem)] items-center text-right text-[15px] font-medium leading-snug text-white/95 drop-shadow-[0_2px_8px_rgba(0,0,0,0.75)] sm:flex sm:text-lg">
            <span className="line-clamp-2">{group.tagline}</span>
          </p>
        )}

        {isAdmin && <ChangeCoverButton groupId={group.id} hasBanner={!!group.bannerUrl} />}
      </div>

      <div className="px-1">
        <div className="-mt-8 flex items-end justify-between gap-3">
          {/* relative z-10 is load-bearing, not decoration: the cover above is `relative` (it has
              to be, for the tagline overlay and the cover control positioned inside it), and a
              positioned element paints over a later non-positioned sibling. Without this the
              avatar - which deliberately overlaps the cover by -mt-8 - is drawn UNDERNEATH it and
              its top half disappears. */}
          <span className="relative z-10 rounded-full ring-4 ring-[var(--background)]">
            <EntityAvatar imageUrl={group.avatarUrl} name={group.name} seed={group.id} size={64} />
          </span>

          <div className="mb-1 flex items-center gap-2">
            <button
              type="button"
              onClick={() => void share()}
              className="flex items-center gap-1.5 rounded-full border border-[var(--f1-line)] px-3 py-1.5 text-xs font-medium text-neutral-300 transition hover:border-white/30 hover:text-white"
            >
              <ShareIcon />
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

            {isAdmin && <AdminMenu group={group} onOpenManage={onOpenManage} pendingRequests={pendingRequests} />}
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

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs text-neutral-400">
          <Pill>{meta.label}</Pill>
          {group.topic && (
            <Pill>
              <span aria-hidden className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-[var(--f1-red)] align-middle" />
              {group.topic}
            </Pill>
          )}
          {group.tags.map((tag) => (
            <Pill key={tag}>#{tag}</Pill>
          ))}
          <Pill>{visibilityLabel(group.visibility)}</Pill>
        </div>

        <p className="mt-2.5 text-xs text-neutral-500">
          {compactCount(memberCount)} member{memberCount === 1 ? "" : "s"} · Created{" "}
          {new Date(group.createdAt).toLocaleDateString(undefined, { month: "short", year: "numeric" })}
        </p>
      </div>
    </header>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full border border-[var(--f1-line)] px-2.5 py-0.5 leading-5">{children}</span>;
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
    <div className="absolute bottom-2.5 right-2.5 flex flex-col items-end gap-1.5">
      {error && <p className="max-w-[16rem] rounded-md bg-black/80 px-2 py-1 text-right text-[11px] leading-snug text-[var(--f1-red)]">{error}</p>}

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
              className="flex items-center gap-1.5 rounded-lg bg-black/60 px-2.5 py-1.5 text-[11px] font-medium text-white backdrop-blur-sm transition hover:bg-black/80 disabled:opacity-60"
            >
              <CameraIcon />
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
                className="w-full rounded-lg px-2.5 py-2 text-left text-sm text-[var(--f1-red)] transition hover:bg-[var(--f1-red)]/10"
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
          className="flex items-center gap-1.5 rounded-lg bg-black/60 px-2.5 py-1.5 text-[11px] font-medium text-white backdrop-blur-sm transition hover:bg-black/80 disabled:opacity-60"
        >
          <CameraIcon />
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
            className={`flex h-[30px] w-[30px] items-center justify-center rounded-full border transition ${
              open ? "border-white/25 bg-white/[0.1] text-white" : "border-[var(--f1-line)] text-neutral-400 hover:border-white/30 hover:text-white"
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
                <span className="shrink-0 rounded-full bg-[var(--f1-red)]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--f1-red)]">{pendingRequests}</span>
              )}
            </button>
            {error && <p className="px-2.5 pb-1.5 pt-0.5 text-[11px] leading-snug text-[var(--f1-red)]">{error}</p>}
          </div>
        )}
      </Popover>
      <input ref={avatarInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => void uploadAvatar(e)} />
    </>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="none" aria-hidden>
      <circle cx="12.4" cy="3.6" r="2" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="3.6" cy="8" r="2" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="12.4" cy="12.4" r="2" stroke="currentColor" strokeWidth="1.3" />
      <path d="m5.4 7 5.2-2.6M5.4 9l5.2 2.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="none" aria-hidden>
      <path d="M2.2 5.4h2.3l1-1.6h5l1 1.6h2.3v7.2H2.2V5.4Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <circle cx="8" cy="9" r="2.2" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}
