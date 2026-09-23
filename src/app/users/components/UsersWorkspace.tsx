"use client";

import { useState } from "react";
import type { UserCounts, UserProfile } from "@/lib/supabase/users";
import type { UserInvite } from "@/lib/supabase/invites";
import { useInvites, useNow } from "../_hooks/useInvites";
import { InvitePanel } from "./InvitePanel";
import { InvitesTable } from "./InvitesTable";
import { UserManagement } from "./UserManagement";

type View = "members" | "invitations";

/** Stat-tile contract: sentence-case label, semibold value in a text token (never a series
 * colour), and no delta/trend — nothing here is measured against a previous period, and a
 * fabricated one would be worse than none. Proportional figures, not tabular: these are
 * standalone values, not a column that has to align vertically. */
function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-[var(--f1-line)] bg-black/20 px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-white">{value.toLocaleString()}</p>
    </div>
  );
}

/**
 * The page's shell: the roster figures, the invite form, and the Members/Invitations switch.
 *
 * Both tables live under one set of stat tiles rather than each carrying its own header block,
 * because "how many people are here" and "how many are on the way" are the same question asked
 * twice — splitting them across two screens would mean neither view ever answers it fully.
 */
export function UsersWorkspace({
  initialUsers,
  initialCursor,
  initialInvites,
  currentUid,
  canManageRoles,
  counts,
  pendingInvites,
  renderedAt,
}: {
  initialUsers: UserProfile[];
  initialCursor: string | null;
  initialInvites: UserInvite[];
  currentUid: string;
  canManageRoles: boolean;
  counts: UserCounts;
  pendingInvites: number;
  /** When the server rendered this page, used to seed the client clock — see useNow. */
  renderedAt: string;
}) {
  const [view, setView] = useState<View>("members");
  const now = useNow(renderedAt);

  // Seeded from the server render, and only refetched once the invitations view is actually
  // opened — an admin who never leaves the Members tab shouldn't be polling a table they aren't
  // looking at.
  const invites = useInvites(initialInvites, view === "invitations");
  const rows = invites.data ?? initialInvites;

  // Counted from the live rows once they've loaded so the tile tracks a revoke or a fresh invite
  // immediately, falling back to the server's own count until then.
  const pendingNow = invites.data
    ? invites.data.filter((i) => !i.acceptedAt && !i.revokedAt && new Date(i.expiresAt).getTime() > now).length
    : pendingInvites;

  const tabs: { value: View; label: string }[] = [
    { value: "members", label: `Members (${counts.total.toLocaleString()})` },
    { value: "invitations", label: `Invitations (${pendingNow.toLocaleString()})` },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile label="Total users" value={counts.total} />
        <StatTile label="Admins" value={counts.admins} />
        <StatTile label="Moderators" value={counts.moderators} />
        <StatTile label="Onboarded" value={counts.onboarded} />
        <StatTile label="Pending invites" value={pendingNow} />
      </div>

      {canManageRoles && <InvitePanel />}

      <div className="flex gap-1 rounded-full border border-[var(--f1-line)] bg-black/20 p-1 sm:w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setView(tab.value)}
            aria-pressed={view === tab.value}
            className={`flex-1 rounded-full px-4 py-1.5 text-xs font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--f1-red)] sm:flex-none ${
              view === tab.value ? "bg-white/[0.08] text-white" : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {view === "members" ? (
        <UserManagement
          initialUsers={initialUsers}
          initialCursor={initialCursor}
          currentUid={currentUid}
          canManageRoles={canManageRoles}
          counts={counts}
        />
      ) : (
        <InvitesTable invites={rows} canManage={canManageRoles} now={now} />
      )}
    </div>
  );
}
