"use client";

import { PersonAvatar } from "@/components/avatar/PersonAvatar";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert, Users } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Picker } from "@/components/ui/Picker";
import { Skeleton } from "@/components/ui/Skeleton";
import { TabList, TabPanels, Tabs, type TabItem } from "@/components/ui/Tabs";
import { useMinuteClock } from "@/hooks/useMinuteClock";
import { canDo } from "@/lib/communities";
import type { GroupBan, GroupDetail, GroupMember, GroupRole } from "@/lib/supabase/groups";
import { InvitePanel } from "./InvitePanel";

const ROLE_LABEL: Record<GroupRole, string> = { admin: "Admin", moderator: "Moderator", member: "Member" };

const ROLE_OPTIONS = [
  { value: "admin", label: "Admin", description: "Full control, including settings and deletion" },
  { value: "moderator", label: "Moderator", description: "Can approve posts and join requests" },
  { value: "member", label: "Member", description: "Can post, comment and predict" },
];

const MUTE_DURATIONS = [
  { value: "900", label: "15 minutes" },
  { value: "3600", label: "1 hour" },
  { value: "86400", label: "24 hours" },
  { value: "604800", label: "7 days" },
];

export type MembersTab = "members" | "invite" | "banned";

/** Whether this person gets "Manage members" (inviting, roles, bans) rather than a plain list. */
export function managesMembers(group: GroupDetail): boolean {
  return group.myRole === "admin" || canDo(group.permissions, "invite", group.myRole);
}

/**
 * Everything about the people in a community: who's here, ownership transfer, role management,
 * sole-admin safeguards, temporary mutes, and ban lists.
 */
export function GroupMembersTab({ group, myUserId, initialTab = "members" }: { group: GroupDetail; myUserId: string; initialTab?: MembersTab }) {
  const canInvite = canDo(group.permissions, "invite", group.myRole);
  const isAdmin = group.myRole === "admin";
  const items: TabItem<MembersTab>[] = [
    { value: "members", label: "Members", count: group.members.length },
    ...(canInvite ? [{ value: "invite" as const, label: "Invite" }] : []),
    ...(isAdmin ? [{ value: "banned" as const, label: "Banned" }] : []),
  ];
  const [tab, setTab] = useState<MembersTab>(items.some((i) => i.value === initialTab) ? initialTab : "members");
  const [bansKey, setBansKey] = useState(0);
  const adminCount = group.members.filter((m) => m.role === "admin").length;

  const list =
    group.members.length === 0 ? (
      <EmptyState icon={Users} message="This community is waiting for its first members." />
    ) : (
      <ul className="divide-y divide-white/[0.06]">
        {group.members.map((m) => (
          <MemberRow
            key={m.userId}
            groupId={group.id}
            groupName={group.name}
            createdBy={group.createdBy}
            adminCount={adminCount}
            member={m}
            myRole={group.myRole}
            myUserId={myUserId}
            onBanned={() => setBansKey((k) => k + 1)}
          />
        ))}
      </ul>
    );
  if (items.length === 1) return list;

  return (
    <Tabs value={tab} onValueChange={setTab} items={items}>
      <TabList aria-label="Members sections" />
      <TabPanels className="mt-5">
        {tab === "members" && list}
        {tab === "invite" && <InvitePanel group={group} />}
        {tab === "banned" && <BanList groupId={group.id} reloadKey={bansKey} />}
      </TabPanels>
    </Tabs>
  );
}

