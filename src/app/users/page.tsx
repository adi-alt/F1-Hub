import type { Metadata } from "next";
import { UserManagement } from "./components/UserManagement";
import { getUserCounts, listUsers } from "./services/users.service";
import { NotAuthorized } from "@/components/NotAuthorized";
import { SignInGate } from "@/components/auth/SignInGate";
import { getSession } from "@/lib/session/getSession";
import { ServiceError } from "@/services/errors";

export const metadata: Metadata = {
  title: "Users",
  description: "Manage F1 Hub user accounts and roles.",
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

  let users, nextCursor, permissions, counts;
  try {
    // Both throw ServiceError themselves if this uid can't view users — nothing left to re-check
    // here. Issued together: the counts are four `head: true` queries against the same table the
    // first page reads, so there's no reason to make the page wait for them in series.
    [{ users, nextCursor, permissions }, counts] = await Promise.all([listUsers(session.uid, null), getUserCounts(session.uid)]);
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
            ? "Every account on F1 Hub, and who holds which role."
            : "Every account on F1 Hub. Only admins can change roles."}
        </p>
      </div>
      <div className="mt-8">
        <UserManagement
          initialUsers={users}
          initialCursor={nextCursor}
          currentUid={session.uid}
          canManageRoles={permissions.canManageRoles}
          counts={counts}
        />
      </div>
    </div>
  );
}
