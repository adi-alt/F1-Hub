import type { WorkflowRun } from "@/lib/github";

export type RunsResponse = { workflow: string; runs: WorkflowRun[] }[];

export async function fetchPipelineRuns(): Promise<RunsResponse> {
  const res = await fetch("/api/models/runs");
  if (!res.ok) throw new Error(`${res.status}`);
  const body = (await res.json()) as { runs: RunsResponse };
  return body.runs;
}

export async function triggerPipelineRun(workflow: string): Promise<void> {
  const res = await fetch("/api/models/trigger", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workflow }),
  });
  if (!res.ok) throw new Error(`${res.status}`);
}
