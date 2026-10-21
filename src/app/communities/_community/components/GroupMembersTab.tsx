"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Users } from "lucide-react";
import { EntityAvatar } from "@/components/EntityAvatar";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Picker } from "@/components/ui/Picker";
import { EYEBROW } from "@/components/ui/panel";
import type { GroupBan, GroupMember, GroupRole } from "@/lib/supabase/groups";

const ROLE_LABEL: Record<GroupRole, string> = { admin: "Admin", moderator: "Moderator", member: "Member" };

// Descriptions matter here: "what does promoting someone to moderator actually let them do" was
// invisible in the native <select> this replaced.
const ROLE_OPTIONS = [
  { value: "admin", label: "Admin", description: "Full control, including settings and deletion" },
  { value: "moderator", label: "Moderator", description: "Can approve posts and join requests" },
  { value: "member", label: "Member", description: "Can post, comment and predict" },
];

function MemberRow({ groupId, member, myRole, myUserId, onRemoved }: { groupId: string; member: GroupMember; myRole: GroupRole; myUserId: string; onRemoved: (banned: boolean) => void }) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [error, setError] = useState("");
  const canManage = myRole === "admin" && member.userId !== myUserId;

  async function setRole(role: GroupRole) {
    setStatus("saving");
    setError("");
    const res = await fetch(`/api/groups/${groupId}/members/${member.userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    }).catch(() => null);
    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Couldn't change the role. Check your connection and try again.");
      setStatus("error");
      return;
    }
    setStatus("idle");
    router.refresh();
  }

  // `ban` also stops them coming straight back in (join, invitations and requests all check it) -
  // without it, removing someone from a public community only lasts until they click Join again.
  async function remove(ban = false) {
    setStatus("saving");
    setError("");
    const res = await fetch(`/api/groups/${groupId}/members/${member.userId}${ban ? "?ban=1" : ""}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Couldn't remove them. Check your connection and try again.");
      setStatus("error");
      return;
    }
    onRemoved(ban);
    router.refresh();
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <EntityAvatar imageUrl={member.avatarUrl ?? null} name={member.displayName ?? member.username ?? "M"} seed={member.userId} size={32} />
        <div className="min-w-0">
          <p className="truncate text-sm text-neutral-200">{member.displayName ?? member.username ?? "Member"}</p>
          <p className="text-xs text-tertiary">{member.points} pts</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {canManage ? (
          <Picker
            options={ROLE_OPTIONS}
            value={member.role}
            onChange={(role) => void setRole(role as GroupRole)}
            disabled={status === "saving"}
            ariaLabel={`Role for ${member.displayName ?? member.username ?? "member"}`}
            className="w-36"
            align="end"
          />
        ) : (
          member.role !== "member" && <span className="text-caption font-semibold text-tertiary">{ROLE_LABEL[member.role]}</span>
        )}
        {canManage && (
          <ConfirmButton
            onConfirm={() => void remove()}
            question="Remove? Their invitation links stop working."
            confirmLabel="Remove"
            pending={status === "saving"}
          >
            Remove
          </ConfirmButton>
        )}
        {canManage && (
          <ConfirmButton
            onConfirm={() => void remove(true)}
            question="Remove and ban? They can't come back."
            confirmLabel="Ban"
            pending={status === "saving"}
          >
            Ban
          </ConfirmButton>
        )}
      </div>
      {error && <p className="w-full text-xs text-brand-text">{error}</p>}
    </li>
  );
}

export function GroupMembersTab({ groupId, members, myRole, myUserId }: { groupId: string; members: GroupMember[]; myRole: GroupRole; myUserId: string }) {
  // Bumped when someone is banned here, so the list below picks them up.
  const [bansKey, setBansKey] = useState(0);
  // Every real community has at least its creator (createGroup inserts them as admin in the same
  // write that makes the row) - this is defensive, not a state the product flow can actually reach.
  if (members.length === 0) {
    return <EmptyState icon={Users} message="This community is waiting for its first members." />;
  }

  // One column: this opens in a window, where two would leave no room for a name beside the role controls.
  return (
    <div className="space-y-8">
      <ul className="grid gap-2">
        {members.map((m) => (
          <MemberRow key={m.userId} groupId={groupId} member={m} myRole={myRole} myUserId={myUserId} onRemoved={(banned) => banned && setBansKey((k) => k + 1)} />
        ))}
      </ul>
      {myRole === "admin" && <BanList groupId={groupId} reloadKey={bansKey} />}
    </div>
  );
}

/** Who's banned, beside the people they were removed from: an admin's view, with Unban. */
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
      <h3 className={EYEBROW}>Banned</h3>
      <p className="mt-1 text-caption text-tertiary">People removed with Ban can&apos;t rejoin, use an invitation or ask to join.</p>
      <div className="mt-3">
        {bans === null ? (
          <div className="skeleton-shimmer h-12 rounded-lg bg-white/[0.04]" />
        ) : bans === "error" ? (
          <p className="text-body-sm text-secondary">
            Couldn&apos;t load the ban list.{" "}
            <button type="button" onClick={() => { setBans(null); setRetry((k) => k + 1); }} className="underline underline-offset-2 hover:text-primary">
              Retry
            </button>
          </p>
        ) : bans.length === 0 ? (
          <p className="text-body-sm text-tertiary">No one is banned.</p>
        ) : (
          <ul className="grid gap-2">
            {bans.map((ban) => (
              <li key={ban.userId} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2.5">
                <span className="min-w-0 truncate text-body-sm text-primary">{ban.displayName ?? ban.username ?? "Member"}</span>
                <ConfirmButton onConfirm={() => void unban(ban.userId)} question="Lift this ban?" confirmLabel="Unban" pending={busy === ban.userId}>
                  Unban
                </ConfirmButton>
              </li>
            ))}
          </ul>
        )}
        {error && <p role="alert" className="mt-2 text-caption text-brand-text">{error}</p>}
      </div>
    </section>
  );
}