function MemberRow({
  groupId,
  groupName,
  createdBy,
  adminCount,
  member,
  myRole,
  myUserId,
  onBanned,
}: {
  groupId: string;
  groupName: string;
  createdBy: string;
  adminCount: number;
  member: GroupMember;
  myRole: GroupRole;
  myUserId: string;
  onBanned: () => void;
}) {
  const router = useRouter();
  const [role, setRole] = useState<GroupRole>(member.role);
  const [seen, setSeen] = useState(member.role);
  if (member.role !== seen) {
    setSeen(member.role);
    setRole(member.role);
  }
  const [confirm, setConfirm] = useState<"remove" | "ban" | "admin" | "transfer" | "mute" | null>(null);
  const [muteDuration, setMuteDuration] = useState<number>(3600);
  const [muteReason, setMuteReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [gone, setGone] = useState(false);
  const [error, setError] = useState("");

  const clock = useMinuteClock();
  const isOwner = createdBy === member.userId;
  const amOwner = createdBy === myUserId;
  const isSoleAdmin = member.role === "admin" && adminCount <= 1;
  const canManage = myRole === "admin" && member.userId !== myUserId && !isOwner;
  const canTransfer = amOwner && member.userId !== myUserId;
  const canMute = (myRole === "admin" || myRole === "moderator") && member.userId !== myUserId && member.role === "member" && !isOwner;
  const isMuted = Boolean(member.mutedUntil && new Date(member.mutedUntil).getTime() > clock);
  const name = member.displayName ?? member.username ?? "Member";

  async function changeRole(next: GroupRole) {
    if (isSoleAdmin && next !== "admin") {
      setError("This member is the sole admin. Promote another admin before stepping down.");
      return;
    }
    const before = role;
    setRole(next);
    setError("");
    const res = await fetch(`/api/groups/${groupId}/members/${member.userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: next }),
    }).catch(() => null);
    if (!res?.ok) {
      setRole(before);
      const body = (await res?.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Couldn't change the role. Check your connection and try again.");
      return;
    }
    router.refresh();
  }

  async function transferOwnership() {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/groups/${groupId}/transfer-ownership`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newOwnerId: member.userId }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Couldn't transfer ownership. Try again.");
      return;
    }
    setConfirm(null);
    router.refresh();
  }

  async function mute() {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/groups/${groupId}/members/${member.userId}/mute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ durationSeconds: muteDuration, reason: muteReason }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Couldn't mute this member.");
      return;
    }
    setConfirm(null);
    router.refresh();
  }

  async function unmute() {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/groups/${groupId}/members/${member.userId}/mute`, {
      method: "DELETE",
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Couldn't unmute this member.");
      return;
    }
    router.refresh();
  }

  async function remove(ban: boolean) {
    if (isSoleAdmin) {
      setError("Cannot remove the sole admin. Promote another admin first.");
      return;
    }
    setBusy(true);
    setError("");
    const res = await fetch(`/api/groups/${groupId}/members/${member.userId}${ban ? "?ban=1" : ""}`, { method: "DELETE" }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Couldn't remove them. Check your connection and try again.");
      return;
    }
    setGone(true);
    if (ban) onBanned();
    router.refresh();
  }

  if (gone) return null;
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-1 basis-48 items-center gap-3">
          <PersonAvatar id={member.userId} avatar={member.avatar} size={36} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate text-body-sm font-medium text-primary">{name}</p>
              {isOwner && (
                <span className="rounded-control bg-brand/15 px-1.5 py-0.5 text-caption font-semibold text-brand-text">
                  Owner
                </span>
              )}
              {isMuted && (
                <span className="rounded-control bg-amber-500/15 px-1.5 py-0.5 text-caption text-amber-400">
                  Muted
                </span>
              )}
            </div>
            <p className="text-caption text-tertiary">{member.points} pts</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {canManage ? (
            <>
              {isSoleAdmin ? (
                <span className="text-caption font-medium text-tertiary" title="Sole administrator">
                  Admin (Sole)
                </span>
              ) : (
                <Picker
                  options={ROLE_OPTIONS}
                  value={role}
                  onChange={(r) => (r === "admin" && role !== "admin" ? setConfirm("admin") : void changeRole(r as GroupRole))}
                  ariaLabel={`Role for ${name}`}
                  className="w-36"
                  align="end"
                />
              )}
              {!confirm && !isSoleAdmin && (
                <>
                  <Button variant="secondary" size="sm" onClick={() => setConfirm("remove")}>
                    Remove
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirm("ban")}>
                    Ban
                  </Button>
                </>
              )}
            </>
          ) : (
            !isOwner && role !== "member" && <span className="shrink-0 text-caption font-semibold text-tertiary">{ROLE_LABEL[role]}</span>
          )}

          {canMute && !confirm && (
            isMuted ? (
              <Button variant="secondary" size="sm" loading={busy} onClick={() => void unmute()}>
                Unmute
              </Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setConfirm("mute")}>
                Mute
              </Button>
            )
          )}

          {canTransfer && !confirm && (
            <Button variant="ghost" size="sm" onClick={() => setConfirm("transfer")} className="text-tertiary hover:text-brand-text">
              Transfer
            </Button>
          )}
        </div>
      </div>

      {confirm && (
        <div
          role="group"
          aria-label={
            confirm === "transfer"
              ? `Transfer ownership to ${name}`
              : confirm === "mute"
                ? `Mute ${name}`
                : confirm === "ban"
                  ? `Ban ${name}`
                  : confirm === "admin"
                    ? `Make ${name} an admin`
                    : `Remove ${name}`
          }
          className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-control bg-white/[0.04] px-3 py-2.5"
        >
          {confirm === "mute" ? (
            <div className="w-full space-y-2">
              <p className="text-body-sm font-medium text-primary">Mute {name} from posting and commenting</p>
              <div className="flex flex-wrap items-center gap-3">
                <Picker
                  options={MUTE_DURATIONS}
                  value={String(muteDuration)}
                  onChange={(val) => setMuteDuration(Number(val))}
                  ariaLabel="Mute duration"
                  className="w-36"
                />
                <input
                  type="text"
                  placeholder="Reason (optional)..."
                  value={muteReason}
                  onChange={(e) => setMuteReason(e.target.value)}
                  className="min-w-0 flex-1 rounded-control border border-white/10 bg-surface-1 px-2.5 py-1 text-caption text-primary placeholder:text-tertiary"
                  maxLength={120}
                />
                <span className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setConfirm(null)} disabled={busy}>
                    Cancel
                  </Button>
                  <Button variant="danger" size="sm" loading={busy} onClick={() => void mute()}>
                    Mute
                  </Button>
                </span>
              </div>
            </div>
          ) : (
            <>
              <p className="min-w-0 flex-1 basis-56 text-caption text-secondary">
                {confirm === "transfer"
                  ? `Transfer primary ownership of "${groupName}" to ${name}? They will gain permanent control of this community. You will remain an admin.`
                  : confirm === "admin"
                    ? `Make ${name} an admin? They get full control: settings, roles, bans and deleting the community.`
                    : confirm === "ban"
                      ? `Remove ${name} and ban them? They can't come back, and their invitation links stop working.`
                      : `Remove ${name}? Their invitation links stop working. They can rejoin later.`}
              </p>
              <span className="flex shrink-0 gap-2">
                <Button variant="ghost" size="sm" onClick={() => setConfirm(null)} disabled={busy}>
                  Cancel
                </Button>
                {confirm === "transfer" ? (
                  <Button variant="danger" size="sm" loading={busy} onClick={() => void transferOwnership()}>
                    Transfer ownership
                  </Button>
                ) : confirm === "admin" ? (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      setConfirm(null);
                      void changeRole("admin");
                    }}
                  >
                    Make admin
                  </Button>
                ) : (
                  <Button variant="danger" size="sm" loading={busy} onClick={() => void remove(confirm === "ban")}>
                    {confirm === "ban" ? "Remove and ban" : "Remove"}
                  </Button>
                )}
              </span>
            </>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-caption text-brand-text">
          {error}
        </p>
      )}
    </li>
  );
}

