"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EntityAvatar } from "@/components/EntityAvatar";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { Picker } from "@/components/ui/Picker";
import type { GroupMember, GroupRole } from "@/lib/supabase/groups";

const ROLE_LABEL: Record<GroupRole, string> = { admin: "ADMIN", moderator: "MODERATOR", member: "MEMBER" };

// Descriptions matter here: "what does promoting someone to moderator actually let them do" was
// invisible in the native <select> this replaced.
const ROLE_OPTIONS = [
  { value: "admin", label: "Admin", description: "Full control, including settings and deletion" },
  { value: "moderator", label: "Moderator", description: "Can approve and remove posts" },
  { value: "member", label: "Member", description: "Can post, comment and predict" },
];

function MemberRow({ groupId, member, myRole, myUserId }: { groupId: string; member: GroupMember; myRole: GroupRole; myUserId: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [error, setError] = useState("");
  const canManage = myRole === "admin" && member.userId !== myUserId;

  async function setRole(role: GroupRole) {
    setStatus("saving");
    const res = await fetch(`/api/groups/${groupId}/members/${member.userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Could not update role.");
      setStatus("error");
      return;
    }
    router.refresh();
  }

  async function remove() {
    setStatus("saving");
    const res = await fetch(`/api/groups/${groupId}/members/${member.userId}`, { method: "DELETE" });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Could not remove member.");
      setStatus("error");
      return;
    }
    router.refresh();
  }

  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-[var(--f1-line)] bg-black/20 px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <EntityAvatar imageUrl={null} name={member.displayName ?? member.username ?? "M"} size={32} />
        <div className="min-w-0">
          <p className="truncate text-sm text-neutral-200">{member.displayName ?? member.username ?? "Member"}</p>
          <p className="text-xs text-neutral-500">{member.points} pts</p>
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
          member.role !== "member" && <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">{ROLE_LABEL[member.role]}</span>
        )}
        {canManage && (
          <ConfirmButton
            onConfirm={() => void remove()}
            question="Remove?"
            confirmLabel="Remove"
            pending={status === "saving"}
          >
            Remove
          </ConfirmButton>
        )}
      </div>
      {error && <p className="w-full text-xs text-[var(--f1-red)]">{error}</p>}
    </li>
  );
}

export function GroupMembersTab({ groupId, members, myRole, myUserId }: { groupId: string; members: GroupMember[]; myRole: GroupRole; myUserId: string }) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {members.map((m) => (
        <MemberRow key={m.userId} groupId={groupId} member={m} myRole={myRole} myUserId={myUserId} />
      ))}
    </ul>
  );
}
