import Link from "next/link";
import { PipelineOpsPanel } from "@/components/admin/PipelineOpsPanel";
import { NotAuthorized } from "@/components/admin/NotAuthorized";
import { SignInGate } from "@/components/auth/SignInGate";
import { permissionsForRole } from "@/lib/rbac";
import { requireSessionAndRole } from "@/lib/session/requireSessionAndRole";

export default async function AdminPage() {
  const auth = await requireSessionAndRole();
  if (auth.status === "signed-out") {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <SignInGate label="the admin dashboard" />
      </div>
    );
  }

  const permissions = permissionsForRole(auth.role);
  if (!permissions.canAccessAdmin) return <NotAuthorized what="the admin dashboard" />;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <p className="text-xs font-semibold uppercase tracking-widest text-[var(--f1-red)]">Admin</p>
      <h1 className="text-3xl font-bold text-white">Dashboard</h1>

      <div className="mt-6 flex gap-3">
        <Link
          href="/admin/models"
          className="rounded-full border border-[var(--f1-line)] px-4 py-2 text-sm text-neutral-300 transition hover:border-white/30 hover:text-white"
        >
          Models →
        </Link>
        {permissions.canViewUsers && (
          <Link
            href="/admin/users"
            className="rounded-full border border-[var(--f1-line)] px-4 py-2 text-sm text-neutral-300 transition hover:border-white/30 hover:text-white"
          >
            Users →
          </Link>
        )}
      </div>

      {permissions.canTriggerPipelineRuns && (
        <div className="mt-8">
          <h2 className="mb-3 text-lg font-semibold text-white">Pipeline runs</h2>
          <PipelineOpsPanel />
        </div>
      )}
    </div>
  );
}
