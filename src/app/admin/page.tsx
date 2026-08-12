import { BenchmarksTable } from "@/components/admin/BenchmarksTable";
import { PipelineOpsPanel } from "@/components/admin/PipelineOpsPanel";
import { UserManagement } from "@/components/admin/UserManagement";
import { SignInGate } from "@/components/auth/SignInGate";
import { getModelBenchmarks } from "@/lib/firestore/admin";
import { listUsers } from "@/lib/firestore/users";
import { getSession } from "@/lib/session/getSession";
import { isAdmin } from "@/lib/session/isAdmin";

export default async function AdminPage() {
  const session = await getSession();

  if (!session.uid) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <SignInGate label="the admin dashboard" />
      </div>
    );
  }

  if (!(await isAdmin(session.uid))) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <div className="rounded-2xl border border-[var(--f1-line)] bg-[var(--f1-carbon)] p-10 text-center">
          <p className="text-lg font-semibold text-white">Not authorized</p>
          <p className="mt-2 text-sm text-neutral-400">The admin dashboard is restricted.</p>
        </div>
      </div>
    );
  }

  const [benchmarks, users] = await Promise.all([getModelBenchmarks(), listUsers()]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <p className="text-xs font-semibold uppercase tracking-widest text-[var(--f1-red)]">Admin</p>
      <h1 className="text-3xl font-bold text-white">Dashboard</h1>

      <div className="mt-8 space-y-10">
        <div>
          <h2 className="mb-3 text-lg font-semibold text-white">Model benchmarks</h2>
          <BenchmarksTable benchmarks={benchmarks} />
        </div>
        <div>
          <h2 className="mb-3 text-lg font-semibold text-white">Pipeline runs</h2>
          <PipelineOpsPanel />
        </div>
        <div>
          <h2 className="mb-3 text-lg font-semibold text-white">Users</h2>
          <UserManagement users={users} currentUid={session.uid} />
        </div>
      </div>
    </div>
  );
}
