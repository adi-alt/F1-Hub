import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { WorkflowRun } from "@/lib/github";

type RunsResponse = { workflow: string; runs: WorkflowRun[] }[];

const RUNS_KEY = ["pipeline-runs"] as const;

async function fetchRuns(): Promise<RunsResponse> {
  const res = await fetch("/api/models/runs");
  if (!res.ok) throw new Error(`${res.status}`);
  const body = (await res.json()) as { runs: RunsResponse };
  return body.runs;
}

export function usePipelineRuns() {
  return useQuery({ queryKey: RUNS_KEY, queryFn: fetchRuns });
}

async function postTrigger(workflow: string): Promise<void> {
  const res = await fetch("/api/models/trigger", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workflow }),
  });
  if (!res.ok) throw new Error(`${res.status}`);
}

export function useTriggerPipelineRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: postTrigger,
    onSuccess: async () => {
      // GitHub takes a moment to register a dispatched run before it shows up in the list.
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await queryClient.invalidateQueries({ queryKey: RUNS_KEY });
    },
  });
}