/** Who's banned, with Unban: an admin's view. */
function BanList({ groupId, reloadKey }: { groupId: string; reloadKey: number }) {
  const [bans, setBans] = useState<GroupBan[] | null | "error">(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/groups/${groupId}/bans`)
      .then((res) => (res.ok ? (res.json() as Promise<{ bans: GroupBan[] }>) : Promise.reject(new Error("failed"))))
      .then((body) => !cancelled && setBans(body.bans))
      .catch(() => !cancelled && setBans("error"));
    return () => {
      cancelled = true;
    };
  }, [groupId, reloadKey, retry]);

  async function unban(userId: string) {
    setBusy(userId);
    setError("");
    const res = await fetch(`/api/groups/${groupId}/bans/${userId}`, { method: "DELETE" }).catch(() => null);
    setBusy(null);
    if (!res?.ok) return setError("Couldn't lift that ban. Try again.");
    setBans((prev) => (Array.isArray(prev) ? prev.filter((b) => b.userId !== userId) : prev));
  }

  if (bans === null) {
    return (
      <div className="space-y-3">
        <Skeleton shape="block" className="h-12 w-full" />
        <Skeleton shape="block" className="h-12 w-full" />
      </div>
    );
  }
  if (bans === "error") {
    return (
      <div className="flex items-center gap-3 text-body-sm text-secondary">
        Couldn&apos;t load the ban list.
        <Button variant="secondary" size="sm" onClick={() => setRetry((r) => r + 1)}>
          Retry
        </Button>
      </div>
    );
  }
  if (bans.length === 0) {
    return <EmptyState icon={ShieldAlert} message="No one is banned from this community." />;
  }
  return (
    <div>
      <ul className="divide-y divide-white/[0.06]">
        {bans.map((b) => {
          const name = b.displayName ?? b.username ?? "Member";
          return (
            <li key={b.userId} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0 flex-1 basis-48">
                <p className="truncate text-body-sm font-medium text-primary">{name}</p>
                {b.reason && <p className="truncate text-caption text-secondary">{b.reason}</p>}
                <p className="text-caption text-tertiary">Banned {new Date(b.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</p>
              </div>
              <Button variant="secondary" size="sm" loading={busy === b.userId} onClick={() => void unban(b.userId)}>
                Unban
              </Button>
            </li>
          );
        })}
      </ul>
      {error && (
        <p role="alert" className="mt-2 text-caption text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
