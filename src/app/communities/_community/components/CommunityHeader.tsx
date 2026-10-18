"use client";

import { useRef, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Camera, Check, Ellipsis, EllipsisVertical, FileText, Image as ImageIcon, Images, Settings, Share2, Trash2, Users, type LucideIcon } from "lucide-react";
import { EntityAvatar } from "@/components/EntityAvatar";
import { Icon } from "@/components/ui/Icon";
import { Popover } from "@/components/ui/Popover";
import { EYEBROW } from "@/components/ui/panel";
import { communityTypeMeta, visibilityLabel } from "@/lib/communities";
import type { GroupDetail } from "@/lib/supabase/groups";
import { GroupBanner } from "../../components/GroupBanner";
import { groupHref } from "@/lib/routes";

/** The community's secondary sections, which open as windows over the page rather than replacing the feed. */
export type CommunityWindow = "media" | "members" | "about" | "manage";

const WINDOW_ITEMS: { value: CommunityWindow; label: string; icon: LucideIcon }[] = [
  { value: "media", label: "Media", icon: Images },
  { value: "members", label: "Members", icon: Users },
  { value: "about", label: "About", icon: FileText },
];

/**
 * The community's head, drawn as the circuit page draws its own: the cover full-bleed behind it, fading into the page;
 * a breadcrumb back to Communities; then the avatar, an eyebrow naming the kind of community, the name and the
 * membership button, kept compact so the feed starts near the top. Everything else - sharing, the secondary sections
 * (media, members, about), and for an admin the cover, the icon and Manage - lives in one menu at the top right,
 * and the sections open as windows over the page.
 *
 * There is no per-community notification setting in the membership menu: `profiles` has two global flags and nothing
 * per-community, so such a setting would change nothing. Left out rather than faked.
 */
