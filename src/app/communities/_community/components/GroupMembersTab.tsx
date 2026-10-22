"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Users } from "lucide-react";
import { EntityAvatar } from "@/components/EntityAvatar";
import { Button } from "@/components/ui/Button";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Picker } from "@/components/ui/Picker";
import { Skeleton } from "@/components/ui/Skeleton";
import { TabList, TabPanels, Tabs, type TabItem } from "@/components/ui/Tabs";
import { canDo } from "@/lib/communities";
import type { GroupBan, GroupDetail, GroupMember, GroupRole } from "@/lib/supabase/groups";
import { InvitePanel } from "./InvitePanel";

const ROLE_LABEL: Record<GroupRole, string> = { admin: "Admin", moderator: "Moderator", member: "Member" };

// What each role can do, said in the picker itself.
const ROLE_OPTIONS = [
  { value: "admin", label: "Admin", description: "Full control, including settings and deletion" },
  { value: "moderator", label: "Moderator", description: "Can approve posts and join requests" },
  { value: "member", label: "Member", description: "Can post, comment and predict" },
];

export type MembersTab = "members" | "invite" | "banned";

/** Whether this person gets "Manage members" (inviting, roles, bans) rather than a plain list. */
export function managesMembers(group: GroupDetail): boolean {
  return group.myRole === "admin" || canDo(group.permissions, "invite", group.myRole);
}

/**
 * Everything about the people in a community, in one window: who's here (and, for an admin, their roles, Remove and
 * Ban), inviting more (for whoever the community lets invite), and who's banned (admins). Tabs, so the window stays
 * one manageable size whichever part is open.
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
  // Bumped when someone is banned here, so the Banned tab shows them.
  const [bansKey, setBansKey] = useState(0);

  const list =
    group.members.length === 0 ? (
      <EmptyState icon={Users} message="This community is waiting for its first members." />
    ) : (
      <ul className="divide-y divide-white/[0.06]">
        {group.members.map((m) => (
          <MemberRow key={m.userId} groupId={group.id} member={m} myRole={group.myRole} myUserId={myUserId} onBanned={() => setBansKey((k) => k + 1)} />
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

function MemberRow({ groupId, member, myRole, myUserId, onBanned }: { groupId: string; member: GroupMember; myRole: GroupRole; myUserId: string; onBanned: () => void }) {
  const router = useRouter();
  // Shown at once and saved behind it; put back if the save fails. Follows the server when it changes elsewhere.
  const [role, setRole] = useState<GroupRole>(member.role);
  const [seen, setSeen] = useState(member.role);
  if (member.role !== seen) {
    setSeen(member.role);
    setRole(member.role);
  }
  const [confirm, setConfirm] = useState<"remove" | "ban" | null>(null);
  const [busy, setBusy] = useState(false);
  const [gone, setGone] = useState(false);
  const [error, setError] = useState("");
  const canManage = myRole === "admin" && member.userId !== myUserId;
  const name = member.displayName ?? member.username ?? "Member";

  async function changeRole(next: GroupRole) {
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

  // `ban` also stops them coming straight back in (join, invitations and requests all check it).
  async function remove(ban: boolean) {
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
          <EntityAvatar imageUrl={member.avatarUrl ?? null} name={name} seed={member.userId} size={36} />
          <div className="min-w-0">
            <p className="truncate text-body-sm font-medium text-primary">{name}</p>
            <p className="text-caption text-tertiary">{member.points} pts</p>
          </div>
        </div>
        {canManage ? (
          <div className="flex shrink-0 items-center gap-2">
            <Picker options={ROLE_OPTIONS} value={role} onChange={(r) => void changeRole(r as GroupRole)} ariaLabel={`Role for ${name}`} className="w-36" align="end" />
            {!confirm && (
              <>
                <Button variant="secondary" size="sm" onClick={() => setConfirm("remove")}>
                  Remove
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirm("ban")}>
                  Ban
                </Button>
              </>
            )}
          </div>
        ) : (
          role !== "member" && <span className="shrink-0 text-caption font-semibold text-tertiary">{ROLE_LABEL[role]}</span>
        )}
      </div>

      {/* The question gets its own line under the person, so the row never has to squeeze it in. */}
      {confirm && (
        <div role="group" aria-label={confirm === "ban" ? `Ban ${name}` : `Remove ${name}`} className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-control bg-white/[0.04] px-3 py-2.5">
          <p className="min-w-0 flex-1 basis-56 text-caption text-secondary">
            {confirm === "ban" ? `Remove ${name} and ban them? They can't come back, and their invitation links stop working.` : `Remove ${name}? Their invitation links stop working. They can rejoin later.`}
          </p>
          <span className="flex shrink-0 gap-2">
            <Button variant="ghost" size="sm" onClick={() => setConfirm(null)} disabled={busy}>
              Keep
            </Button>
            <Button variant="danger" size="sm" loading={busy} onClick={() => void remove(confirm === "ban")}>
              {confirm === "ban" ? "Remove and ban" : "Remove"}
            </Button>
          </span>
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

  return (
    <section>
      <p className="text-caption text-tertiary">People removed with Ban can&apos;t rejoin, use an invitation or ask to join.</p>
      <div className="mt-3">
        {bans === null ? (
          <Skeleton shape="block" className="h-12 w-full" />
        ) : bans === "error" ? (
          <div className="flex items-center gap-3 text-body-sm text-secondary">
            Couldn&apos;t load the ban list.
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setBans(null);
                setRetry((k) => k + 1);
              }}
            >
              Retry
            </Button>
          </div>
        ) : bans.length === 0 ? (
          <p className="text-body-sm text-tertiary">No one is banned.</p>
        ) : (
          <ul className="divide-y divide-white/[0.06]">
            {bans.map((ban) => (
              <li key={ban.userId} className="flex items-center justify-between gap-3 py-3">
                <span className="min-w-0 truncate text-body-sm text-primary">{ban.displayName ?? ban.username ?? "Member"}</span>
                <ConfirmButton onConfirm={() => void unban(ban.userId)} question="Lift this ban?" confirmLabel="Unban" pending={busy === ban.userId}>
                  Unban
                </ConfirmButton>
              </li>
            ))}
          </ul>
        )}
        {error && (
          <p role="alert" className="mt-2 text-caption text-brand-text">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
