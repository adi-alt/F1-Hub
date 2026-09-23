import type { Metadata } from "next";
import { UsersWorkspace } from "./components/UsersWorkspace";
import { getUserCounts, listUsers } from "./services/users.service";
import { getInvites, getPendingInviteCount } from "./services/invites.service";
import { NotAuthorized } from "@/components/NotAuthorized";
import { SignInGate } from "@/components/auth/SignInGate";
import { getSession } from "@/lib/session/getSession";
import { ServiceError } from "@/services/errors";

export const metadata: Metadata = {
  title: "Users",
  description: "Manage F1 Hub user accounts, roles and invitations.",
};

export default async function UsersPage() {
  const session = await getSession();
  if (!session.uid) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <SignInGate label="user management" />
      </div>
    );
  }

  let users, nextCursor, permissions, counts, invites, pendingInvites;
  try {
    // All four throw ServiceError themselves if this uid can't view users — nothing left to
    // re-check here. Issued together rather than in series: they hit two small tables, and the
    // page can't render until it has all of them anyway.
    [{ users, nextCursor, permissions }, counts, invites, pendingInvites] = await Promise.all([
      listUsers(session.uid, null),
      getUserCounts(session.uid),
      getInvites(session.uid),
      getPendingInviteCount(session.uid),
    ]);
  } catch (err) {
    if (err instanceof ServiceError) return <NotAuthorized what="user management" />;
    throw err;
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Users</h1>
        <p className="mt-1.5 text-sm text-neutral-500">
          {permissions.canManageRoles
            ? "Every account on F1 Hub — who holds which role, and who's been invited."
            : "Every account on F1 Hub. Only admins can change roles or send invitations."}
        </p>
      </div>
      <div className="mt-8">
        <UsersWorkspace
          initialUsers={users}
          initialCursor={nextCursor}
          initialInvites={invites}
          currentUid={session.uid}
          canManageRoles={permissions.canManageRoles}
          counts={counts}
          pendingInvites={pendingInvites}
          renderedAt={new Date().toISOString()}
        />
      </div>
    </div>
  );
}