export function CommunityHeader({
  group,
  windows,
  pendingRequests,
  onOpenWindow,
}: {
  group: GroupDetail;
  /** The windows this community has (its modules, and Manage for an admin), in menu order. */
  windows: CommunityWindow[];
  /** Only ever passed for admins/moderators, so a waiting request is visible without opening Manage. */
  pendingRequests?: number;
  onOpenWindow: (window: CommunityWindow) => void;
}) {
  const router = useRouter();
  const meta = communityTypeMeta(group.communityType);
  const isAdmin = group.myRole === "admin";
  const [copied, setCopied] = useState(false);
  const [leaveError, setLeaveError] = useState("");
  const [leaving, setLeaving] = useState(false);
  const [busy, setBusy] = useState<"cover" | "icon" | null>(null);
  const [uploadError, setUploadError] = useState("");
  const coverInputRef = useRef<HTMLInputElement>(null);
  const iconInputRef = useRef<HTMLInputElement>(null);

  async function share() {
    const url = `${window.location.origin}${groupHref(group.id)}`;
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
    router.push("/?section=communities");
    router.refresh();
  }

  /** Cover and icon go through the same endpoints Manage > Appearance uses: one upload path, one set of limits. */
  async function upload(kind: "cover" | "icon", e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(kind);
    setUploadError("");
    const form = new FormData();
    form.append(kind === "cover" ? "banner" : "avatar", file);
    const res = await fetch(`/api/groups/${group.id}/${kind === "cover" ? "banner" : "avatar"}`, { method: "POST", body: form }).catch(() => null);
    setBusy(null);
    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as { error?: string } | null;
      setUploadError(body?.error ?? "Upload failed.");
      return;
    }
    router.refresh();
  }

  async function removeCover() {
    setBusy("cover");
    setUploadError("");
    const res = await fetch(`/api/groups/${group.id}/banner`, { method: "DELETE" }).catch(() => null);
    setBusy(null);
    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as { error?: string } | null;
      setUploadError(body?.error ?? "Could not remove cover.");
      return;
    }
    router.refresh();
  }

  const sections = WINDOW_ITEMS.filter((w) => windows.includes(w.value));

  // The membership button: beside the name, and on a phone up beside the menu, where the name has the row to itself.
  const membership = (
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
          className="flex h-8 shrink-0 items-center gap-1.5 rounded-control border border-strong bg-surface-2 px-3 text-body-sm font-medium text-primary transition-colors duration-fast hover:bg-surface-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
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
  );

  return (
    <header className="relative pb-6 pt-6 lg:pt-8">
      {/* Full-bleed, as the circuit page's photography is: the cover runs edge to edge behind the head and fades into
          the page, rather than sitting in a box. A community without a cover gets its own generated gradient. */}
      <div aria-hidden className="pointer-events-none absolute inset-y-0 left-1/2 -z-10 w-screen -translate-x-1/2 overflow-hidden">
        <GroupBanner bannerUrl={group.bannerUrl} seed={group.id} variant="backdrop" />
        <div className="absolute inset-0 bg-gradient-to-b from-surface-0/35 via-surface-0/75 to-surface-0" />
      </div>

      <div className="mb-6 flex items-start justify-between gap-3">
        {/* Back to Communities the way the circuit page goes back to Circuits: a breadcrumb, not a lone arrow. */}
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 pt-1.5 text-body-sm">
          <Link href="/?section=communities" className="shrink-0 rounded-control text-secondary transition-colors duration-fast hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring">
            Communities
          </Link>
          <span aria-hidden className="text-tertiary">
            /
          </span>
          <span className="truncate text-primary" aria-current="page">
            {group.name}
          </span>
        </nav>

        <div className="relative z-20 flex shrink-0 flex-col items-end gap-1.5">
          <div className="flex items-center gap-2">
          <div className="sm:hidden">{membership}</div>
          <Popover
            align="end"
            ariaLabel="Community menu"
            panelClassName="w-56"
            trigger={({ open, toggle, ref }) => (
              <button
                ref={ref}
                type="button"
                onClick={toggle}
                aria-expanded={open}
                aria-label="Community menu"
                title="Community menu"
                className={`relative flex size-8 items-center justify-center rounded-control border text-primary backdrop-blur-sm transition-colors duration-fast focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${open ? "border-white/25 bg-black/60" : "border-white/10 bg-black/35 hover:border-white/25 hover:bg-black/55"}`}
              >
                <Icon icon={busy ? Ellipsis : EllipsisVertical} size={16} />
                {/* A join request waiting is worth seeing before the menu is opened. */}
                {pendingRequests !== undefined && pendingRequests > 0 && <span aria-hidden className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-warning" />}
              </button>
            )}
          >
            {({ close }) => {
              const item = (label: string, icon: LucideIcon, onClick: () => void, extra?: React.ReactNode, danger = false) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => {
                    close();
                    onClick();
                  }}
                  className={`flex w-full items-center gap-2.5 rounded-control px-2.5 py-2 text-left text-body-sm transition-colors duration-fast ${danger ? "text-danger hover:bg-danger/10" : "text-primary hover:bg-white/[0.06]"}`}
                >
                  <Icon icon={icon} size={16} className={danger ? "" : "text-tertiary"} />
                  <span className="min-w-0 flex-1">{label}</span>
                  {extra}
                </button>
              );
              return (
                <div className="p-1">
                  {item(copied ? "Link copied" : "Share", Share2, () => void share())}
                  <div className="my-1 border-t border-white/10" />
                  {sections.map((s) => item(s.label, s.icon, () => onOpenWindow(s.value)))}
                  {isAdmin && (
                    <>
                      <div className="my-1 border-t border-white/10" />
                      {item(group.bannerUrl ? "Change cover" : "Add cover", Camera, () => coverInputRef.current?.click())}
                      {group.bannerUrl && item("Remove cover", Trash2, () => void removeCover(), undefined, true)}
                      {item("Change icon", ImageIcon, () => iconInputRef.current?.click())}
                      {windows.includes("manage") &&
                        item(
                          "Manage",
                          Settings,
                          () => onOpenWindow("manage"),
                          pendingRequests !== undefined && pendingRequests > 0 ? (
                            <span className="shrink-0 rounded-control bg-warning/15 px-1.5 py-0.5 text-caption font-semibold tabular text-warning">{pendingRequests}</span>
                          ) : undefined,
                        )}
                    </>
                  )}
                </div>
              );
            }}
          </Popover>
          </div>
          {uploadError && <p className="max-w-[16rem] rounded-control bg-black/80 px-2 py-1 text-right text-caption leading-snug text-brand-text">{uploadError}</p>}
        </div>
      </div>

      <div className="flex items-end gap-4">
        <span className="shrink-0 rounded-full ring-2 ring-white/10">
          <EntityAvatar imageUrl={group.avatarUrl} name={group.name} seed={group.id} size={64} />
        </span>
        <div className="min-w-0 flex-1">
          <p className={`line-clamp-2 ${EYEBROW}`}>
            {meta.label} · {visibilityLabel(group.visibility)}
            {group.topic ? ` · ${group.topic}` : ""}
          </p>
          <h1 className="break-words text-title-lg text-primary sm:text-display-md">{group.name}</h1>
        </div>

        <div className="hidden shrink-0 sm:block">{membership}</div>
      </div>

      {(group.description || group.tagline) && (
        <p className="mt-4 line-clamp-2 max-w-3xl text-body-sm text-secondary">
          {group.tagline && <span className="font-medium text-primary">{group.tagline} </span>}
          {group.description}
        </p>
      )}

      {isAdmin && (
        <>
          <input ref={coverInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => void upload("cover", e)} />
          <input ref={iconInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => void upload("icon", e)} />
        </>
      )}
    </header>
  );
}
