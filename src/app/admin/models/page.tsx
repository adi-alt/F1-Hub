import Link from "next/link";
import { BenchmarksTable } from "@/components/admin/BenchmarksTable";
import { NotAuthorized } from "@/components/admin/NotAuthorized";
import { SignInGate } from "@/components/auth/SignInGate";
import { getSession } from "@/lib/session/getSession";
import { getBenchmarks } from "@/services/admin.service";
import { ServiceError } from "@/services/errors";

export default async function AdminModelsPage() {
  const session = await getSession();
  if (!session.uid) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <SignInGate label="model benchmarks" />
      </div>
    );
  }

  let benchmarks;
  try {
    benchmarks = await getBenchmarks(session.uid);
  } catch (err) {
    if (err instanceof ServiceError) return <NotAuthorized what="model benchmarks" />;
    throw err;
  }

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
