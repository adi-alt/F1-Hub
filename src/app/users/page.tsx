import { NotAuthorized } from "@/components/NotAuthorized";
import { UserManagement } from "@/components/users/UserManagement";
import { SignInGate } from "@/components/auth/SignInGate";
import { getSession } from "@/lib/session/getSession";
import { listUsers } from "@/users/services/users.service";
import { ServiceError } from "@/services/errors";

export default async function UsersPage() {
  const session = await getSession();
  if (!session.uid) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <SignInGate label="user management" />
      </div>
    );
  }

  let users, nextCursor, permissions;
  try {
    // listUsers throws ServiceError itself if this uid can't view users — nothing left to
    // re-check here.
    ({ users, nextCursor, permissions } = await listUsers(session.uid, null));
  } catch (err) {
    if (err instanceof ServiceError) return <NotAuthorized what="user management" />;
    throw err;
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold text-white">Users</h1>
      <div className="mt-8">
        <UserManagement
          initialUsers={users}
          initialCursor={nextCursor}
          currentUid={session.uid}
          canManageRoles={permissions.canManageRoles}
        />
      </div>
    </div>
  );
}
