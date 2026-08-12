import Link from "next/link";
import { BenchmarksTable } from "@/components/admin/BenchmarksTable";
import { NotAuthorized } from "@/components/admin/NotAuthorized";
import { SignInGate } from "@/components/auth/SignInGate";
import { getModelBenchmarks } from "@/lib/firestore/admin";
import { permissionsForRole } from "@/lib/rbac";
import { requireSessionAndRole } from "@/lib/session/requireSessionAndRole";

export default async function AdminModelsPage() {
  const auth = await requireSessionAndRole();
  if (auth.status === "signed-out") {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <SignInGate label="model benchmarks" />
      </div>
    );
  }
  if (!permissionsForRole(auth.role).canAccessAdmin) return <NotAuthorized what="model benchmarks" />;

  const benchmarks = await getModelBenchmarks();

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <Link href="/admin" className="text-sm text-neutral-500 hover:text-neutral-300">
        ← Admin
      </Link>
      <h1 className="mt-2 text-3xl font-bold text-white">Models</h1>
      <div className="mt-8">
        <BenchmarksTable benchmarks={benchmarks} />
      </div>
    </div>
  );
}
