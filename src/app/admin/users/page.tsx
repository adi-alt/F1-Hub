import Link from "next/link";
import { NotAuthorized } from "@/components/admin/NotAuthorized";
import { UserManagement } from "@/components/admin/UserManagement";
import { SignInGate } from "@/components/auth/SignInGate";
import { listUsersPage } from "@/lib/firestore/users";
import { permissionsForRole } from "@/lib/rbac";
import { requireSessionAndRole } from "@/lib/session/requireSessionAndRole";

export default async function AdminUsersPage() {
  const auth = await requireSessionAndRole();
  if (auth.status === "signed-out") {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <SignInGate label="user management" />
      </div>
    );
  }

  const permissions = permissionsForRole(auth.role);
  if (!permissions.canViewUsers) return <NotAuthorized what="user management" />;

  const { users, nextCursor } = await listUsersPage(null);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <Link href="/admin" className="text-sm text-neutral-500 hover:text-neutral-300">
        ← Admin
      </Link>
      <h1 className="mt-2 text-3xl font-bold text-white">Users</h1>
      <div className="mt-8">
        <UserManagement
          initialUsers={users}
          initialCursor={nextCursor}
          currentUid={auth.uid}
          canManageRoles={permissions.canManageRoles}
        />
      </div>
    </div>
  );
}
