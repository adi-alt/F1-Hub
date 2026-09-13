import type { Metadata } from "next";
import { BenchmarksTable } from "./components/BenchmarksTable";
import { PipelineOpsPanel } from "./components/PipelineOpsPanel";
import { getModelsPageData } from "./services/models.service";
import { NotAuthorized } from "@/components/NotAuthorized";
import { SignInGate } from "@/components/auth/SignInGate";
import { getSession } from "@/lib/session/getSession";
import { ServiceError } from "@/services/errors";

export const metadata: Metadata = {
  title: "Models",
  description: "Benchmark runs and pipeline operations for F1 Hub's prediction models.",
};

export default async function ModelsPage() {
  const session = await getSession();
  if (!session.uid) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <SignInGate label="model benchmarks" />
      </div>
    );
  }

  let benchmarks, permissions;
  try {
    ({ benchmarks, permissions } = await getModelsPageData(session.uid));
  } catch (err) {
    if (err instanceof ServiceError) return <NotAuthorized what="model benchmarks" />;
    throw err;
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold text-white">Models</h1>
      <div className="mt-8">
        <BenchmarksTable benchmarks={benchmarks} />
      </div>
      {permissions.canTriggerPipelineRuns && (
        <div className="mt-10">
          <h2 className="mb-3 text-lg font-semibold text-white">Pipeline runs</h2>
          <PipelineOpsPanel />
        </div>
      )}
    </div>
  );
}
