import { listRecentRuns, triggerWorkflow, type WorkflowRun } from "@/lib/github";
import { getModelBenchmarks, type ModelBenchmark } from "@/lib/supabase/modelBenchmarks";
import { requirePermission } from "@/lib/session/requirePermission";
import { ServiceError } from "@/services/errors";

const PIPELINE_WORKFLOWS = ["fetch-races.yml", "sync-calendar.yml"] as const;

export async function listPipelineRuns(
  requesterUid: string | null | undefined,
): Promise<{ workflow: string; runs: WorkflowRun[] }[]> {
  await requirePermission(requesterUid, (p) => p.canAccessAdmin);
  return Promise.all(
    PIPELINE_WORKFLOWS.map(async (workflow) => ({ workflow, runs: await listRecentRuns(workflow) })),
  );
}

// A mutating, admin-only action (moderators can view runs but not trigger them).
export async function triggerPipelineRun(requesterUid: string | null | undefined, workflow: string): Promise<void> {
  await requirePermission(requesterUid, (p) => p.canTriggerPipelineRuns);
  if (!PIPELINE_WORKFLOWS.includes(workflow as (typeof PIPELINE_WORKFLOWS)[number])) {
    throw new ServiceError("Unknown workflow", 400);
  }
  await triggerWorkflow(workflow);
}

/** Bundles `permissions` alongside the benchmarks the same way users.service.ts's listUsers
 * does — so models/page.tsx can decide whether to render <PipelineOpsPanel /> (needs
 * canTriggerPipelineRuns) without a second permission check. */
export async function getModelsPageData(
  requesterUid: string | null | undefined,
): Promise<{ benchmarks: ModelBenchmark[]; permissions: Awaited<ReturnType<typeof requirePermission>> }> {
  const permissions = await requirePermission(requesterUid, (p) => p.canAccessAdmin);
  const benchmarks = await getModelBenchmarks();
  return { benchmarks, permissions };
}
